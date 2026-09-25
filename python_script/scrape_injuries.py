"""
Scrape les blessures LNH — CBS Sports (source principale, détermine qui est "actuellement
blessé") recoupée avec ESPN (source secondaire, statut canonique + date de retour estimée plus
fiable pour calculer l'admissibilité au LTIR). Remplace scrape_cbs_injuries.py (David,
2026-09-23 — ajout d'ESPN + suivi de durée pour l'admissibilité LTIR, voir SUIVI_PROJET.md).

CBS (cbssports.com/nhl/injuries) reste la liste de référence — HTML rendu côté serveur, comme
avant. ESPN (espn.com/nhl/injuries) embarque un JSON structuré directement dans la page
(`window['__espnfitt__']`), bien plus fiable à parser qu'un texte libre : statut canonique
(`type.description` : "out"/"day-to-day"/"injured-reserve"), date de retour estimée
(`date`), note datée (`description`). Utilisé seulement pour enrichir les joueurs déjà trouvés
via CBS — ne détermine jamais à lui seul qui apparaît dans player_injuries.

Contrairement à l'ancien scraper (delete + reinsert complet), celui-ci fait un vrai upsert :
`first_seen_at` est préservé d'un run à l'autre tant que le joueur reste dans la liste CBS,
pour pouvoir calculer "day-to-day depuis plus de 14 jours" (règle LTIR de David) — seul un
remplacement complet aurait perdu cette information au run suivant.

Nécessite les colonnes ajoutées à player_injuries le 2026-09-23 (suite) — voir schema.sql.

Usage:
    python scrape_injuries.py              # dry-run (scrape + jumelage, aucune écriture)
    python scrape_injuries.py --apply       # écrit réellement
"""

import argparse
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone

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
ESPN_URL = 'https://www.espn.com/nhl/injuries'

# Garde-fous (David, 2026-09-25) — voir main().
MIN_EXISTING_FOR_RATIO_CHECK = 10
MIN_KEPT_RATIO = 0.5
ABSENCE_BEFORE_REMOVAL = timedelta(hours=36)  # cron quotidien : retiré au 2e run consécutif sans lui
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

# Mêmes alias que import_projections_cbs.py — CBS abrège certaines équipes différemment des
# codes LNH standards utilisés dans `teams`.
CBS_TEAM_ALIASES = {
    'LV': 'VGK', 'MON': 'MTL', 'CLB': 'CBJ', 'TB': 'TBL',
    'WAS': 'WSH', 'LA': 'LAK', 'NJ': 'NJD', 'SJ': 'SJS',
}

# ESPN groupe par nom d'équipe complet ("Anaheim Ducks"), pas par code — mappage figé, à
# ajuster seulement si une franchise change de nom/ville (voir Utah Mammoth, déjà à jour).
ESPN_TEAM_CODES = {
    'Anaheim Ducks': 'ANA', 'Boston Bruins': 'BOS', 'Buffalo Sabres': 'BUF',
    'Calgary Flames': 'CGY', 'Carolina Hurricanes': 'CAR', 'Chicago Blackhawks': 'CHI',
    'Colorado Avalanche': 'COL', 'Columbus Blue Jackets': 'CBJ', 'Dallas Stars': 'DAL',
    'Detroit Red Wings': 'DET', 'Edmonton Oilers': 'EDM', 'Florida Panthers': 'FLA',
    'Los Angeles Kings': 'LAK', 'Minnesota Wild': 'MIN', 'Montreal Canadiens': 'MTL',
    'Nashville Predators': 'NSH', 'New Jersey Devils': 'NJD', 'New York Islanders': 'NYI',
    'New York Rangers': 'NYR', 'Ottawa Senators': 'OTT', 'Philadelphia Flyers': 'PHI',
    'Pittsburgh Penguins': 'PIT', 'San Jose Sharks': 'SJS', 'Seattle Kraken': 'SEA',
    'St. Louis Blues': 'STL', 'Tampa Bay Lightning': 'TBL', 'Toronto Maple Leafs': 'TOR',
    'Utah Mammoth': 'UTA', 'Vancouver Canucks': 'VAN', 'Vegas Golden Knights': 'VGK',
    'Washington Capitals': 'WSH', 'Winnipeg Jets': 'WPG',
}

MONTHS = {
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12,
}


def normalize_cbs_team(code: str) -> str:
    return CBS_TEAM_ALIASES.get(code, code)


