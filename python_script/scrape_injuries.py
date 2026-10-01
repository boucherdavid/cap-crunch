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

MoneyPuck (moneypuck.com/injuries.htm, David 2026-10-01) — troisième source, CSV public dont
l'identifiant est le `nhl_id` (aucun jumelage par nom) : statut officiel de la liste des blessés
de l'équipe (IR, IR-LT = LTIR LNH, IR-NR, DTD, O), date de retour, matchs manqués/à manquer.
Comme ESPN, enrichit seulement les joueurs déjà trouvés via CBS. Son statut IR compte comme
« sur la liste des blessés LNH » pour l'admissibilité LTIR (voir app/lib/ltirEligibility.ts).

Nécessite les colonnes ajoutées à player_injuries le 2026-09-23 (suite) — voir schema.sql.

Usage:
    python scrape_injuries.py              # dry-run (scrape + jumelage, aucune écriture)
    python scrape_injuries.py --apply       # écrit réellement
"""

import argparse
import csv
import io
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
# API JSON publique d'ESPN (David, 2026-09-28) — la page ci-dessus ne renvoie pas son JSON
# embarqué aux serveurs de GitHub Actions ("Structure ESPN introuvable"). Même API sur deux
# hôtes : `site.api` répond 403 depuis GitHub Actions (Akamai), `site.web.api` passe (sondé
# depuis un runner le 2026-09-28). Essayés dans l'ordre, page web gardée en dernier repli.
ESPN_API_URLS = [
    'https://site.web.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries',
    'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries',
]

MONEYPUCK_URL = 'https://moneypuck.com/moneypuck/playerData/playerNews/current_injuries.csv'

# Garde-fous (David, 2026-09-25) — voir main().
MIN_EXISTING_FOR_RATIO_CHECK = 10
MIN_KEPT_RATIO = 0.5
DEFAULT_REMOVAL_ABSENCE_DAYS = 2  # repli si app_settings.injury_removal_absence_days manque


def absence_before_removal(db) -> timedelta:
    """Délai d'absence de la liste CBS avant retrait, en jours de runs quotidiens consécutifs —
    paramétrable par l'admin (app_settings.injury_removal_absence_days, /admin/effectifs onglet
    Approbation). N jours → N*24h - 12h : marge pour un cron qui ne tourne pas à la seconde près
    (ex: 2 → 36h, retiré au 2e run quotidien consécutif sans lui)."""
    days = DEFAULT_REMOVAL_ABSENCE_DAYS
    try:
        row = db.table('app_settings').select('injury_removal_absence_days').eq('id', 1).maybe_single().execute()
        if row and row.data and row.data.get('injury_removal_absence_days'):
            days = int(row.data['injury_removal_absence_days'])
    except Exception as e:
        print(f'[ATTENTION] Lecture de app_settings impossible ({e}) — délai par défaut {days} j.')
    return timedelta(hours=max(days * 24 - 12, 1))
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
    # Date ISO (API ESPN, `details.returnDate`) — année explicite, aucune inférence.
    iso = re.match(r'(\d{4}-\d{2}-\d{2})', text.strip())
    if iso:
        try:
            return date.fromisoformat(iso.group(1))
        except ValueError:
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


def scrape_moneypuck():
    """Retourne {nhl_id: {status, return_date, games_missed, games_to_miss, description}}."""
    res = requests.get(MONEYPUCK_URL, headers=HEADERS, timeout=30)
    res.raise_for_status()
    if not res.text.startswith('playerId'):
        raise RuntimeError('Format MoneyPuck inattendu (page HTML au lieu du CSV ?)')

    def to_int(v):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return None

    out = {}
    for r in csv.DictReader(io.StringIO(res.text)):
        nhl_id = to_int(r.get('playerId'))
        if not nhl_id:
            continue
        out[nhl_id] = {
            'status': (r.get('playerInjuryStatus') or '').strip() or None,
            'return_date': (r.get('dateOfReturn') or '').strip() or None,
            'games_missed': to_int(r.get('gamesMissedSoFar')),
            'games_to_miss': to_int(r.get('gamesStillToMiss')),
            'description': (r.get('yahooInjuryDescription') or '').strip() or None,
        }
    return out


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


def scrape_espn_api(url):
    """Même format que scrape_espn_page(), depuis l'API JSON d'ESPN."""
    res = requests.get(url, headers=HEADERS, timeout=30)
    res.raise_for_status()
    teams = res.json().get('injuries') or []
    records = []
    for team_block in teams:
        team = ESPN_TEAM_CODES.get(team_block.get('displayName', ''))
        if not team:
            print(f'[ATTENTION] Équipe ESPN non reconnue : {team_block.get("displayName")!r}')
            continue
        for item in team_block.get('injuries', []):
            athlete = item.get('athlete') or {}
            name = athlete.get('displayName')
            if not name:
                continue
            details = item.get('details') or {}
            records.append({
                'name': name,
                'team': team,
                'position': (athlete.get('position') or {}).get('abbreviation') or '',
                'status_desc': item.get('status') or '',
                'est_return': details.get('returnDate') or '',
                'note': item.get('longComment') or item.get('shortComment') or '',
            })
    return records


def scrape_espn():
    """Retourne une liste de dicts {name, team, position, status_desc, est_return, note} —
    API JSON d'abord, page web en repli si l'API échoue ou ne renvoie rien."""
    for url in ESPN_API_URLS:
        try:
            records = scrape_espn_api(url)
            if records:
                print(f"[INFO] ESPN : données obtenues via l'API JSON ({url.split('/')[2]}).")
                return records
            print(f'[ATTENTION] API ESPN vide ({url.split("/")[2]}).')
        except Exception as e:
            print(f"[ATTENTION] Échec de l'API ESPN ({e}).")
    print('[ATTENTION] Aucune API ESPN utilisable — repli sur la page web.')
    return scrape_espn_page()


def scrape_espn_page():
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

    print('[INFO] Récupération des blessures MoneyPuck (recoupement par nhl_id)...')
    try:
        mp_by_nhl = scrape_moneypuck()
        print(f'[INFO] MoneyPuck : {len(mp_by_nhl)} entrée(s).')
    except Exception as e:
        print(f'[ATTENTION] Échec MoneyPuck ({e}) — on continue sans.')
        mp_by_nhl = {}

    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    nhl_by_pid = {}
    offset = 0
    while True:
        batch = db.table('players').select('id, nhl_id').not_.is_('nhl_id', 'null')             .order('id').range(offset, offset + 999).execute().data
        nhl_by_pid.update({p['id']: p['nhl_id'] for p in batch})
        if len(batch) < 1000:
            break
        offset += 1000
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
    mp_by_pid = {pid: mp_by_nhl[nhl_by_pid[pid]] for pid in cbs_pids
                 if nhl_by_pid.get(pid) in mp_by_nhl}
    print(f'[MONEYPUCK] {len(mp_by_pid)}/{len(cbs_pids)} joueur(s) de CBS recoupé(s) avec MoneyPuck.')
    mp_only = len(set(mp_by_nhl) - {nhl_by_pid.get(pid) for pid in cbs_pids})
    if mp_only:
        print(f'[MONEYPUCK] {mp_only} blessé(s) MoneyPuck absent(s) de CBS (non importés).')

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
        mp = mp_by_pid.get(pid)
        mp_return = parse_est_return(mp['return_date'], today) if mp and mp['return_date'] else None
        est_return = parse_est_return(rec['status'], today) or espn_return or mp_return
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
            'mp_status': mp['status'] if mp else None,
            'mp_return_date': mp_return.isoformat() if mp_return else None,
            'mp_games_missed': mp['games_missed'] if mp else None,
            'mp_games_to_miss': mp['games_to_miss'] if mp else None,
            'mp_description': mp['description'] if mp else None,
            'first_seen_at': first_seen_by_pid.get(pid, now_iso),
            'last_seen_at': now_iso,
        })

    # Un joueur absent de la liste CBS n'est retiré (compteur remis à zéro) qu'après
    # `injury_removal_absence_days` d'absence continue (David, 2026-09-25) — un oubli ponctuel de CBS
    # une seule journée ne doit pas effacer une blessure qui dure depuis des semaines. Une ligne
    # sans last_seen_at (antérieure à la colonne, seulement au tout premier run après la
    # migration) garde l'ancien comportement : retirée dès la première absence.
    removal_delay = absence_before_removal(db)
    recovered_pids = set()
    for r in existing.data:
        if r['player_id'] in cbs_pids:
            continue
        last_seen = r.get('last_seen_at')
        if not last_seen or now - datetime.fromisoformat(last_seen.replace('Z', '+00:00')) >= removal_delay:
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
