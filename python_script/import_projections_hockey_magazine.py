"""
Importe les projections du "Guide des Poolers 2026-2027" de Hockey Le Magazine (TOP 360
meilleurs marqueurs, tous postes mélangés, + TOP 100 défenseurs + TOP 40 gardiens) dans
player_projections, comme 4e source à côté de nhl_com/cbs/pool_pro — David, 2026-09-22.

Contrairement à Pool Pro, ce magazine présente un seul classement combiné attaquants+défenseurs
par points (TOP 360) plutôt que des tableaux séparés par position. Le TOP 100 Défenseurs est
largement redondant avec le TOP 360 (mêmes joueurs, mêmes points) sauf pour les défenseurs les
moins productifs (~22 joueurs, rangs 79-100, sous la coupure du TOP 360) — ajoutés à la suite
dans le CSV plutôt que dans un onglet séparé, pour ne rien dupliquer.

Données transcrites à la main depuis des photos (voir photos/Hockey_Magazine_*.jpg) dans
source/hockey_magazine_2026_27.csv (rang, nom, équipe, is_goalie, valeur — valeur = points pour
un patineur, victoires pour un gardien). Codes d'équipe déjà normalisés aux codes LNH standards
dans ce CSV (ex: 'WIN' -> 'WPG', 'CAL' -> 'CGY', 'FLO' -> 'FLA'). Quelques gardiens en fin de
liste avaient un code d'équipe illisible sur la photo (imprimé derrière une image) — laissés
sans équipe, jumelés par nom seul.

Comme pour CBS (David, 2026-09-22), deux lignes source différentes peuvent jumeler sur la même
fiche en base si notre base ne connaît qu'un seul de deux joueurs réels homonymes — la fonction
dedup_by_player() ne garde que le meilleur jumelage par joueur plutôt que de laisser le dernier
écraser le premier en silence.

Usage:
    python import_projections_hockey_magazine.py                    # dry-run
    python import_projections_hockey_magazine.py --apply             # écrit réellement
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
CSV_PATH = os.path.join(BASE_DIR, 'source', 'hockey_magazine_2026_27.csv')
SOURCE = 'hockey_magazine'

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

    # Même garde-fou que import_projections_cbs.py (David, 2026-09-22) : le TOP 360 et le TOP
    # 100 Défenseurs se chevauchent volontairement (voir docstring) — si notre base ne connaît
    # qu'un seul de deux joueurs réels homonymes, les deux lignes source jumelleraient sur la
    # même fiche et la dernière écraserait la première en silence à l'écriture.
    def dedup_by_player(matched):
        by_pid = {}
        for rec, pid, note in matched:
            by_pid.setdefault(pid, []).append((rec, pid, note))
        kept, collisions = [], []
        for pid, group in by_pid.items():
            if len(group) == 1:
                kept.append(group[0])
                continue
            exact = [g for g in group if g[2] is None]
            chosen = exact[0] if exact else group[0]
            kept.append(chosen)
            collisions.append((chosen, [g for g in group if g is not chosen]))
        return kept, collisions

    def report(label, matched, unmatched, ambiguous, collisions=None):
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
        if collisions:
            print(f'  {len(collisions)} collision(s) — même joueur en base pour 2 lignes source différentes (conservé un seul, écarté les autres) :')
            for chosen, dropped in collisions:
                chosen_rec = chosen[0]
                print(f'    [!] {chosen_rec["name"]} ({chosen_rec["team"] or "?"}) = {chosen_rec["value"]} — conservé')
                for rec, _, _ in dropped:
                    print(f'        écarté : {rec["name"]} ({rec["team"] or "?"}) = {rec["value"]}')

    skater_matched_raw, skater_unmatched, skater_ambiguous = resolve(skaters)
    goalie_matched_raw, goalie_unmatched, goalie_ambiguous = resolve(goalies)
    skater_matched, skater_collisions = dedup_by_player(skater_matched_raw)
    goalie_matched, goalie_collisions = dedup_by_player(goalie_matched_raw)
    report('PATINEURS', skater_matched, skater_unmatched, skater_ambiguous, skater_collisions)
    report('GARDIENS', goalie_matched, goalie_unmatched, goalie_ambiguous, goalie_collisions)

    # Contrôle de cohérence : compare aux projections NHL.com déjà en base.
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
            print(f'\n[ATTENTION] {len(suspects)} projection(s) Hockey Le Magazine très éloignée(s) de NHL.com (>40 pts d\'écart) :')
            for rec, ref in suspects:
                print(f'  [!] {rec["name"]} ({rec["team"] or "?"}) — HLM={rec["value"]} pts, NHL.com={ref} pts')

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
