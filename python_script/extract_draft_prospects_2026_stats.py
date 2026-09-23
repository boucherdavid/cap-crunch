"""
Extrait le fichier Excel "nhl_draft_prospects_2026_stats_for_2025.xlsx" (mock draft LNH 2026,
statistiques de la dernière saison junior/université avant repêchage) vers un JSON statique
consommé directement par /repechage (David, 2026-09-22) — remplace la table draft_prospects
comme source pour les colonnes équipe/PJ/PTS de ce tableau (draft_prospects reste utilisée
telle quelle par /draft-center, aucun changement là).

Usage ponctuel (un seul fichier, une seule fois par saison de repêchage) :
    python extract_draft_prospects_2026_stats.py
"""
import json
import os
import re

import openpyxl

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
XLSX_PATH = os.path.join(BASE_DIR, '..', 'excel', 'nhl_draft_prospects_2026_stats_for_2025.xlsx')
OUTPUT_PATH = os.path.join(BASE_DIR, '..', 'app', 'lib', 'data', 'draftProspects2026Stats.json')


def normalize(s: str) -> str:
    # Même normalisation que normName() côté app/app/repechage/page.tsx — doit rester identique
    # des deux côtés, sinon la clé de jumelage diverge silencieusement (trouvé par David,
    # 2026-09-22 : "Louis-Félix" devenait "louis-felix" ici mais "louis felix" côté app, qui
    # remplace aussi les traits d'union). Tout caractère non alphanumérique (trait d'union,
    # apostrophe, point d'initiale...) est traité comme un espace, pas seulement les accents.
    import unicodedata
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode()
    s = re.sub(r'[^a-zA-Z0-9]+', ' ', s)
    return s.strip().lower()


def parse_player_cell(raw: str):
    """'\xa0Gavin McKenna (F)\xa0Verified by Elite Prospects' -> ('Gavin McKenna', 'F')."""
    text = raw.replace('\xa0', ' ').strip()
    text = re.sub(r'\s*Verified by.*$', '', text).strip()
    m = re.match(r'^(.*)\(([A-Z]+)\)$', text)
    if not m:
        return text, None
    return m.group(1).strip(), m.group(2).strip()


def main():
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb['Feuil1']
    rows = list(ws.iter_rows(values_only=True))

    prospects = []
    for row in rows[1:]:
        if not row or row[0] is None or not isinstance(row[0], int):
            continue  # ligne d'en-tête de ronde ("ROUND 1", ...) ou vide
        overall, _, drafted_by, player_raw, team_raw, league_raw, gp, g, a, tp = row
        full_name, position = parse_player_cell(player_raw or '')
        is_goalie = position == 'G'
        team = (team_raw or '').replace('\xa0', '').strip() or None
        league = (league_raw or '').replace('\xa0', '').strip() or None
        prospects.append({
            'overall': overall,
            'fullNameNorm': normalize(full_name),
            'displayName': full_name,
            'position': position,
            'draftedBy': (drafted_by or '').strip() or None,
            'team': team,
            'league': league,
            'gamesPlayed': gp if isinstance(gp, int) else None,
            # Pour un gardien, g/a/tp ne sont pas buts/passes/points (colonnes réutilisées pour
            # PJ/moyenne/%arrêt sur cette feuille) — on ne garde 'points' que pour un patineur.
            'points': (tp if isinstance(tp, int) else None) if not is_goalie else None,
        })

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(prospects, f, ensure_ascii=False, indent=2)

    print(f'{len(prospects)} prospects extraits -> {os.path.relpath(OUTPUT_PATH, BASE_DIR)}')


if __name__ == '__main__':
    main()
