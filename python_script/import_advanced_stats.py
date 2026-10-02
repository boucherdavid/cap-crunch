"""
Importe les statistiques avancées de MoneyPuck.com dans `player_advanced_stats` (David,
2026-10-01) — page admin /admin/stats-avancees.

Source : CSV publics de moneypuck.com/data.htm (un fichier par saison et par type : patineurs,
gardiens), « free to use for non-commercial purposes » à condition de citer MoneyPuck.com — la
page de l'app affiche la mention. Identifiant `playerId` = `players.nhl_id`, donc aucun
jumelage par nom.

Chaque CSV donne une ligne par joueur ET par situation (all, 5on5, 5on4, 4on5, other) avec
~150 colonnes ; on ne garde que les situations utiles (sans « other ») et un sous-ensemble de
colonnes (STATS_PATINEURS / STATS_GARDIENS) stocké en JSONB — les taux (par 60 min, %, PDO,
GSAx) sont calculés côté app. Saison = année de début (2025 = 2025-26), convention MoneyPuck.

Gardiens : MoneyPuck ne donne ni les victoires ni les blanchissages (ce qui compte dans le
pool) — complétés à partir de l'API stats de la LNH (`goalie/summary`, même `playerId`) et
rangés dans le même JSONB (`wins`, `losses`, `ot_losses`, `shutouts`, `starts`), pour que l'app
lise tout depuis la base sans appeler la LNH à chaque affichage (David, 2026-10-01).

Trios et paires (David, 2026-10-02) : `lines.csv` de la même page donne, pour chaque
combinaison réellement utilisée à 5 contre 5, son temps de glace et ses résultats — importés
dans `line_advanced_stats` (page /analytique/trios, sous l'alignement actuel de Daily Faceoff).
`lineId` = les nhl_id des joueurs collés bout à bout (7 chiffres chacun).

Remplacement complet par saison (delete + insert) : MoneyPuck recalcule toute la saison à
chaque mise à jour, il n'y a pas d'historique à préserver.

Usage :
    python import_advanced_stats.py                     # saison courante + précédente
    python import_advanced_stats.py --seasons 2023 2024 # saisons précises (une saison
                                                        # terminée ne change plus : une fois suffit)
    python import_advanced_stats.py --dry-run           # aucune écriture
"""
import argparse
import csv
import io
import os
import sys
from datetime import datetime

import requests
from dotenv import load_dotenv
from supabase import create_client

sys.stdout.reconfigure(encoding='utf-8')
load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

BASE_URL = 'https://moneypuck.com/moneypuck/playerData/seasonSummary/{season}/regular/{kind}.csv'
HEADERS = {'User-Agent': 'Mozilla/5.0 (Cap Crunch pool prive; credit MoneyPuck.com)'}
NHL_GOALIES_URL = ('https://api.nhle.com/stats/rest/en/goalie/summary?limit=-1'
                   '&cayenneExp=seasonId={nhl_season}%20and%20gameTypeId=2')
SITUATIONS = {'all', '5on5', '5on4', '4on5'}
BATCH_SIZE = 500

# Colonnes MoneyPuck conservées (nom MoneyPuck → clé JSONB). Voir le dictionnaire de données :
# https://peter-tanner.com/moneypuck/downloads/MoneyPuckDataDictionaryForPlayers.csv
STATS_PATINEURS = {
    'gameScore': 'game_score',
    'I_F_goals': 'goals',
    'I_F_primaryAssists': 'a1',
    'I_F_secondaryAssists': 'a2',
    'I_F_points': 'points',
    'I_F_xGoals': 'xg',
    'I_F_shotsOnGoal': 'shots',
    'I_F_shotAttempts': 'shot_attempts',
    'I_F_highDangerShots': 'hd_shots',
    'I_F_highDangerGoals': 'hd_goals',
    'I_F_hits': 'hits',
    'I_F_takeaways': 'takeaways',
    'I_F_giveaways': 'giveaways',
    'shotsBlockedByPlayer': 'blocks',
    'faceoffsWon': 'fo_won',
    'faceoffsLost': 'fo_lost',
    'penaltiesDrawn': 'pen_drawn',
    'penalties': 'penalties',
    'I_F_oZoneShiftStarts': 'oz_starts',
    'I_F_dZoneShiftStarts': 'dz_starts',
    'onIce_xGoalsPercentage': 'xg_pct',
    'offIce_xGoalsPercentage': 'xg_pct_off',
    'onIce_corsiPercentage': 'cf_pct',
    'offIce_corsiPercentage': 'cf_pct_off',
    'onIce_fenwickPercentage': 'ff_pct',
    'OnIce_F_goals': 'gf',
    'OnIce_A_goals': 'ga',
    'OnIce_F_xGoals': 'xgf',
    'OnIce_A_xGoals': 'xga',
    'OnIce_F_shotsOnGoal': 'sf',
    'OnIce_A_shotsOnGoal': 'sa',
}
STATS_GARDIENS = {
    'xGoals': 'xga',
    'goals': 'ga',
    'ongoal': 'sa',
    'unblocked_shot_attempts': 'unblocked_sa',
    'lowDangerShots': 'ld_sa',
    'mediumDangerShots': 'md_sa',
    'highDangerShots': 'hd_sa',
    'lowDangerGoals': 'ld_ga',
    'mediumDangerGoals': 'md_ga',
    'highDangerGoals': 'hd_ga',
    'lowDangerxGoals': 'ld_xga',
    'mediumDangerxGoals': 'md_xga',
    'highDangerxGoals': 'hd_xga',
    'rebounds': 'rebounds',
    'xRebounds': 'x_rebounds',
}


