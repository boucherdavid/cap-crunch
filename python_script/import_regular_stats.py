"""
Mise à jour quotidienne des game-logs pour la saison régulière.
Approche boxscore : 1 appel par match au lieu de 1 appel par joueur.
Les buts/passes des gardiens sont récupérés via le game-log individuel
(absents du boxscore).

Exécuté par GitHub Action chaque nuit (schedule : 0 6 * * * UTC = 2h AM ET).
Sort sans erreur si aucune saison régulière n'est active (pendant les séries ou l'été).
"""

import argparse
import os
import sys
import time
import requests
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
from supabase import create_client

sys.stdout.reconfigure(encoding='utf-8')
load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
NHL_WEB      = 'https://api-web.nhle.com'
GAME_TYPE    = 2   # 2 = saison régulière


def to_nhl_season(season: str) -> int:
    """'2025-26' → 20252026"""
    start = int(season.split('-')[0])
    return start * 10000 + (start + 1)


def get_yesterday_et() -> str:
    et_offset = timedelta(hours=-4)
    now_et = datetime.now(timezone.utc) + et_offset
    return (now_et - timedelta(days=1)).strftime('%Y-%m-%d')


def _toi_seconds(toi: str) -> int:
    try:
        parts = toi.split(':')
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return 0


def fetch_schedule_games(date_str: str, game_type: int) -> list[dict]:
    url = f'{NHL_WEB}/v1/schedule/{date_str}'
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    games = []
    for day in r.json().get('gameWeek', []):
        if day.get('date') != date_str:
            continue
        for g in day.get('games', []):
            if int(g.get('gameType', 0)) == game_type:
                games.append({'id': g['id'], 'startTimeUTC': g.get('startTimeUTC', '')})
    return games


def fetch_boxscore(game_id: int) -> dict:
    url = f'{NHL_WEB}/v1/gamecenter/{game_id}/boxscore'
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    return r.json()


def fetch_player_game_log(nhl_id: int, season: int, game_type: int) -> list[dict]:
    url = f'{NHL_WEB}/v1/player/{nhl_id}/game-log/{season}/{game_type}'
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    return r.json().get('gameLog', [])


def parse_boxscore(
    boxscore: dict,
    nhl_to_db: dict[int, int],
    game_date: str,
    start_time: str,
    season: int,
    game_type: int,
) -> tuple[list[dict], set[int]]:
    """Retourne (rows, goalie_nhl_ids).
    Les buts/passes des gardiens sont absents du boxscore — enrichir via game-log."""
    rows: list[dict] = []
    goalie_nhl_ids: set[int] = set()

    for side in ('homeTeam', 'awayTeam'):
        team = boxscore.get('playerByGameStats', {}).get(side, {})

        for slot in ('forwards', 'defense'):
            for p in team.get(slot, []):
                nhl_id = p.get('playerId')
                if not nhl_id or nhl_id not in nhl_to_db:
                    continue
                rows.append({
                    'player_id':       nhl_to_db[nhl_id],
                    'nhl_id':          nhl_id,
                    'game_date':       game_date,
                    'game_start_time': start_time,
                    'season':          season,
                    'game_type':       game_type,
                    'goals':           int(p.get('goals', 0) or 0),
                    'assists':         int(p.get('assists', 0) or 0),
                    'goalie_wins':     0,
                    'goalie_otl':      0,
                    'goalie_shutouts': 0,
                })

        for g in team.get('goalies', []):
            nhl_id = g.get('playerId')
            if not nhl_id or nhl_id not in nhl_to_db:
                continue
            goalie_nhl_ids.add(nhl_id)
            decision = g.get('decision')
            toi_secs = _toi_seconds(g.get('toi', '0:00'))
            goals_ag = int(g.get('goalsAgainst', 0) or 0)

            wins     = 1 if decision == 'W' else 0
            otl      = 1 if decision == 'O' else 0   # saison régulière : 'O' pour OTL
            shutouts = 1 if (goals_ag == 0 and decision is not None and toi_secs >= 3600) else 0

            # goals/assists = 0 pour l'instant, enrichis après via game-log individuel
            rows.append({
                'player_id':       nhl_to_db[nhl_id],
                'nhl_id':          nhl_id,
                'game_date':       game_date,
                'game_start_time': start_time,
                'season':          season,
                'game_type':       game_type,
                'goals':           0,
                'assists':         0,
                'goalie_wins':     wins,
                'goalie_otl':      otl,
                'goalie_shutouts': shutouts,
            })

    return rows, goalie_nhl_ids


