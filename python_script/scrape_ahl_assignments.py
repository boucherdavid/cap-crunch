"""
Joueurs actuellement dans la Ligue américaine (David, 2026-11-04) — badge « AHL » dans l'app —
et joueurs laissés de côté par leur équipe de la LNH (badge banc, player_lineup_status, même jour ;
voir compute_lineup : 32 calendriers de plus, et les matchs joués déjà importés).

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
from datetime import date, datetime, timedelta, timezone

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
NHL_SCHEDULE = 'https://api-web.nhle.com/v1/club-schedule-season/{code}/now'
# Fenêtre des matchs ratés : au-delà, le compte plafonne (badge affiché depuis longtemps déjà).
LINEUP_WINDOW_DAYS = 45
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


def fetch_nhl_rosters(codes: list[str]) -> tuple[dict[int, str], int]:
    """nhl_id → équipe de la LNH dont il est dans l'alignement actuel."""
    ids: dict[int, str] = {}
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
                ids[int(p['id'])] = code
        time.sleep(PAUSE_SECONDS)
    return ids, read


def fetch_team_games(codes: list[str], min_date: date, today: date) -> dict[str, list[str]]:
    """Dates des matchs terminés (saison régulière ou séries) de chaque équipe depuis `min_date`."""
    out: dict[str, list[str]] = {}
    for code in codes:
        try:
            res = requests.get(NHL_SCHEDULE.format(code=code), headers=HEADERS, timeout=TIMEOUT)
            res.raise_for_status()
            games = res.json().get('games') or []
        except Exception as e:  # noqa: BLE001
            print(f'[ATTENTION] Calendrier {code} : {e}')
            continue
        out[code] = sorted({
            g['gameDate'] for g in games
            if g.get('gameType') in (2, 3) and g.get('gameState') in ('OFF', 'FINAL')
            and min_date.isoformat() <= g['gameDate'] < today.isoformat()
        })
        time.sleep(PAUSE_SECONDS)
    return out


def compute_lineup(db, nhl_team_by_id: dict[int, str], pid_by_nhl: dict[int, int], ahl_ids: set[int],
                   today: date) -> tuple[list[dict], dict[str, list[str]]]:
    """Matchs consécutifs ratés par chaque joueur de notre base présent dans un alignement de la LNH.

    Ne comptent que les matchs de son équipe déjà importés dans player_game_logs (une date sans
    aucune ligne : l'import de nuit n'est pas encore passé), joués depuis son arrivée dans cet
    alignement (`on_roster_since`, pour ne pas compter les matchs d'avant un rappel ou un échange)
    et après son dernier match joué."""
    window_start = today - timedelta(days=LINEUP_WINDOW_DAYS)
    codes = sorted(set(nhl_team_by_id.values()))
    team_games = fetch_team_games(codes, window_start, today)
    logs = fetch_all(lambda: db.table('player_game_logs').select('id, nhl_id, game_date')
                     .gte('game_date', window_start.isoformat()).in_('game_type', [2, 3]).order('id'))
    imported_dates = {r['game_date'] for r in logs}
    played: dict[int, set[str]] = {}
    for r in logs:
        played.setdefault(int(r['nhl_id']), set()).add(r['game_date'])

    try:
        existing = fetch_all(lambda: db.table('player_lineup_status').select('player_id, team_code, on_roster_since')
                             .order('player_id'))
    except Exception as e:  # noqa: BLE001 — table absente (migration pas encore roulée) : dry-run quand même
        print(f'[ATTENTION] player_lineup_status illisible ({e}) — premier passage supposé.')
        existing = []
    existing_by_id = {r['player_id']: r for r in existing}
    # Premier passage (table vide) : tout le monde est réputé là depuis le début de la fenêtre.
    first_run = not existing

    rows = []
    for nhl_id, code in nhl_team_by_id.items():
        pid = pid_by_nhl.get(nhl_id)
        if not pid or pid in ahl_ids or code not in team_games:
            continue
        old = existing_by_id.get(pid)
        if old and old['team_code'] == code:
            since = old['on_roster_since']
        else:
            since = window_start.isoformat() if first_run else today.isoformat()
        dates = played.get(nhl_id, set())
        last_played = max(dates) if dates else None
        missed = sum(1 for d in team_games[code]
                     if d in imported_dates and d >= since and (last_played is None or d > last_played))
        rows.append({'player_id': pid, 'team_code': code, 'on_roster_since': since,
                     'games_missed': missed, 'last_played': last_played})
    return rows, team_games


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
    nhl_team_by_id, nhl_teams_read = fetch_nhl_rosters(nhl_codes)
    nhl_ids = set(nhl_team_by_id)
    print(f'[INFO] LNH : {len(nhl_ids)} joueur(s), {nhl_teams_read} équipe(s) lue(s).')
    if nhl_teams_read < MIN_NHL_TEAMS or len(nhl_ids) < MIN_NHL_PLAYERS:
        print('[ERREUR] Lecture de la LNH incomplète — aucune écriture.')
        sys.exit(1)

    by_name_team, by_name, by_lastname_team = build_player_lookup(db)
    info = {p['id']: p for p in fetch_all(lambda: db.table('players').select('id, nhl_id, age, position, teams(code)').order('id'))}
    pid_by_nhl = {int(p['nhl_id']): pid for pid, p in info.items() if p.get('nhl_id')}

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

    lineup_rows, team_games = compute_lineup(db, nhl_team_by_id, pid_by_nhl, set(rows), today)
    missed = sorted((r for r in lineup_rows if r['games_missed'] >= 2), key=lambda r: -r['games_missed'])
    print(f'[INFO] Alignements LNH : {len(lineup_rows)} joueur(s) suivi(s), calendrier de {len(team_games)} '
          f'équipe(s), {len(missed)} sans match depuis 2 matchs de son équipe ou plus.')

    if not args.apply:
        print('[INFO] Matchs consécutifs ratés (2 et plus) :')
        for r in missed:
            p = info.get(r['player_id'], {})
            print(f"  {r['games_missed']:>2}  {r['team_code']}  {p.get('position') or '?':3} "
                  f"{r['player_id']:>5}  dernier match : {r['last_played']}")
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
    print(f'[OK] AHL : {len(to_insert)} ajout(s), {len(to_update)} changement(s) de club, {len(to_delete)} retour(s) '
          f'ou retrait(s). Lignes inchangées non réécrites.')

    if len(team_games) < MIN_NHL_TEAMS:
        print('[ERREUR] Calendriers de la LNH incomplets — matchs ratés non mis à jour.')
        sys.exit(1)
    existing = fetch_all(lambda: db.table('player_lineup_status')
                         .select('player_id, team_code, on_roster_since, games_missed, last_played').order('player_id'))
    to_insert, to_update, to_delete = diff_rows(lineup_rows, existing, ['player_id'],
                                                ['team_code', 'on_roster_since', 'games_missed', 'last_played'])
    changed = to_insert + to_update
    for i in range(0, len(changed), 500):
        db.table('player_lineup_status').upsert(changed[i:i + 500], on_conflict='player_id').execute()
    ids = [r['player_id'] for r in to_delete]
    for i in range(0, len(ids), 200):
        db.table('player_lineup_status').delete().in_('player_id', ids[i:i + 200]).execute()
    print(f'[OK] Alignements LNH : {len(to_insert)} ajout(s), {len(to_update)} mise(s) à jour, '
          f'{len(to_delete)} retrait(s).')


if __name__ == '__main__':
    main()