# Colonnes de lines.csv conservées (nom MoneyPuck → clé JSONB) — 5 contre 5 seulement.
STATS_LIGNES = {
    'xGoalsPercentage': 'xg_pct',
    'corsiPercentage': 'cf_pct',
    'xGoalsFor': 'xgf',
    'xGoalsAgainst': 'xga',
    'goalsFor': 'gf',
    'goalsAgainst': 'ga',
    'shotsOnGoalFor': 'sf',
    'shotsOnGoalAgainst': 'sa',
}
NHL_ID_LEN = 7


def build_line_records(season: int, rows: list[dict]) -> list[dict]:
    records = []
    for r in rows:
        line_id = (r.get('lineId') or '').strip()
        kind = r.get('position')
        if not line_id or kind not in ('line', 'pairing') or len(line_id) % NHL_ID_LEN:
            continue
        records.append({
            'season': season,
            'line_id': line_id,
            'kind': kind,
            'team': r.get('team'),
            'name': r.get('name'),
            'player_ids': [int(line_id[i:i + NHL_ID_LEN]) for i in range(0, len(line_id), NHL_ID_LEN)],
            'games_played': num(r.get('games_played')) or 0,
            'icetime': int(float(r.get('icetime') or 0)),
            'stats': {key: num(r.get(col)) for col, key in STATS_LIGNES.items()},
        })
    return records


def import_lines(db, season: int) -> None:
    """Trios et paires d'une saison. Jamais bloquant : un échec ici (table pas encore créée,
    fichier absent) n'empêche pas l'import des joueurs."""
    label = f'{season}-{(season + 1) % 100:02d}'
    try:
        rows = fetch_rows(season, 'lines')
        if rows is None:
            print(f'[INFO] {label} lines : pas encore publié par MoneyPuck.')
            return
        records = build_line_records(season, rows)
        trios = sum(1 for r in records if r['kind'] == 'line')
        print(f'[INFO] {label} lines : {trios} trio(s), {len(records) - trios} paire(s).')
        if db is None or not records:
            return
        existing = db.table('line_advanced_stats').select('line_id', count='exact', head=True) \
            .eq('season', season).execute().count or 0
        if existing and len(records) < existing * 0.5:
            print(f'[ATTENTION] {label} lines : {len(records)} ligne(s) contre {existing} en base — laissé tel quel.')
            return
        db.table('line_advanced_stats').delete().eq('season', season).execute()
        for i in range(0, len(records), BATCH_SIZE):
            db.table('line_advanced_stats').insert(records[i:i + BATCH_SIZE]).execute()
        print(f'[OK] {label} lines : {len(records)} ligne(s) importée(s).')
    except Exception as e:
        print(f'[ATTENTION] {label} lines : import ignoré ({e}).')


def saison_courante() -> int:
    """Année de début de la saison LNH en cours (convention MoneyPuck) — bascule en juillet."""
    today = datetime.now()
    return today.year if today.month >= 7 else today.year - 1


def num(value: str):
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return int(f) if f.is_integer() else round(f, 4)