def enrich_goalie_stats(
    rows: list[dict],
    goalie_nhl_ids: set[int],
    season: int,
    game_type: int,
) -> None:
    """Corrige les buts/passes des gardiens via leur game-log individuel.
    Le boxscore NHL n'inclut pas ces champs dans la section goalies."""
    index: dict[tuple[int, str], dict] = {
        (row['nhl_id'], row['game_date']): row
        for row in rows
        if row['nhl_id'] in goalie_nhl_ids
    }
    for nhl_id in goalie_nhl_ids:
        try:
            game_log = fetch_player_game_log(nhl_id, season, game_type)
            for g in game_log:
                key = (nhl_id, g.get('gameDate', ''))
                if key in index:
                    index[key]['goals']   = int(g.get('goals', 0) or 0)
                    index[key]['assists'] = int(g.get('assists', 0) or 0)
            time.sleep(0.2)
        except Exception as e:
            print(f'  Avertissement game-log gardien nhl_id={nhl_id}: {e}')


def main() -> None:
    parser = argparse.ArgumentParser(description="Import game-logs saison régulière pour le pool.")
    parser.add_argument('--date', metavar='YYYY-MM-DD', help="Date à traiter (défaut : hier ET)")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print('Variables SUPABASE_URL et SUPABASE_SERVICE_KEY requises.')
        sys.exit(1)

    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    target_date = args.date or get_yesterday_et()
    print(f'Date cible : {target_date}')

    # Chercher la saison régulière active
    resp = (
        client.table('pool_seasons')
        .select('id, season')
        .eq('is_active', True)
        .eq('is_playoff', False)
        .maybe_single()
        .execute()
    )
    if not resp.data:
        print('Aucune saison régulière active — rien à faire.')
        return

    season_str = resp.data['season']        # ex: '2026-27'
    nhl_season = to_nhl_season(season_str)  # ex: 20262027
    print(f'Saison : {season_str} (id={resp.data["id"]}) → NHL season {nhl_season}')

    games = fetch_schedule_games(target_date, GAME_TYPE)
    if not games:
        print(f'Aucun match de saison régulière le {target_date} — rien à faire.')
        return
    print(f'{len(games)} match(s) : {[g["id"] for g in games]}')

    # nhl_id → player_id (DB) — pagination pour dépasser la limite Supabase de 1 000 lignes
    all_players: list[dict] = []
    offset = 0
    while True:
        chunk_resp = client.table('players').select('id, nhl_id').order('id').range(offset, offset + 999).execute()
        chunk = chunk_resp.data or []
        all_players.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000

    nhl_to_db: dict[int, int] = {
        r['nhl_id']: r['id']
        for r in all_players
        if r.get('nhl_id')
    }
    print(f'{len(nhl_to_db)} joueurs dans la DB.')

    rows: list[dict] = []
    goalie_nhl_ids: set[int] = set()
    errors = 0

    for game in games:
        try:
            boxscore = fetch_boxscore(game['id'])
        except Exception as e:
            print(f'  Erreur boxscore {game["id"]}: {e}')
            errors += 1
            continue
        game_rows, game_goalies = parse_boxscore(
            boxscore, nhl_to_db,
            target_date, game['startTimeUTC'],
            nhl_season, GAME_TYPE,
        )
        rows.extend(game_rows)
        goalie_nhl_ids.update(game_goalies)
        time.sleep(0.2)

    if goalie_nhl_ids:
        print(f'Enrichissement buts/passes : {len(goalie_nhl_ids)} gardien(s)...')
        enrich_goalie_stats(rows, goalie_nhl_ids, nhl_season, GAME_TYPE)

    if not rows:
        print('Aucun game-log à insérer pour cette date.')
        return

    print(f'{len(rows)} lignes à upsert...')
    client.table('player_game_logs').upsert(
        rows, on_conflict='player_id,game_date,season,game_type'
    ).execute()
    print(f'✓ {len(rows)} lignes mises à jour ({errors} erreur(s)).')


if __name__ == '__main__':
    main()