def parse_est_return(text: str, today: date) -> date | None:
    """Cherche un motif 'Mon D' (ex: 'Oct 2', 'Nov 21') dans un texte libre et infère l'année —
    la saison LNH est à cheval sur deux années civiles, donc une date qui semble déjà "passée"
    de plus de ~200 jours est en fait l'an prochain (ex: 'Jan 19' vu en septembre)."""
    if not text:
        return None
    m = re.search(r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})\b', text)
    if not m:
        return None
    month, day = MONTHS[m.group(1)], int(m.group(2))
    try:
        candidate = date(today.year, month, day)
    except ValueError:
        return None
    if (today - candidate).days > 200:
        candidate = date(today.year + 1, month, day)
    return candidate


def scrape_cbs():
    """Retourne une liste de dicts {name, team, position, updated, injury, status}."""
    res = requests.get(CBS_URL, headers=HEADERS, timeout=30)
    res.raise_for_status()
    soup = BeautifulSoup(res.text, 'html.parser')

    records = []
    for wrapper in soup.select('.TableBaseWrapper'):
        team_link = wrapper.select_one('.TeamName a')
        team_href = team_link['href'] if team_link else ''
        m = re.search(r'/nhl/teams/([A-Z]+)/', team_href)
        team = normalize_cbs_team(m.group(1)) if m else None

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


def _find_injuries_blob(obj):
    """Cherche récursivement la clé 'injuries' (liste de {displayName, items}) dans le JSON
    ESPN — pas de chemin fixe codé en dur, la structure de `window['__espnfitt__']` n'est pas
    garantie stable d'une page à l'autre."""
    if isinstance(obj, dict):
        items = obj.get('injuries')
        if isinstance(items, list) and items and isinstance(items[0], dict) \
                and 'displayName' in items[0] and 'items' in items[0]:
            return items
        for v in obj.values():
            found = _find_injuries_blob(v)
            if found:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = _find_injuries_blob(v)
            if found:
                return found
    return None