def fetch_rows(season: int, kind: str) -> list[dict] | None:
    url = BASE_URL.format(season=season, kind=kind)
    res = requests.get(url, headers=HEADERS, timeout=60)
    if res.status_code == 404:
        return None
    res.raise_for_status()
    if not res.text.startswith(('playerId', 'lineId')):
        raise RuntimeError(f'Format inattendu pour {url} (page HTML au lieu du CSV ?)')
    return list(csv.DictReader(io.StringIO(res.text)))


def fetch_nhl_goalie_results(season: int) -> dict[int, dict]:
    """{nhl_id: {wins, losses, ot_losses, shutouts, starts}} pour la saison régulière."""
    url = NHL_GOALIES_URL.format(nhl_season=f'{season}{season + 1}')
    res = requests.get(url, headers=HEADERS, timeout=60)
    res.raise_for_status()
    return {
        g['playerId']: {
            'wins': g.get('wins'),
            'losses': g.get('losses'),
            'ot_losses': g.get('otLosses'),
            'shutouts': g.get('shutouts'),
            'starts': g.get('gamesStarted'),
        }
        for g in res.json().get('data', []) if g.get('playerId')
    }


def build_records(season: int, kind: str, rows: list[dict]) -> list[dict]:
    mapping = STATS_PATINEURS if kind == 'skaters' else STATS_GARDIENS
    records = []
    for r in rows:
        if r.get('situation') not in SITUATIONS:
            continue
        nhl_id = num(r.get('playerId'))
        if not nhl_id:
            continue
        records.append({
            'season': season,
            'nhl_id': nhl_id,
            'situation': r['situation'],
            'kind': 'skater' if kind == 'skaters' else 'goalie',
            'name': r.get('name'),
            'team': r.get('team'),
            'position': r.get('position'),
            'games_played': num(r.get('games_played')) or 0,
            'icetime': int(float(r.get('icetime') or 0)),
            'stats': {key: num(r.get(col)) for col, key in mapping.items()},
        })
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seasons', type=int, nargs='+', help='Années de début (ex: 2025 pour 2025-26)')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    cur = saison_courante()
    seasons = args.seasons or [cur - 1, cur]
    db = None if args.dry_run else create_client(SUPABASE_URL, SUPABASE_KEY)

    for season in seasons:
        records = []
        for kind in ('skaters', 'goalies'):
            rows = fetch_rows(season, kind)
            if rows is None:
                print(f'[INFO] {season}-{(season + 1) % 100:02d} {kind} : pas encore publié par MoneyPuck.')
                continue
            recs = build_records(season, kind, rows)
            if kind == 'goalies':
                # Victoires / blanchissages de la LNH — sur la ligne « toutes situations » seulement
                # (ce ne sont pas des stats par situation). Une panne de la LNH n'empêche pas l'import.
                try:
                    results = fetch_nhl_goalie_results(season)
                    for rec in recs:
                        if rec['situation'] == 'all' and rec['nhl_id'] in results:
                            rec['stats'].update(results[rec['nhl_id']])
                    print(f'[INFO] {season}-{(season + 1) % 100:02d} gardiens : victoires LNH ajoutées '
                          f'({len(results)} gardiens).')
                except Exception as e:
                    print(f'[ATTENTION] Victoires LNH indisponibles pour {season} ({e}) — import sans elles.')
            print(f'[INFO] {season}-{(season + 1) % 100:02d} {kind} : {len(recs)} ligne(s) '
                  f'({len({r["nhl_id"] for r in recs})} joueurs).')
            records.extend(recs)

        import_lines(db, season)

        if not records:
            continue
        if db is None:
            print('[DRY-RUN] Aucune écriture.')
            continue

        # Garde-fou : un CSV tronqué ne doit pas remplacer une saison complète déjà en base.
        existing = db.table('player_advanced_stats').select('nhl_id', count='exact', head=True) \
            .eq('season', season).execute().count or 0
        if existing and len(records) < existing * 0.5:
            print(f'[ERREUR] {season} : {len(records)} ligne(s) reçue(s) contre {existing} en base — '
                  'CSV probablement incomplet, saison laissée telle quelle.')
            sys.exit(1)

        db.table('player_advanced_stats').delete().eq('season', season).execute()
        for i in range(0, len(records), BATCH_SIZE):
            db.table('player_advanced_stats').insert(records[i:i + BATCH_SIZE]).execute()
        print(f'[OK] {season} : {len(records)} ligne(s) importée(s).')


if __name__ == '__main__':
    main()
