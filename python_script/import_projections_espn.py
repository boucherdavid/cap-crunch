"""
Importe les projections de points ESPN (aide au choix des poolers, préparation de
repêchage/agents libres) dans player_projections. Usage ponctuel (une fois par saison),
pas un pipeline récurrent — la page ESPN (fantasy.espn.com/hockey/players/projections)
est rendue en JavaScript et nécessite une connexion, donc pas scrapable directement :
David colle le tableau depuis ESPN dans un fichier Excel, ce script en extrait les données.

Format brut attendu (3 lignes par joueur, tel que collé depuis ESPN — voir
excel/Import_Proj_ESPN_2026-2027.xlsx, onglet "Source") :
  Ligne 1 : NomNom (dupliqué), puis GP, G, A, +/-, PIM, PPP, ATOI, SOG en colonnes D à K
  Ligne 2 : Nom (propre, une seule fois)
  Ligne 3 : ÉQUPOS (ex: "COLF" = équipe COL + position F, collées sans espace)

Seuls Nom/Équipe/Points (buts+passes) sont importés dans player_projections — le reste
(GP, +/-, PIM, ATOI, SOG) reste dans le fichier Excel de David, pas stocké dans l'app.
Gardiens (position G) ignorés pour l'instant — projections de victoires prévues séparément.

Usage:
    python import_projections_espn.py <fichier.xlsx>                 # dry-run
    python import_projections_espn.py <fichier.xlsx> --sheet Source  # feuille précise
    python import_projections_espn.py <fichier.xlsx> --apply         # écrit réellement
"""

import argparse
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

import openpyxl
from dotenv import load_dotenv
from supabase import create_client

from projections_common import build_player_lookup, match_player, get_active_season

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

NHL_TEAM_CODES = {
    'ANA', 'BOS', 'BUF', 'CGY', 'CAR', 'CHI', 'COL', 'CBJ', 'DAL', 'DET',
    'EDM', 'FLA', 'LAK', 'MIN', 'MTL', 'NSH', 'NJD', 'NYI', 'NYR', 'OTT',
    'PHI', 'PIT', 'SEA', 'SJS', 'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK',
    'WPG', 'WSH',
}


def parse_raw_sheet(ws):
    """Retourne (records, erreurs) à partir du format brut ESPN collé (3 lignes/joueur)."""
    rows = list(ws.iter_rows(values_only=True))
    records, errors = [], []
    i = 0
    while i < len(rows):
        row = rows[i]
        gp = row[3] if len(row) > 3 else None
        if not isinstance(gp, (int, float)):
            i += 1
            continue
        # Ligne de stats détectée (GP numérique) — les 2 lignes suivantes doivent être
        # le nom propre puis équipe+position.
        goals = row[4] if len(row) > 4 else None
        assists = row[5] if len(row) > 5 else None
        if i + 2 >= len(rows):
            errors.append(f'Ligne {i + 1} : bloc incomplet (fin de fichier)')
            break
        name_row, teampos_row = rows[i + 1], rows[i + 2]
        name = (name_row[0] or '').strip() if name_row and name_row[0] else None
        teampos = (teampos_row[0] or '').strip() if teampos_row and teampos_row[0] else None
        if not name or not teampos or len(teampos) < 4:
            errors.append(f'Ligne {i + 1} : bloc mal formé (nom={name!r}, équipe/pos={teampos!r})')
            i += 1
            continue
        team, position = teampos[:-1], teampos[-1]
        if team not in NHL_TEAM_CODES or position not in ('F', 'D', 'G'):
            errors.append(f'Ligne {i + 1} : équipe/position non reconnue ({teampos!r}) pour {name}')
            i += 3
            continue
        points = int(goals) + int(assists) if isinstance(goals, (int, float)) and isinstance(assists, (int, float)) else None
        records.append({'name': name, 'team': team, 'position': position, 'points': points, 'row': i + 1})
        i += 3
    return records, errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('fichier')
    parser.add_argument('--sheet', default='Source')
    parser.add_argument('--season')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    wb = openpyxl.load_workbook(args.fichier, data_only=True)
    if args.sheet not in wb.sheetnames:
        raise SystemExit(f'[ERREUR] Feuille {args.sheet!r} introuvable. Feuilles disponibles : {wb.sheetnames}')
    ws = wb[args.sheet]

    records, parse_errors = parse_raw_sheet(ws)
    skaters = [r for r in records if r['position'] != 'G']
    goalies = [r for r in records if r['position'] == 'G']

    print(f'[INFO] {len(records)} bloc(s) reconnu(s) — {len(skaters)} patineur(s), {len(goalies)} gardien(s) ignoré(s).')
    if goalies:
        print('[INFO] Gardiens ignorés (source=espn ne gère pas les victoires pour l\'instant) :', ', '.join(g['name'] for g in goalies))
    if parse_errors:
        print(f'[ATTENTION] {len(parse_errors)} ligne(s) non reconnue(s) :')
        for e in parse_errors:
            print(f'  - {e}')

    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    season = args.season or get_active_season(db)
    print(f'[INFO] Saison ciblée : {season}')

    by_name_team, by_name, by_lastname_team = build_player_lookup(db)

    matched, unmatched, ambiguous = [], [], []
    for rec in skaters:
        pid, note = match_player(rec['name'], rec['team'], by_name_team, by_name, by_lastname_team)
        if pid:
            matched.append((rec, pid, note))
        elif note and 'même nom' in note:
            ambiguous.append((rec, note))
        else:
            unmatched.append((rec, note))

    print(f'\n[RÉSULTAT] {len(matched)} jumelé(s), {len(unmatched)} non trouvé(s), {len(ambiguous)} ambigu(s).')
    for rec, note in unmatched:
        print(f'  [NON TROUVÉ] {rec["name"]} ({rec["team"]}) — {note}')
    for rec, note in ambiguous:
        print(f'  [AMBIGU] {rec["name"]} ({rec["team"]}) — {note}')
    approx = [rec for rec, _, note in matched if note]
    if approx:
        print(f'\n[INFO] {len(approx)} jumelage(s) approximatif(s) (à vérifier) :')
        for rec, _, note in matched:
            if note:
                print(f'  [~] {rec["name"]} ({rec["team"]}) — {note}')

    if not args.apply:
        print('\n[DRY-RUN] Aucune écriture. Relancez avec --apply pour importer les jumelages ci-dessus.')
        return

    if not matched:
        print('\n[INFO] Rien à importer.')
        return

    confirm = input(f'\nImporter {len(matched)} projection(s) pour la saison {season} ? (oui/non) ')
    if confirm.strip().lower() != 'oui':
        print('Annulé.')
        return

    rows = [
        {'player_id': pid, 'season': season, 'source': 'espn', 'projected_points': rec['points']}
        for rec, pid, _ in matched
    ]
    db.table('player_projections').upsert(rows, on_conflict='player_id,season,source').execute()
    print(f'[OK] {len(rows)} projection(s) importée(s)/mise(s) à jour.')


if __name__ == '__main__':
    main()
