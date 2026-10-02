"""
Trios, paires et unités spéciales actuels de chaque équipe LNH — source : Daily Faceoff
(dailyfaceoff.com/teams/<équipe>/line-combinations), David, 2026-10-02.

Chaque page embarque ses données dans `<script id="__NEXT_DATA__">` (JSON) : 4 trios (f1-f4),
3 paires (d1-d3), gardiens (g), 2 unités d'avantage numérique (pp1, pp2), 2 de désavantage
(pk1, pk2) et les blessés (ir), avec la source de la mise à jour (« Last Game (date) »).
Complète MoneyPuck (stats des combinaisons réellement jouées, 5 contre 5 seulement) : ici c'est
« où joue-t-il en ce moment », avantage numérique compris — l'information la plus utile pour
évaluer un agent libre.

Les joueurs sont jumelés par nom + équipe (projections_common, même logique que les blessures) :
Daily Faceoff ne donne pas le nhl_id. Un joueur non jumelé est gardé avec son nom seul
(player_id NULL) pour que la feuille de match reste complète.

Remplacement complet par équipe (delete + insert). Garde-fou : une équipe dont la page ne donne
pas au moins 9 attaquants et 4 défenseurs est laissée telle quelle (page changée ou cassée).

Usage :
    python scrape_line_combos.py            # dry-run (lecture + jumelage, aucune écriture)
    python scrape_line_combos.py --apply    # écrit dans team_line_combos
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8')

import requests
from dotenv import load_dotenv
from supabase import create_client

from projections_common import build_player_lookup, match_player

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

BASE_URL = 'https://www.dailyfaceoff.com/teams/{slug}/line-combinations'
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    'Accept': 'text/html',
}
FIRST_SLUG = 'anaheim-ducks'  # n'importe quelle page donne la liste des 32 équipes (sortedTeams)
PAUSE_SECONDS = 1.0           # politesse : une page par seconde
NEXT_DATA_RE = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)

# Abréviations Daily Faceoff qui diffèrent de teams.code (à compléter si le script en signale).
TEAM_CODE_FIXES = {'NJ': 'NJD', 'SJ': 'SJS', 'TB': 'TBL', 'LA': 'LAK'}


def fetch_page(slug: str) -> dict:
    res = requests.get(BASE_URL.format(slug=slug), headers=HEADERS, timeout=30)
    res.raise_for_status()
    m = NEXT_DATA_RE.search(res.text)
    if not m:
        raise RuntimeError(f'__NEXT_DATA__ introuvable pour {slug} — page changée ?')
    return json.loads(m.group(1))['props']['pageProps']


def parse_team(page: dict) -> tuple[str, str | None, str | None, list[dict]]:
    """Retourne (code d'équipe, libellé de la source, date de mise à jour ISO, joueurs)."""
    combos = page.get('combinations') or {}
    code = (combos.get('teamAbbreviation') or '').upper()
    code = TEAM_CODE_FIXES.get(code, code)
    players = []
    seen: dict[str, int] = {}
    for p in combos.get('players') or []:
        group = p.get('groupIdentifier')
        name = (p.get('name') or '').strip()
        if not group or not name:
            continue
        slot = seen.get(group, 0) + 1
        seen[group] = slot
        players.append({
            'group_id': group,
            'category': p.get('categoryIdentifier'),
            'slot': slot,
            'position_id': p.get('positionIdentifier'),
            'name': name,
            'injury_status': p.get('injuryStatus'),
        })
    return code, combos.get('sourceName'), combos.get('updatedAt'), players


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    by_name_team, by_name, by_lastname_team = build_player_lookup(db)
    known_codes = {t['code'] for t in db.table('teams').select('code').execute().data}

    first = fetch_page(FIRST_SLUG)
    slugs = [t['slug'] for t in first.get('sortedTeams') or []]
    if len(slugs) < 30:
        print(f'[ERREUR] Seulement {len(slugs)} équipe(s) dans la liste Daily Faceoff — page changée ? Aucune écriture.')
        sys.exit(1)
    print(f'[INFO] {len(slugs)} équipes à lire.')

    now_iso = datetime.now(timezone.utc).isoformat()
    total_rows = total_unmatched = teams_written = 0
    skipped = []

    for slug in slugs:
        try:
            page = first if slug == FIRST_SLUG else fetch_page(slug)
        except Exception as e:
            print(f'[ATTENTION] {slug} : {e} — équipe laissée telle quelle.')
            skipped.append(slug)
            continue
        if slug != FIRST_SLUG:
            time.sleep(PAUSE_SECONDS)

        code, source_name, source_updated, players = parse_team(page)
        if code not in known_codes:
            print(f'[ATTENTION] {slug} : code d\'équipe inconnu « {code} » — à ajouter à TEAM_CODE_FIXES. Équipe ignorée.')
            skipped.append(slug)
            continue
        forwards = sum(1 for p in players if p['group_id'] in ('f1', 'f2', 'f3', 'f4'))
        defense = sum(1 for p in players if p['group_id'] in ('d1', 'd2', 'd3'))
        # Seuil volontairement bas : une équipe publie parfois un trio incomplet (blessure, joueur
        # pas encore confirmé) — on veut écarter une page cassée, pas un alignement à 11 attaquants.
        if forwards < 9 or defense < 4:
            print(f'[ATTENTION] {code} : alignement incomplet ({forwards} attaquants, {defense} défenseurs) — équipe laissée telle quelle.')
            skipped.append(slug)
            continue

        rows, unmatched = [], []
        for p in players:
            pid, _note = match_player(p['name'], code, by_name_team, by_name, by_lastname_team)
            if not pid:
                unmatched.append(p['name'])
            rows.append({
                'team_code': code,
                'group_id': p['group_id'],
                'slot': p['slot'],
                'category': p['category'],
                'position_id': p['position_id'],
                'player_id': pid,
                'player_name': p['name'],
                'injury_status': p['injury_status'],
                'source_name': source_name,
                'source_updated_at': source_updated,
                'scraped_at': now_iso,
            })
        unique_unmatched = sorted(set(unmatched))
        total_rows += len(rows)
        total_unmatched += len(unique_unmatched)
        print(f'[{code}] {len(rows)} ligne(s), {source_name or "source inconnue"}'
              + (f' — non jumelé(s) : {", ".join(unique_unmatched)}' if unique_unmatched else ''))

        if args.apply:
            db.table('team_line_combos').delete().eq('team_code', code).execute()
            db.table('team_line_combos').insert(rows).execute()
            teams_written += 1

    print(f'\n[RÉSUMÉ] {total_rows} ligne(s), {total_unmatched} joueur(s) non jumelé(s), '
          f'{len(skipped)} équipe(s) ignorée(s).')
    if not args.apply:
        print('[DRY-RUN] Aucune écriture. Relancez avec --apply pour importer.')
    else:
        print(f'[OK] {teams_written} équipe(s) mise(s) à jour.')
    # Trop d'équipes ignorées = page probablement changée : workflow en rouge.
    if len(skipped) > 5:
        sys.exit(1)


if __name__ == '__main__':
    main()
