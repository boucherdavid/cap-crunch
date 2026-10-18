"""
Retire de player_game_logs les « matchs » de gardiens substituts qui n'ont pas joué
(David, 2026-10-18).

Jusqu'à cette date, les imports créaient une ligne pour chaque gardien listé sur la feuille de
match de la LNH, y compris le substitut resté au banc (toi 0:00) : Scott Wedgewood affichait
8 MJ au lieu de 2. Les points n'étaient pas touchés (ligne à zéro partout), seulement les matchs
joués et les points par match. Les imports sont corrigés ; ce script nettoie l'existant.

Une ligne n'est supprimée que si les deux conditions sont vraies :
  - la date n'apparaît pas dans le relevé de matchs officiel du gardien (API de la LNH) ;
  - la ligne est entièrement à zéro (buts, passes, victoires, défaites en prolongation, blanchissages).
Un gardien dont le relevé n'a pas pu être lu est laissé intact.

Usage :
  python cleanup_goalie_backup_logs.py                    # dry-run, saison courante, saison régulière
  python cleanup_goalie_backup_logs.py --season 20252026  # autre saison
  python cleanup_goalie_backup_logs.py --game-type 3      # séries
  python cleanup_goalie_backup_logs.py --apply            # suppression réelle

Cible prod via python_script/.env, comme les autres scripts (SUPABASE_URL/SUPABASE_SERVICE_KEY
déjà définis dans la session ont priorité).
"""

import argparse
import os
import time
from datetime import datetime

import requests
from dotenv import load_dotenv
from supabase import create_client

from db_diff import fetch_all

load_dotenv()

NHL_WEB = 'https://api-web.nhle.com'
STAT_FIELDS = ('goals', 'assists', 'goalie_wins', 'goalie_otl', 'goalie_shutouts')


def current_nhl_season() -> int:
    now = datetime.now()
    start = now.year if now.month >= 9 else now.year - 1
    return start * 10000 + start + 1


def nhl_game_dates(nhl_id: int, season: int, game_type: int) -> set[str]:
    r = requests.get(f'{NHL_WEB}/v1/player/{nhl_id}/game-log/{season}/{game_type}', timeout=10)
    r.raise_for_status()
    return {g['gameDate'] for g in r.json().get('gameLog', [])}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--season', type=int, default=current_nhl_season())
    parser.add_argument('--game-type', type=int, default=2)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
    print(f'Base : {os.environ["SUPABASE_URL"]}')
    print(f'Saison {args.season}, type {args.game_type} — {"SUPPRESSION RÉELLE" if args.apply else "dry-run"}')

    goalies = fetch_all(lambda: client.table('players')
                        .select('id, nhl_id, first_name, last_name')
                        .eq('position', 'G').order('id'))
    by_id = {g['id']: g for g in goalies if g.get('nhl_id')}
    ids = list(by_id)

    rows: list[dict] = []
    for i in range(0, len(ids), 200):
        chunk = ids[i:i + 200]
        rows += fetch_all(lambda: client.table('player_game_logs')
                          .select('id, player_id, game_date, ' + ', '.join(STAT_FIELDS))
                          .eq('season', args.season).eq('game_type', args.game_type)
                          .in_('player_id', chunk).order('id'))

    rows_by_player: dict[int, list[dict]] = {}
    for r in rows:
        rows_by_player.setdefault(r['player_id'], []).append(r)
    print(f'{len(rows)} ligne(s) de gardiens pour {len(rows_by_player)} gardien(s)\n')

    to_delete: list[int] = []
    skipped = 0
    for pid, prow in sorted(rows_by_player.items(), key=lambda kv: by_id[kv[0]]['last_name']):
        g = by_id[pid]
        try:
            played = nhl_game_dates(g['nhl_id'], args.season, args.game_type)
        except Exception as e:
            print(f'  ⚠ {g["first_name"]} {g["last_name"]} : relevé LNH illisible ({e}) — ignoré')
            skipped += 1
            continue
        time.sleep(0.2)
        extra = [r for r in prow
                 if r['game_date'] not in played and not any(r[f] for f in STAT_FIELDS)]
        odd = [r for r in prow if r['game_date'] not in played and any(r[f] for f in STAT_FIELDS)]
        if extra or odd:
            print(f'  {g["first_name"]} {g["last_name"]} : {len(prow)} ligne(s) en base, '
                  f'{len(played)} match(s) joué(s) selon la LNH → {len(extra)} à retirer')
        for r in odd:
            print(f'    ⚠ {r["game_date"]} absent du relevé LNH mais avec des stats — conservé, à vérifier')
        to_delete += [r['id'] for r in extra]

    print(f'\nTotal : {len(to_delete)} ligne(s) à retirer ({skipped} gardien(s) ignoré(s))')
    if not args.apply or not to_delete:
        return
    for i in range(0, len(to_delete), 200):
        client.table('player_game_logs').delete().in_('id', to_delete[i:i + 200]).execute()
    print(f'✓ {len(to_delete)} ligne(s) supprimée(s)')


if __name__ == '__main__':
    main()
