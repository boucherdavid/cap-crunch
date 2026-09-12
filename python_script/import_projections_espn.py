"""
Importe les projections ESPN (aide au choix des poolers, préparation de repêchage/agents
libres) dans player_projections. Usage ponctuel (une fois par saison), pas un pipeline
récurrent — la page ESPN (fantasy.espn.com/hockey/players/projections) est rendue en
JavaScript et nécessite une connexion, donc pas scrapable directement : David colle les
tableaux depuis ESPN dans un fichier Excel (un onglet par groupe : Attaquants, Defenseurs,
Gardiens), ce script en extrait les données.

Format brut attendu par bloc de 3 lignes/joueur (tel que collé depuis ESPN) :
  Ligne 1 : NomNom (dupliqué) + statistiques réelles du joueur (colonnes D à K)
  Ligne 2 : Nom (propre, une seule fois) — porte ses PROPRES chiffres dans les mêmes colonnes,
            mais ce sont des valeurs différentes de la ligne 1 (artefact du rendu ESPN — seule
            la ligne 1 du bloc est fiable, jamais utilisée pour autre chose que confirmer où le
            bloc suivant commence)
  Ligne 3 : ÉQUPOS (ex: "COLF" = équipe COL + position F, "TBF" = Tampa Bay + F — ESPN utilise
            parfois un code équipe à 2 lettres au lieu des 3 lettres standards, voir
            ESPN_TEAM_ALIASES)

Le nombre de lignes par bloc n'est pas garanti (ex: une ligne de statut "DTD" supplémentaire
pour un joueur blessé) — plutôt que de compter un nombre fixe de lignes, le parseur cherche
activement la prochaine ligne "ÉQUPOS" reconnaissable après chaque ligne de statistiques, ce
qui le resynchronise tout seul si un bloc a une forme inattendue (contrairement à une première
version de ce script qui perdait le fil dès la première anomalie et produisait des jumelages
silencieusement faux pour le reste du fichier).

Colonnes utiles selon la feuille (colonnes D+ à partir de l'index 3) :
  Attaquants/Defenseurs : D=GP, E=G (buts), F=A (passes) → projected_points = E+F
  Gardiens               : D=GS, E=W (victoires) → projected_wins = E

Seuls Nom/Équipe/Position/Points ou Victoires sont importés — le reste (GP, +/-, PIM, ATOI,
SOG, GAA, SV%...) reste dans le fichier Excel de David, pas stocké dans l'app.

Un contrôle de cohérence compare chaque projection de points patineur à la projection NHL.com
déjà en base (si présente) — un grand écart (>40 pts) est un signal fort d'un bloc mal aligné
(nom associé aux mauvaises statistiques), pas une simple divergence d'opinion entre les deux
sites.

Usage:
    python import_projections_espn.py <fichier.xlsx>              # dry-run
    python import_projections_espn.py <fichier.xlsx> --apply       # écrit réellement
"""

import argparse
import os
import re
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

SHEETS = ['Attaquants', 'Defenseurs', 'Gardiens']

NHL_TEAM_CODES = {
    'ANA', 'BOS', 'BUF', 'CGY', 'CAR', 'CHI', 'COL', 'CBJ', 'DAL', 'DET',
    'EDM', 'FLA', 'LAK', 'MIN', 'MTL', 'NSH', 'NJD', 'NYI', 'NYR', 'OTT',
    'PHI', 'PIT', 'SEA', 'SJS', 'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK',
    'WPG', 'WSH',
}
# ESPN abrège certaines équipes sur 2 lettres plutôt que les 3 lettres standards de la LNH.
ESPN_TEAM_ALIASES = {'TB': 'TBL', 'SJ': 'SJS', 'LA': 'LAK', 'NJ': 'NJD'}
TEAMPOS_RE = re.compile(r'^([A-Z]{2,3})([FDG])$')

LOOKAHEAD = 6  # lignes max à examiner après une ligne de stats pour retrouver l'équipe+position


def normalize_team(code: str) -> str:
    return ESPN_TEAM_ALIASES.get(code, code)


