"""
Scrape la page publique des blessures LNH de CBS Sports (cbssports.com/nhl/injuries) et importe
dans player_injuries. Contrairement aux projections CBS (collées à la main dans un fichier Excel
par David), cette page est directement scrapable : HTML rendu côté serveur, pas de JavaScript à
contourner (vérifié le 2026-09-23) — un vrai scraper HTTP, même esprit que scrape_puckpedia.py.

Remplacement complet à chaque exécution (delete + reinsert), jamais incrémental — la page CBS
représente l'état "actuellement blessé", pas un historique : un joueur qui guérit disparaît
simplement de la page et doit disparaître de la table aussi.

Nécessite la table player_injuries (voir schema.sql, migration 2026-09-23 — pas encore créée,
à exécuter manuellement dans le SQL Editor Supabase avant le premier --apply).

Usage:
    python scrape_cbs_injuries.py              # dry-run (scrape + jumelage, aucune écriture)
    python scrape_cbs_injuries.py --apply       # écrit réellement
"""

import argparse
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client

from projections_common import build_player_lookup, match_player

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

CBS_URL = 'https://www.cbssports.com/nhl/injuries/'
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

# Mêmes alias que import_projections_cbs.py — CBS abrège certaines équipes différemment des
# codes LNH standards utilisés dans `teams` (David a confirmé continuer avec CBS seulement,
# 2026-09-23 — Yahoo/TSN mis de côté pour l'instant).
CBS_TEAM_ALIASES = {
    'LV': 'VGK', 'MON': 'MTL', 'CLB': 'CBJ', 'TB': 'TBL',
    'WAS': 'WSH', 'LA': 'LAK', 'NJ': 'NJD', 'SJ': 'SJS',
}


def normalize_team(code: str) -> str:
    return CBS_TEAM_ALIASES.get(code, code)


def scrape():
    """Retourne une liste de dicts {name, team, position, updated, injury, status}."""
    res = requests.get(CBS_URL, headers=HEADERS, timeout=30)
    res.raise_for_status()
    soup = BeautifulSoup(res.text, 'html.parser')

    records = []
    for wrapper in soup.select('.TableBaseWrapper'):
        team_link = wrapper.select_one('.TeamName a')
        team_href = team_link['href'] if team_link else ''
        m = re.search(r'/nhl/teams/([A-Z]+)/', team_href)
        team = normalize_team(m.group(1)) if m else None

        for row in wrapper.select('tr.TableBase-bodyTr'):
            cells = row.find_all('td')
            if len(cells) < 5:
                continue
            name_el = cells[0].select_one('.CellPlayerName--long a')
            name = name_el.get_text(strip=True) if name_el else None
            position = cells[1].get_text(strip=True)
            updated = cells[2].get_text(strip=True)
            injury = cells[3].get_text(strip=True)
            status = cells[4].get_text(strip=True)
            if not name or not team:
                continue
            records.append({
                'name': name, 'team': team, 'position': position,
                'updated': updated, 'injury': injury, 'status': status,
            })
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    print('[INFO] Récupération de la page blessures CBS Sports...')
    records = scrape()
    teams_count = len({r['team'] for r in records})
    print(f'[INFO] {len(records)} entrée(s) de blessure trouvée(s) sur {teams_count} équipe(s).')

    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    by_name_team, by_name, by_lastname_team = build_player_lookup(db)

    matched, unmatched = [], []
    for rec in records:
        pid, note = match_player(rec['name'], rec['team'], by_name_team, by_name, by_lastname_team)
        if pid:
            matched.append((rec, pid, note))
        else:
            unmatched.append((rec, note))

    print(f'\n[INFO] {len(matched)} jumelé(s), {len(unmatched)} non trouvé(s).')
    for rec, note in unmatched:
        print(f'  [NON TROUVÉ] {rec["name"]} ({rec["team"]}) — {note}')
    approx = [(rec, note) for rec, _, note in matched if note]
    if approx:
        print(f'  {len(approx)} jumelage(s) approximatif(s) (à vérifier) :')
        for rec, note in approx:
            print(f'    [~] {rec["name"]} ({rec["team"]}) — {note}')

    if not args.apply:
        print('\n[DRY-RUN] Aucune écriture. Relancez avec --apply pour importer.')
        return

    rows = [{
        'player_id': pid,
        'position': rec['position'],
        'injury_type': rec['injury'],
        'status': rec['status'],
        'updated_label': rec['updated'],
    } for rec, pid, _ in matched]

    # Pas de confirmation interactive ici (contrairement aux autres imports --apply) — ce script
    # tourne aussi sans supervision via un cron GitHub Actions quotidien. Enjeu faible : table
    # purement informative, remplacée en entier à chaque run, jamais lue par une autre table.
    db.table('player_injuries').delete().gte('id', 0).execute()
    if rows:
        db.table('player_injuries').insert(rows).execute()
    print(f'[OK] {len(rows)} blessure(s) importée(s).')


if __name__ == '__main__':
    main()
