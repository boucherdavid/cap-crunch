"""
Scrape les projections NHL.com (points patineurs + victoires gardiens) et les importe dans
player_projections. Usage ponctuel (une fois par saison), pas un pipeline récurrent — David
republiera ces articles chaque année, il faudra ajuster les URLs si elles changent de format.

Les deux articles NHL.com intègrent leur texte complet (format "Nom, Position, Équipe: valeur")
dans le JSON-LD NewsArticle de la page (balise <script type="application/ld+json">, champ
articleBody) — pas de rendu JavaScript à gérer, contrairement à ESPN.

Sources :
  Attaquants/défenseurs : https://www.nhl.com/news/nhl-points-projections-fantasy-hockey-2026-27
  Gardiens               : https://www.nhl.com/news/topic/fantasy/2026-2027-fantasy-hockey-goalie-win-projections

Usage:
    python scrape_nhl_projections.py             # dry-run
    python scrape_nhl_projections.py --apply      # écrit réellement
"""

import argparse
import html
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

import requests
from dotenv import load_dotenv
from supabase import create_client

from projections_common import build_player_lookup, match_player, get_active_season

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

SKATERS_URL = 'https://www.nhl.com/news/nhl-points-projections-fantasy-hockey-2026-27'
GOALIES_URL = 'https://www.nhl.com/news/topic/fantasy/2026-2027-fantasy-hockey-goalie-win-projections'

LINE_RE = re.compile(r'^(.+?),\s*([A-Z]{1,2}),\s*([A-Z]{2,3}):\s*(\d+)\s*$')


def fetch_article_body(url: str) -> str:
    headers = {'User-Agent': 'Mozilla/5.0'}
    r = requests.get(url, headers=headers, timeout=15)
    r.raise_for_status()
    r.encoding = 'utf-8'
    for raw in re.findall(r'<script type="application/ld&#x2B;json">(.*?)</script>', r.text, re.S):
        obj = json.loads(html.unescape(raw))
        if obj.get('@type') == 'NewsArticle':
            return obj.get('articleBody', '')
    raise RuntimeError(f'Bloc NewsArticle introuvable sur {url} — la page a peut-être changé de structure.')


def parse_lines(body: str, expected_positions: set[str]):
    """Retourne (records, ignorées) — une ligne 'Nom, Pos, Équipe: valeur' par joueur.
    Les entrées à plusieurs noms ("Untel ou Untel, G, CHI: 8") sont ignorées : ambiguës,
    généralement des gardiens de réserve peu susceptibles d'être repêchés."""
    records, skipped = [], []
    for line in body.split('\n'):
        line = line.strip()
        if not line:
            continue
        m = LINE_RE.match(line)
        if not m:
            continue
        name, position, team, value = m.groups()
        if position not in expected_positions:
            continue
        if ' or ' in name or '/' in name:
            skipped.append(line)
            continue
        records.append({'name': name.strip(), 'position': position, 'team': team, 'value': int(value)})
    return records, skipped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--season')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    print('[INFO] Téléchargement des projections patineurs...')
    skater_body = fetch_article_body(SKATERS_URL)
    skater_records, skater_skipped = parse_lines(skater_body, {'F', 'D'})
    print(f'[INFO] {len(skater_records)} patineur(s) extrait(s).')

    print('[INFO] Téléchargement des projections gardiens...')
    goalie_body = fetch_article_body(GOALIES_URL)
    goalie_records, goalie_skipped = parse_lines(goalie_body, {'G'})
    print(f'[INFO] {len(goalie_records)} gardien(s) extrait(s) ({len(goalie_skipped)} entrée(s) à plusieurs noms ignorée(s)).')

    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    season = args.season or get_active_season(db)
    print(f'[INFO] Saison ciblée : {season}')

    by_name_team, by_name, by_lastname_team = build_player_lookup(db)

    def resolve(records, value_key):
        matched, unmatched, ambiguous = [], [], []
        for rec in records:
            pid, note = match_player(rec['name'], rec['team'], by_name_team, by_name, by_lastname_team)
            if pid:
                matched.append((rec, pid, note))
            elif note and 'même nom' in note:
                ambiguous.append((rec, note))
            else:
                unmatched.append((rec, note))
        return matched, unmatched, ambiguous

    skater_matched, skater_unmatched, skater_ambiguous = resolve(skater_records, 'projected_points')
    goalie_matched, goalie_unmatched, goalie_ambiguous = resolve(goalie_records, 'projected_wins')

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

    report('PATINEURS', skater_matched, skater_unmatched, skater_ambiguous)
    report('GARDIENS', goalie_matched, goalie_unmatched, goalie_ambiguous)

    if not args.apply:
        print('\n[DRY-RUN] Aucune écriture. Relancez avec --apply pour importer les jumelages ci-dessus.')
        return

    total = len(skater_matched) + len(goalie_matched)
    if total == 0:
        print('\n[INFO] Rien à importer.')
        return

    confirm = input(f'\nImporter {total} projection(s) pour la saison {season} ? (oui/non) ')
    if confirm.strip().lower() != 'oui':
        print('Annulé.')
        return

    rows = [
        {'player_id': pid, 'season': season, 'source': 'nhl_com', 'projected_points': rec['value']}
        for rec, pid, _ in skater_matched
    ] + [
        {'player_id': pid, 'season': season, 'source': 'nhl_com', 'projected_wins': rec['value']}
        for rec, pid, _ in goalie_matched
    ]
    db.table('player_projections').upsert(rows, on_conflict='player_id,season,source').execute()
    print(f'[OK] {len(rows)} projection(s) importée(s)/mise(s) à jour.')


if __name__ == '__main__':
    main()
