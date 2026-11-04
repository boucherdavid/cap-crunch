"""
Joueurs actuellement dans la Ligue américaine (David, 2026-11-04) — badge « AHL » dans l'app.

Deux lectures par jour, 64 appels au total, aucune par visite de l'app :
- les alignements actuels des 32 clubs de l'AHL (HockeyTech, même fournisseur et même clé
  publique que /statistiques/ahl, voir app/lib/ahl-stats.ts) ;
- les alignements actuels des 32 équipes de la LNH (api-web.nhle.com).

Règle : un joueur est « en AHL » s'il figure dans un alignement de l'AHL et dans AUCUN alignement
de la LNH. L'absence d'un alignement de la LNH ne suffit pas à elle seule : des blessés de longue
durée en sont retirés (Larkin, Barzal, Domi, vérifié le 2026-11-04). Inversement, un joueur
rappelé disparaît de l'alignement de l'AHL (8 joueurs seulement dans les deux, même vérification) ;
dans le doute, l'alignement de la LNH l'emporte.

Jumelage aux fiches `players` : HockeyTech ne donne pas le nhl_id. Le club de la LNH affilié à
chaque club de l'AHL est déduit des données (équipe la plus fréquente parmi ses joueurs jumelés
par nom seul), puis chaque joueur est jumelé par nom + club affilié (projections_common, mêmes
paliers que les blessures et les trios). Un jumelage sur le nom seul est rejeté si l'âge en base
ne concorde pas avec la date de naissance de HockeyTech (homonymes).

N'écrit que les lignes qui changent (db_diff.py). `since` = premier jour où le joueur a été vu
dans ce club ; il repart à zéro s'il change de club ou après un rappel.

Usage :
    python scrape_ahl_assignments.py            # dry-run (lecture + jumelage, aucune écriture)
    python scrape_ahl_assignments.py --apply    # écrit dans player_ahl_assignments
"""

import argparse
import json
import os
import sys
import time
from collections import Counter
from datetime import date, datetime, timezone

sys.stdout.reconfigure(encoding='utf-8')

import requests
from dotenv import load_dotenv
from supabase import create_client

from db_diff import diff_rows, fetch_all
from projections_common import build_player_lookup, match_player

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

AHL_BASE = 'https://lscluster.hockeytech.com/feed/index.php'
AHL_PARAMS = {'key': 'ccb91f29d6744675', 'client_code': 'ahl', 'fmt': 'json', 'lang': 'en',
              'site_id': '3', 'league_id': '4'}
NHL_ROSTER = 'https://api-web.nhle.com/v1/roster/{code}/current'
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36'}
PAUSE_SECONDS = 0.3
TIMEOUT = 20

# Garde-fous : en dessous, une source a changé ou répond mal — aucune écriture.
MIN_AHL_TEAMS = 28
MIN_AHL_PLAYERS = 500
MIN_NHL_TEAMS = 30
MIN_NHL_PLAYERS = 600
# Écart d'âge toléré pour accepter un jumelage sur le nom seul (players.age est arrondi).
AGE_TOLERANCE = 1.5
# Part minimale des joueurs jumelés qui doivent pointer vers le même club de la LNH pour
# retenir l'affiliation d'un club de l'AHL (sinon : club indépendant, nom + équipe impossible).
MIN_AFFILIATE_SHARE = 0.5


def ahl_get(**params) -> dict:
    res = requests.get(AHL_BASE, params={**params, **AHL_PARAMS}, headers=HEADERS, timeout=TIMEOUT)
    res.raise_for_status()
    text = res.text.strip()
    # Réponses enveloppées dans des parenthèses même avec fmt=json (format JSONP hérité).
    if text.startswith('(') and text.endswith(')'):
        text = text[1:-1]
    return json.loads(text)


