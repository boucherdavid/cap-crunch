"""
Backfill des game-logs pour le pool des séries (game_type=3).
Approche boxscore : 1 appel par match au lieu de 1 appel par joueur.
Les buts/passes des gardiens sont récupérés via le game-log individuel
(absents du boxscore NHL).

Usage :
    python backfill_playoff_game_logs.py --start 2026-04-19
    python backfill_playoff_game_logs.py --start 2026-04-19 --end 2026-05-25
"""

import argparse
import os
import sys
import time
import requests
from datetime import datetime, timezone, timedelta, date

from dotenv import load_dotenv
from supabase import create_client

sys.stdout.reconfigure(encoding='utf-8')
load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
NHL_WEB      = 'https://api-web.nhle.com'
NHL_SEASON   = 20252026
GAME_TYPE    = 3   # playoffs


def get_yesterday_et() -> str:
    et_offset = timedelta(hours=-4)
    now_et = datetime.now(timezone.utc) + et_offset
    return (now_et - timedelta(days=1)).strftime('%Y-%m-%d')


def date_range(start: str, end: str) -> list[str]:
    d1 = date.fromisoformat(start)
    d2 = date.fromisoformat(end)
    days = []
    current = d1
    while current <= d2:
        days.append(current.isoformat())
        current += timedelta(days=1)
    return days


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
    is_playoff = (game_type == 3)

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

            wins = 1 if decision == 'W' else 0
            if is_playoff:
                otl = 1 if (decision == 'L' and toi_secs > 3600) else 0
            else:
                otl = 1 if decision == 'O' else 0
            shutouts = 1 if (goals_ag == 0 and decision is not None and toi_secs >= 3600) else 0

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
    """Corrige les buts/passes des gardiens via leur game-log individuel."""
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
    parser = argparse.ArgumentParser(description="Backfill game-logs playoff via boxscore.")
    parser.add_argument('--start', required=True, metavar='YYYY-MM-DD', help="Première date")
    parser.add_argument('--end', metavar='YYYY-MM-DD', help="Dernière date (défaut : hier ET)")
    args = parser.parse_args()

    end_date = args.end or get_yesterday_et()
    dates = date_range(args.start, end_date)

    if not SUPABASE_URL or not SUPABASE_KEY:
        print('Variables SUPABASE_URL et SUPABASE_SERVICE_KEY requises.')
        sys.exit(1)

    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f'Backfill séries : {args.start} → {end_date} ({len(dates)} dates)')
    print(f'Saison NHL : {NHL_SEASON}, game_type={GAME_TYPE}\n')

    all_players: list[dict] = []
    offset = 0
    while True:
        resp = client.table('players').select('id, nhl_id').order('id').range(offset, offset + 999).execute()
        chunk = resp.data or []
        all_players.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000

    nhl_to_db: dict[int, int] = {
        r['nhl_id']: r['id']
        for r in all_players
        if r.get('nhl_id')
    }
    print(f'{len(nhl_to_db)} joueurs dans la DB.\n')

    # Dates déjà importées en BD — pour sauter les journées déjà traitées
    existing_resp = client.table('player_game_logs') \
        .select('game_date') \
        .eq('season', NHL_SEASON) \
        .eq('game_type', GAME_TYPE) \
        .execute()
    existing_dates = {r['game_date'] for r in (existing_resp.data or [])}
    print(f'{len(existing_dates)} date(s) déjà en BD — seront ignorées.\n')

    total_errors = 0
    total_rows = 0
    skipped = 0

    for d in dates:
        try:
            games = fetch_schedule_games(d, GAME_TYPE)
        except Exception as e:
            print(f'{d} — Erreur schedule : {e}')
            time.sleep(1)
            continue

        if d in existing_dates:
            skipped += 1
            continue

        if not games:
            continue

        day_rows: list[dict] = []
        day_goalie_nhl_ids: set[int] = set()

        print(f'{d} — {len(games)} match(s) : {[g["id"] for g in games]}')

        for game in games:
            try:
                boxscore = fetch_boxscore(game['id'])
            except Exception as e:
                print(f'  Erreur boxscore {game["id"]}: {e}')
                total_errors += 1
                time.sleep(1)
                continue
            game_rows, game_goalies = parse_boxscore(
                boxscore, nhl_to_db,
                d, game['startTimeUTC'],
                NHL_SEASON, GAME_TYPE,
            )
            day_rows.extend(game_rows)
            day_goalie_nhl_ids.update(game_goalies)
            time.sleep(0.2)

        if day_goalie_nhl_ids:
            enrich_goalie_stats(day_rows, day_goalie_nhl_ids, NHL_SEASON, GAME_TYPE)

        if day_rows:
            try:
                for i in range(0, len(day_rows), 500):
                    client.table('player_game_logs').upsert(
                        day_rows[i:i + 500],
                        on_conflict='player_id,game_date,season,game_type'
                    ).execute()
                total_rows += len(day_rows)
                print(f'  ✓ {len(day_rows)} lignes sauvegardées')
            except Exception as e:
                print(f'  ✗ Erreur upsert {d} (sera réessayée au prochain run) : {e}')
                total_errors += 1

    print(f'✓ Backfill terminé — {total_rows} lignes importées, {skipped} date(s) ignorées (déjà en BD), {total_errors} erreur(s).')


if __name__ == '__main__':
    main()