def dedupe_name(raw: str) -> str:
    """'Nathan MacKinnonNathan MacKinnon' -> 'Nathan MacKinnon' ; laisse intact si pas dupliqué."""
    n = len(raw)
    if n % 2 == 0 and raw[:n // 2] == raw[n // 2:]:
        return raw[:n // 2]
    return raw


def parse_raw_sheet(ws):
    """Retourne (records, erreurs). record = {name, team, position, points|None, wins|None, row}.
    'FA' (agent libre, sans équipe) est accepté avec team=None — le jumelage retombe alors sur
    le nom seul plutôt que nom+équipe."""
    rows = list(ws.iter_rows(values_only=True))
    records, errors = [], []
    i = 0
    while i < len(rows):
        row = rows[i]
        first_stat = row[3] if len(row) > 3 else None
        if not isinstance(first_stat, (int, float)):
            i += 1
            continue

        name = dedupe_name((row[0] or '').strip())
        val_a = row[4] if len(row) > 4 else None
        val_b = row[5] if len(row) > 5 else None

        teampos = team = position = None
        j = i + 1
        while j < len(rows) and j <= i + LOOKAHEAD:
            candidate = (rows[j][0] or '').strip() if rows[j] and rows[j][0] else ''
            m = TEAMPOS_RE.match(candidate)
            if m:
                prefix, position = m.group(1), m.group(2)
                team = None if prefix == 'FA' else normalize_team(prefix)
                teampos = candidate
                break
            j += 1

        if teampos is None:
            errors.append(f'Ligne {i + 1} : équipe/position introuvable dans les {LOOKAHEAD} lignes suivant {name!r}')
            i += 1
            continue
        if team is not None and team not in NHL_TEAM_CODES:
            errors.append(f'Ligne {i + 1} : code équipe {teampos!r} non reconnu pour {name!r}')
            i = j + 1
            continue

        points = wins = None
        if position == 'G':
            if isinstance(val_a, (int, float)):
                wins = int(val_a)
        else:
            if isinstance(val_a, (int, float)) and isinstance(val_b, (int, float)):
                points = int(val_a) + int(val_b)

        records.append({'name': name, 'team': team, 'position': position, 'points': points, 'wins': wins, 'row': i + 1})
        i = j + 1
    return records, errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('fichier')
    parser.add_argument('--season')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    wb = openpyxl.load_workbook(args.fichier, data_only=True)

    records, parse_errors = [], []
    for sheet_name in SHEETS:
        if sheet_name not in wb.sheetnames:
            print(f'[INFO] Feuille {sheet_name!r} absente du fichier — ignorée.')
            continue
        sheet_records, sheet_errors = parse_raw_sheet(wb[sheet_name])
        print(f'[INFO] {sheet_name} : {len(sheet_records)} bloc(s) reconnu(s), {len(sheet_errors)} ligne(s) non reconnue(s).')
        records.extend(sheet_records)
        parse_errors.extend(f'{sheet_name} — {e}' for e in sheet_errors)

    skaters = [r for r in records if r['position'] != 'G']
    goalies = [r for r in records if r['position'] == 'G']
    print(f'\n[INFO] Total : {len(skaters)} patineur(s), {len(goalies)} gardien(s).')
    if parse_errors:
        print(f'[ATTENTION] {len(parse_errors)} ligne(s) non reconnue(s) :')
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
            print(f'  [NON TROUVÉ] {rec["name"]} ({rec["team"]}) — {note}')
        for rec, note in ambiguous:
            print(f'  [AMBIGU] {rec["name"]} ({rec["team"]}) — {note}')
        approx = [(rec, note) for rec, _, note in matched if note]
        if approx:
            print(f'  {len(approx)} jumelage(s) approximatif(s) (à vérifier) :')
            for rec, note in approx:
                print(f'    [~] {rec["name"]} ({rec["team"]}) — {note}')

    skater_matched, skater_unmatched, skater_ambiguous = resolve(skaters)
    goalie_matched, goalie_unmatched, goalie_ambiguous = resolve(goalies)
    report('PATINEURS', skater_matched, skater_unmatched, skater_ambiguous)
    report('GARDIENS', goalie_matched, goalie_unmatched, goalie_ambiguous)

    # Contrôle de cohérence : compare aux projections NHL.com déjà en base — un grand écart
    # est un signal fort de bloc mal aligné (voir docstring), pas juste deux avis différents.
    player_ids = [pid for _, pid, _ in skater_matched]
    if player_ids:
        existing = db.table('player_projections').select('player_id, projected_points') \
            .eq('season', season).eq('source', 'nhl_com').in_('player_id', player_ids).execute()
        nhl_points = {row['player_id']: row['projected_points'] for row in existing.data if row['projected_points'] is not None}
        suspects = []
        for rec, pid, _ in skater_matched:
            ref = nhl_points.get(pid)
            if ref is not None and rec['points'] is not None and abs(rec['points'] - ref) > 40:
                suspects.append((rec, ref))
        if suspects:
            print(f'\n[ATTENTION] {len(suspects)} projection(s) ESPN très éloignée(s) de NHL.com (>40 pts d\'écart) :')
            for rec, ref in suspects:
                print(f'  [!] {rec["name"]} ({rec["team"]}) — ESPN={rec["points"]} pts, NHL.com={ref} pts')
            print('  Probable bloc mal aligné dans le fichier Excel — vérifier ces lignes avant --apply.')

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
        rows.append({'player_id': pid, 'season': season, 'source': 'espn', 'projected_points': rec['points']})
    for rec, pid, _ in goalie_matched:
        rows.append({'player_id': pid, 'season': season, 'source': 'espn', 'projected_wins': rec['wins']})
    db.table('player_projections').upsert(rows, on_conflict='player_id,season,source').execute()
    print(f'[OK] {len(rows)} projection(s) importée(s)/mise(s) à jour.')


if __name__ == '__main__':
    main()