def current_ahl_season() -> str:
    seasons = ahl_get(feed='modulekit', view='seasons')['SiteKit']['Seasons']
    regular = [s for s in seasons if 'Regular Season' in (s.get('season_name') or '')]
    if not regular:
        raise SystemExit('[ERREUR] Aucune saison régulière dans la liste HockeyTech. Aucune écriture.')
    # Liste triée de la plus récente à la plus ancienne ; la saison à venir y figure dès l'été,
    # avec ses alignements de camp — c'est bien elle qu'on veut.
    return regular[0]['season_id']


def fetch_ahl_rosters(season_id: str) -> tuple[list[dict], int]:
    teams = ahl_get(feed='modulekit', view='teamsbyseason', season_id=season_id)['SiteKit']['Teamsbyseason']
    players, read = [], 0
    for t in teams:
        try:
            roster = ahl_get(feed='modulekit', view='roster', season_id=season_id, team_id=t['id'])['SiteKit']['Roster']
        except Exception as e:  # noqa: BLE001 — une équipe en échec ne doit pas tout arrêter
            print(f'[ATTENTION] AHL {t.get("code")} : {e}')
            continue
        read += 1
        for p in roster:
            if not isinstance(p, dict) or not p.get('first_name') or not p.get('last_name'):
                continue  # lignes d'en-tête du flux (personnel, sections)
            players.append({
                'name': f"{p['first_name'].strip()} {p['last_name'].strip()}",
                'birthdate': p.get('birthdate') or None,
                'team_code': t['code'],
                'team_name': t['name'],
            })
        time.sleep(PAUSE_SECONDS)
    return players, read


def fetch_nhl_roster_ids(codes: list[str]) -> tuple[set[int], int]:
    ids: set[int] = set()
    read = 0
    for code in codes:
        try:
            res = requests.get(NHL_ROSTER.format(code=code), headers=HEADERS, timeout=TIMEOUT)
            res.raise_for_status()
            data = res.json()
        except Exception as e:  # noqa: BLE001
            print(f'[ATTENTION] LNH {code} : {e}')
            continue
        read += 1
        for group in ('forwards', 'defensemen', 'goalies'):
            for p in data.get(group) or []:
                ids.add(int(p['id']))
        time.sleep(PAUSE_SECONDS)
    return ids, read