def scrape_espn():
    """Retourne une liste de dicts {name, team, position, status_desc, est_return, note}."""
    import json
    res = requests.get(ESPN_URL, headers=HEADERS, timeout=30)
    res.raise_for_status()
    m = re.search(r"window\['__espnfitt__'\]\s*=\s*", res.text)
    if not m:
        print('[ATTENTION] Structure ESPN introuvable (window.__espnfitt__) — page changée ?')
        return []
    data, _ = json.JSONDecoder().raw_decode(res.text, m.end())
    teams = _find_injuries_blob(data)
    if not teams:
        print('[ATTENTION] Clé "injuries" introuvable dans le JSON ESPN — page changée ?')
        return []

    records = []
    for team_block in teams:
        team = ESPN_TEAM_CODES.get(team_block.get('displayName', ''))
        if not team:
            print(f'[ATTENTION] Équipe ESPN non reconnue : {team_block.get("displayName")!r}')
            continue
        for item in team_block.get('items', []):
            athlete = item.get('athlete') or {}
            name = athlete.get('name')
            if not name:
                continue
            records.append({
                'name': name,
                'team': team,
                'position': athlete.get('position') or '',
                'status_desc': item.get('statusDesc') or '',
                'est_return': item.get('date') or '',
                'note': item.get('description') or '',
            })
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    today = datetime.now(timezone.utc).date()

    print('[INFO] Récupération de la page blessures CBS Sports (source principale)...')
    cbs_records = scrape_cbs()
    print(f'[INFO] CBS : {len(cbs_records)} entrée(s) sur {len({r["team"] for r in cbs_records})} équipe(s).')

    print('[INFO] Récupération de la page blessures ESPN (recoupement)...')
    try:
        espn_records = scrape_espn()
        print(f'[INFO] ESPN : {len(espn_records)} entrée(s).')
    except Exception as e:
        print(f'[ATTENTION] Échec du scrape ESPN ({e}) — on continue avec CBS seulement.')
        espn_records = []

    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    by_name_team, by_name, by_lastname_team = build_player_lookup(db)

    def resolve(records):
        matched, unmatched = [], []
        for rec in records:
            pid, note = match_player(rec['name'], rec['team'], by_name_team, by_name, by_lastname_team)
            if pid:
                matched.append((rec, pid, note))
            else:
                unmatched.append((rec, note))
        return matched, unmatched

    cbs_matched, cbs_unmatched = resolve(cbs_records)
    espn_matched, _ = resolve(espn_records)  # non trouvés côté ESPN : ignorés, CBS reste la liste de référence
    espn_by_pid = {pid: rec for rec, pid, _ in espn_matched}

    print(f'\n[CBS] {len(cbs_matched)} jumelé(s), {len(cbs_unmatched)} non trouvé(s).')
    for rec, note in cbs_unmatched:
        print(f'  [NON TROUVÉ] {rec["name"]} ({rec["team"]}) — {note}')
    approx = [(rec, note) for rec, _, note in cbs_matched if note]
    if approx:
        print(f'  {len(approx)} jumelage(s) approximatif(s) (à vérifier) :')
        for rec, note in approx:
            print(f'    [~] {rec["name"]} ({rec["team"]}) — {note}')
    cbs_pids = {pid for _, pid, _ in cbs_matched}
    overlap = cbs_pids & set(espn_by_pid)
    print(f'[ESPN] {len(overlap)}/{len(cbs_pids)} joueur(s) de CBS recoupé(s) avec ESPN.')

    if not args.apply:
        print('\n[DRY-RUN] Aucune écriture. Relancez avec --apply pour importer.')
        return

    # Préserve first_seen_at pour les joueurs déjà présents — nécessaire pour calculer
    # "day-to-day depuis plus de 14 jours" côté app (voir app/lib/ltirEligibility.ts).
    existing = db.table('player_injuries').select('player_id, first_seen_at, last_seen_at').execute()
    first_seen_by_pid = {r['player_id']: r['first_seen_at'] for r in existing.data}

    # Garde-fou (David, 2026-09-25) : une page CBS changée ou mal chargée donnerait 0 blessé (ou
    # presque) — sans ce contrôle, le script conclurait que tout le monde est guéri et remettrait
    # tous les compteurs first_seen_at à zéro. On échoue bruyamment (code de sortie non nul, donc
    # workflow GitHub en rouge) plutôt que d'écrire quoi que ce soit.
    if len(existing.data) >= MIN_EXISTING_FOR_RATIO_CHECK and len(cbs_matched) < len(existing.data) * MIN_KEPT_RATIO:
        print(f'[ERREUR] CBS ne renvoie que {len(cbs_matched)} blessé(s) jumelé(s) contre '
              f'{len(existing.data)} en base — page CBS probablement changée. Aucune écriture.')
        sys.exit(1)
    if not cbs_matched:
        print('[ERREUR] Aucun blessé jumelé côté CBS — aucune écriture.')
        sys.exit(1)

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    rows = []
    for rec, pid, _ in cbs_matched:
        espn = espn_by_pid.get(pid)
        # Date ESPN conservée séparément (David, 2026-09-24) pour signaler un désaccord avec CBS
        # côté app — est_return_date garde son rôle : CBS d'abord, ESPN seulement en repli.
        espn_return = parse_est_return(espn['est_return'], today) if espn else None
        est_return = parse_est_return(rec['status'], today) or espn_return
        rows.append({
            'player_id': pid,
            'position': rec['position'],
            'injury_type': rec['injury'],
            'status': rec['status'],
            'updated_label': rec['updated'],
            'espn_status_desc': espn['status_desc'] if espn else None,
            'espn_note': espn['note'] if espn else None,
            'est_return_date': est_return.isoformat() if est_return else None,
            'espn_est_return_date': espn_return.isoformat() if espn_return else None,
            'first_seen_at': first_seen_by_pid.get(pid, now_iso),
            'last_seen_at': now_iso,
        })

    # Un joueur absent de la liste CBS n'est retiré (compteur remis à zéro) qu'après
    # ABSENCE_BEFORE_REMOVAL d'absence continue (David, 2026-09-25) — un oubli ponctuel de CBS
    # une seule journée ne doit pas effacer une blessure qui dure depuis des semaines. Une ligne
    # sans last_seen_at (antérieure à la colonne, seulement au tout premier run après la
    # migration) garde l'ancien comportement : retirée dès la première absence.
    recovered_pids = set()
    for r in existing.data:
        if r['player_id'] in cbs_pids:
            continue
        last_seen = r.get('last_seen_at')
        if not last_seen or now - datetime.fromisoformat(last_seen.replace('Z', '+00:00')) >= ABSENCE_BEFORE_REMOVAL:
            recovered_pids.add(r['player_id'])
    pending = len(set(first_seen_by_pid) - cbs_pids - recovered_pids)
    if pending:
        print(f"[INFO] {pending} joueur(s) absent(s) de CBS aujourd'hui, gardé(s) en attendant confirmation.")
    if recovered_pids:
        db.table('player_injuries').delete().in_('player_id', list(recovered_pids)).execute()
    if rows:
        db.table('player_injuries').upsert(rows, on_conflict='player_id').execute()
    print(f'[OK] {len(rows)} blessure(s) à jour, {len(recovered_pids)} joueur(s) retiré(s) (guéris).')


if __name__ == '__main__':
    main()
