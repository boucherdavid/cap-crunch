"""
Importe les projections du magazine "Pool Pro" (Prévisions 2026-2027, TOP 400) dans
player_projections, comme troisième source à côté de nhl_com/cbs — David, 2026-09-22.

Contrairement à CBS (collé directement depuis le site), ce magazine n'existe qu'en papier : les
données ont été transcrites à la main depuis des photos (voir photos/Pool_Pro-*.jpg) dans
source/pool_pro_2026_27.csv (rang, nom, équipe, is_goalie, valeur — valeur = points pour un
patineur, victoires pour un gardien). Les codes d'équipe du magazine ont déjà été normalisés aux
codes LNH standards dans ce CSV (ex: 'FLO' du magazine -> 'FLA' en base). Quelques joueurs sans
équipe au moment de l'impression (agent libre) ont une équipe vide dans le CSV — jumelés par nom
seul.

Usage:
    python import_projections_pool_pro.py                    # dry-run
    python import_projections_pool_pro.py --apply            # écrit réellement
"""

import argparse
import csv
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
from supabase import create_client

from projections_common import build_player_lookup, match_player, get_active_season

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
CSV_PATH = os.path.join(BASE_DIR, 'source', 'pool_pro_2026_27.csv')
SOURCE = 'pool_pro'

NHL_TEAM_CODES = {
    'ANA', 'BOS', 'BUF', 'CAR', 'CBJ', 'CGY', 'CHI', 'COL', 'DAL', 'DET',
    'EDM', 'FLA', 'LAK', 'MIN', 'MTL', 'NJD', 'NSH', 'NYI', 'NYR', 'OTT',
    'PHI', 'PIT', 'SEA', 'SJS', 'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK',
    'WPG', 'WSH',
}


def load_csv():
    skaters, goalies, errors = [], [], []
    with open(CSV_PATH, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            team = (row['equipe'] or '').strip() or None
            if team and team not in NHL_TEAM_CODES:
                errors.append(f"Rang {row['rang']} : code équipe {team!r} non reconnu pour {row['nom']!r}")
                continue
            is_goalie = row['is_goalie'] == '1'
            rec = {'name': row['nom'].strip(), 'team': team, 'value': int(row['valeur'])}
            (goalies if is_goalie else skaters).append(rec)
    return skaters, goalies, errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--season')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    skaters, goalies, parse_errors = load_csv()
    print(f'[INFO] CSV : {len(skaters)} patineur(s), {len(goalies)} gardien(s).')
    if parse_errors:
        print(f'[ATTENTION] {len(parse_errors)} ligne(s) ignorée(s) :')
        for e in parse_errors:
            print(f'  - {e}')

    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    season = args.season or get_active_season(db)
    print(f'[INFO] Saison ciblée : {season}')

    by_name_team, by_name, by_lastname_team = build_player_lookup(db)

    def resolve(recs):
        matched, unmatched, ambiguous = [], [], []
        for rec in recs:
            pid, note = match_player(rec['name'], rec['team'], by_name_team, by_name, by_lastname_team)
            if pid:
                matched.append((rec, pid, note))
            elif note and 'même nom' in note:
                ambiguous.append((rec, note))
            else:
                unmatched.append((rec, note))
        return matched, unmatched, ambiguous

    def report(label, matched, unmatched, ambiguous):
        print(f'\n[{label}] {len(matched)} jumelé(s), {len(unmatched)} non trouvé(s), {len(ambiguous)} ambigu(s).')
        for rec, note in unmatched:
            print(f'  [NON TROUVÉ] {rec["name"]} ({rec["team"] or "?"}) — {note}')
        for rec, note in ambiguous:
            print(f'  [AMBIGU] {rec["name"]} ({rec["team"] or "?"}) — {note}')
        approx = [(rec, note) for rec, _, note in matched if note]
        if approx:
            print(f'  {len(approx)} jumelage(s) approximatif(s) (à vérifier) :')
            for rec, note in approx:
                print(f'    [~] {rec["name"]} ({rec["team"] or "?"}) — {note}')

    skater_matched, skater_unmatched, skater_ambiguous = resolve(skaters)
    goalie_matched, goalie_unmatched, goalie_ambiguous = resolve(goalies)
    report('PATINEURS', skater_matched, skater_unmatched, skater_ambiguous)
    report('GARDIENS', goalie_matched, goalie_unmatched, goalie_ambiguous)

    # Contrôle de cohérence : compare aux projections NHL.com déjà en base (même patron que
    # import_projections_cbs.py).
    player_ids = [pid for _, pid, _ in skater_matched]
    if player_ids:
        existing = db.table('player_projections').select('player_id, projected_points') \
            .eq('season', season).eq('source', 'nhl_com').in_('player_id', player_ids).execute()
        nhl_points = {row['player_id']: row['projected_points'] for row in existing.data if row['projected_points'] is not None}
        suspects = []
        for rec, pid, _ in skater_matched:
            ref = nhl_points.get(pid)
            if ref is not None and abs(rec['value'] - ref) > 40:
                suspects.append((rec, ref))
        if suspects:
            print(f'\n[ATTENTION] {len(suspects)} projection(s) Pool Pro très éloignée(s) de NHL.com (>40 pts d\'écart) :')
            for rec, ref in suspects:
                print(f'  [!] {rec["name"]} ({rec["team"] or "?"}) — Pool Pro={rec["value"]} pts, NHL.com={ref} pts')

    if not args.apply:
        print('\n[DRY-RUN] Aucune écriture. Relancez avec --apply pour importer les jumelages ci-dessus.')
        return

    all_matched = skater_matched + goalie_matched
    if not all_matched:
        print('\n[INFO] Rien à importer.')
        return

    confirm = input(f'\nImporter {len(all_matched)} projection(s) pour la saison {season} ? (oui/non) ')
    if confirm.strip().lower() != 'oui':
        print('Annulé.')
        return

    rows = []
    for rec, pid, _ in skater_matched:
        rows.append({'player_id': pid, 'season': season, 'source': SOURCE, 'projected_points': rec['value']})
    for rec, pid, _ in goalie_matched:
        rows.append({'player_id': pid, 'season': season, 'source': SOURCE, 'projected_wins': rec['value']})
    db.table('player_projections').upsert(rows, on_conflict='player_id,season,source').execute()
    print(f'[OK] {len(rows)} projection(s) importée(s)/mise(s) à jour.')


if __name__ == '__main__':
    main()