def age_on(birthdate: str | None, today: date) -> float | None:
    if not birthdate:
        return None
    try:
        b = date.fromisoformat(birthdate)
    except ValueError:
        return None
    return (today - b).days / 365.25


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    today = datetime.now(timezone.utc).date()

    season_id = current_ahl_season()
    ahl_players, ahl_teams_read = fetch_ahl_rosters(season_id)
    print(f'[INFO] AHL (saison HockeyTech {season_id}) : {len(ahl_players)} joueur(s), {ahl_teams_read} club(s) lu(s).')
    if ahl_teams_read < MIN_AHL_TEAMS or len(ahl_players) < MIN_AHL_PLAYERS:
        print('[ERREUR] Lecture de l\'AHL incomplète — aucune écriture.')
        sys.exit(1)

    nhl_codes = sorted({t['code'] for t in db.table('teams').select('code').execute().data if t.get('code')})
    nhl_ids, nhl_teams_read = fetch_nhl_roster_ids(nhl_codes)
    print(f'[INFO] LNH : {len(nhl_ids)} joueur(s), {nhl_teams_read} équipe(s) lue(s).')
    if nhl_teams_read < MIN_NHL_TEAMS or len(nhl_ids) < MIN_NHL_PLAYERS:
        print('[ERREUR] Lecture de la LNH incomplète — aucune écriture.')
        sys.exit(1)

    by_name_team, by_name, by_lastname_team = build_player_lookup(db)
    info = {p['id']: p for p in fetch_all(lambda: db.table('players').select('id, nhl_id, age, teams(code)').order('id'))}

    # 1. Club affilié de chaque club de l'AHL, déduit des joueurs jumelés par nom seul.
    votes: dict[str, Counter] = {}
    for p in ahl_players:
        pid, _ =match_player(p['name'], '__aucune__', by_name_team, by_name)
        team = (info.get(pid, {}).get('teams') or {}).get('code') if pid else None
        if team:
            votes.setdefault(p['team_code'], Counter())[team] += 1
    affiliate: dict[str, str] = {}
    for ahl_code, counter in votes.items():
        team, n = counter.most_common(1)[0]
        if n / sum(counter.values()) >= MIN_AFFILIATE_SHARE:
            affiliate[ahl_code] = team
    print('[INFO] Affiliations déduites : ' + ', '.join(f'{a}→{n}' for a, n in sorted(affiliate.items())))

    # 2. Jumelage et règle « dans l'AHL et dans aucun alignement de la LNH ».
    rows: dict[int, dict] = {}
    rejected_age, unmatched, in_nhl, loose = [], 0, 0, []
    for p in ahl_players:
        parent = affiliate.get(p['team_code'], '__aucune__')
        pid, note = match_player(p['name'], parent, by_name_team, by_name, by_lastname_team)
        if not pid:
            unmatched += 1
            continue
        player = info.get(pid, {})
        if note:  # pas un jumelage nom + club affilié : vérifier l'âge
            src_age, db_age = age_on(p['birthdate'], today), player.get('age')
            if src_age is not None and db_age is not None and abs(float(db_age) - src_age) > AGE_TOLERANCE:
                rejected_age.append(f"{p['name']} ({p['team_code']}, {src_age:.1f} ans vs {float(db_age):.1f} en base)")
                continue
        if note and not args.apply:
            loose.append(f"{p['name']} ({p['team_code']}) : {note}")
        if player.get('nhl_id') and int(player['nhl_id']) in nhl_ids:
            in_nhl += 1
            continue
        rows[pid] = {'player_id': pid, 'ahl_team_code': p['team_code'], 'ahl_team_name': p['team_name']}

    print(f'[INFO] {len(rows)} joueur(s) de notre base en AHL, {in_nhl} écarté(s) (aussi dans un '
          f'alignement de la LNH), {unmatched} non jumelé(s) (absents de notre base pour la plupart).')
    if rejected_age:
        print('[INFO] Rejetés (âge différent, homonyme probable) : ' + '; '.join(rejected_age))

    if not args.apply:
        print(f'[INFO] {len(loose)} jumelage(s) sans le club affilié (à vérifier) :')
        for line in loose:
            print('  ' + line)
        print('[DRY-RUN] Aucune écriture. Relancez avec --apply pour importer.')
        return

    existing = fetch_all(lambda: db.table('player_ahl_assignments')
                         .select('player_id, ahl_team_code, ahl_team_name, since').order('player_id'))
    existing_by_id = {r['player_id']: r for r in existing}
    new_rows = []
    for pid, r in rows.items():
        old = existing_by_id.get(pid)
        # `since` gardé tant que le joueur reste dans le même club.
        since = old['since'] if old and old['ahl_team_code'] == r['ahl_team_code'] else today.isoformat()
        new_rows.append({**r, 'since': since})
    to_insert, to_update, to_delete = diff_rows(new_rows, existing, ['player_id'],
                                                ['ahl_team_code', 'ahl_team_name', 'since'])
    if to_insert or to_update:
        db.table('player_ahl_assignments').upsert(to_insert + to_update, on_conflict='player_id').execute()
    ids = [r['player_id'] for r in to_delete]
    for i in range(0, len(ids), 200):
        db.table('player_ahl_assignments').delete().in_('player_id', ids[i:i + 200]).execute()
    print(f'[OK] {len(to_insert)} ajout(s), {len(to_update)} changement(s) de club, {len(to_delete)} retour(s) '
          f'ou retrait(s). Lignes inchangées non réécrites.')


if __name__ == '__main__':
    main()
