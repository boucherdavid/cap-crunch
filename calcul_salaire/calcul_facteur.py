"""Calcul du facteur de plafond salarial du pool — méthode décrite dans calcul_facteur.md.

Facteur naturel = masse moyenne d'une équipe de pool « idéale » ÷ plafond LNH, où l'équipe
idéale reprend les règles d'alignement (12 A / 6 D / 2 G + 2 réservistes, 8 poolers) avec les
meilleurs joueurs selon le pointage du pool (scoring_config), moyenné sur deux saisons.

Facteur réalisé = masse réelle moyenne (actifs + réservistes) des alignements du pool ÷ plafond LNH.

Lecture seule : Supabase (python_script/.env = prod, ou --env .env.staging) + API stats LNH publique.

Usage (depuis la racine du projet) :
    python_script/venv/Scripts/python calcul_salaire/calcul_facteur.py
"""
import argparse
import os
import statistics
import sys
from collections import defaultdict

import requests
from dotenv import load_dotenv
from supabase import create_client

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NHL_STATS = 'https://api.nhle.com/stats/rest/en'
N_POOLERS = 8
SLOTS = {'F': 12, 'D': 6, 'G': 2}
RESERVES = 2
UNSIGNED_MULTIPLIER = 1.20   # même règle que l'app (app_settings.unsigned_player_cap_multiplier)

# Plafonds LNH connus (calcul_facteur.md) — 2028-29 est une estimation non confirmée.
NHL_CAP = {'2025-26': 95_500_000, '2026-27': 104_000_000, '2027-28': 113_500_000, '2028-29': 127_500_000}


def prev_season(season: str) -> str:
    start = int(season[:4]) - 1
    return f'{start}-{str(start + 1)[-2:]}'


def nhl_season_id(season: str) -> str:
    start = int(season[:4])
    return f'{start}{start + 1}'


def fetch_all(query_fn):
    rows, offset = [], 0
    while True:
        batch = query_fn().order('id').range(offset, offset + 999).execute().data
        rows += batch
        if len(batch) < 1000:
            return rows
        offset += 1000


def scoring(sb) -> dict:
    return {r['stat_key']: float(r['points'] or 0) for r in sb.table('scoring_config').select('stat_key, points').execute().data}


def pool_points_by_season(season: str, pts: dict) -> dict[int, float]:
    """Points du pool par nhl_id pour une saison régulière LNH."""
    sid = nhl_season_id(season)
    out: dict[int, float] = {}
    exp = f'seasonId={sid} and gameTypeId=2'
    skaters = requests.get(f'{NHL_STATS}/skater/summary', params={'limit': -1, 'cayenneExp': exp}, timeout=60).json()['data']
    for s in skaters:
        out[s['playerId']] = (s['goals'] or 0) * pts.get('goal', 1) + (s['assists'] or 0) * pts.get('assist', 1)
    goalies = requests.get(f'{NHL_STATS}/goalie/summary', params={'limit': -1, 'cayenneExp': exp}, timeout=60).json()['data']
    for g in goalies:
        out[g['playerId']] = ((g['wins'] or 0) * pts.get('goalie_win', 2) + (g['otLosses'] or 0) * pts.get('goalie_otl', 1)
                              + (g['shutouts'] or 0) * pts.get('goalie_shutout', 2))
    return out


def bucket(position: str | None) -> str:
    pos = (position or '').upper().split(',')
    if 'G' in pos:
        return 'G'
    if all(p in ('LD', 'RD', 'D') for p in pos if p):
        return 'D'
    return 'F'


def effective_cap(contracts: dict[str, float | None], season: str) -> tuple[float | None, bool]:
    """(cap, estimé?) — sans contrat pour la saison : saison précédente × 1,20, comme l'app."""
    cap = contracts.get(season)
    if cap is not None:
        return cap, False
    prev = contracts.get(prev_season(season))
    if prev is not None:
        return prev * UNSIGNED_MULTIPLIER, True
    return None, False


def natural_factor(players, season, stats_seasons, pts_by_season, extra_reserves=0):
    """Équipe de pool « idéale » : top 96 A, 48 D, 16 G + 16 (+extra) meilleurs restants."""
    cap_nhl = NHL_CAP[season]
    pool = []
    for p in players:
        if not p['nhl_id']:
            continue
        seasons_pts = [pts_by_season[s][p['nhl_id']] for s in stats_seasons if p['nhl_id'] in pts_by_season[s]]
        if not seasons_pts:
            continue
        cap, est = effective_cap(p['contracts'], season)
        if cap is None:
            continue   # ni contrat ni contrat précédent : pas dans la LNH cette saison
        pool.append({**p, 'pts': sum(seasons_pts) / len(seasons_pts), 'cap': cap, 'est': est, 'b': bucket(p['position'])})

    chosen, taken = [], set()
    for b, n in SLOTS.items():
        top = sorted([p for p in pool if p['b'] == b], key=lambda p: -p['pts'])[:n * N_POOLERS]
        chosen += top
        taken |= {p['id'] for p in top}
    rest = sorted([p for p in pool if p['id'] not in taken], key=lambda p: -p['pts'])
    reserves = rest[:(RESERVES + extra_reserves) * N_POOLERS]
    total = sum(p['cap'] for p in chosen + reserves)
    by_group = {b: sum(p['cap'] for p in chosen if p['b'] == b) / N_POOLERS for b in SLOTS}
    by_group['R'] = sum(p['cap'] for p in reserves) / N_POOLERS
    return {
        'masse': total / N_POOLERS,
        'facteur': total / N_POOLERS / cap_nhl,
        'par_groupe': by_group,
        'estimes': sum(1 for p in chosen + reserves if p['est']),
        'n': len(chosen) + len(reserves),
        'reserves': reserves,
    }


def realized(sb, players_by_id, season, pool_season_id):
    """Masse réelle (actifs + réservistes) des alignements actifs d'une saison du pool."""
    rows = fetch_all(lambda: sb.table('pooler_rosters').select('id, pooler_id, player_id, player_type')
                     .eq('pool_season_id', pool_season_id).eq('is_active', True))
    by_pooler = defaultdict(float)
    reserve_caps, est = [], 0
    for r in rows:
        if r['player_type'] not in ('actif', 'reserviste'):
            continue
        p = players_by_id.get(r['player_id'])
        cap, e = effective_cap(p['contracts'], season) if p else (None, False)
        cap = cap or 0
        est += e
        by_pooler[r['pooler_id']] += cap
        if r['player_type'] == 'reserviste':
            reserve_caps.append(cap)
    if not by_pooler:
        return None
    masses = list(by_pooler.values())
    return {
        'masse': sum(masses) / len(masses),
        'facteur': sum(masses) / len(masses) / NHL_CAP[season],
        'min': min(masses) / NHL_CAP[season],
        'max': max(masses) / NHL_CAP[season],
        'mediane_reserviste': statistics.median(reserve_caps) if reserve_caps else 0,
        'estimes': est,
        'n_poolers': len(masses),
    }


def m(x):
    return f'{x / 1e6:,.1f} M$'.replace(',', ' ').replace('.', ',')


def f(x):
    return f'{x:.3f}'.replace('.', ',')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--env', default=os.path.join(ROOT, 'python_script', '.env'))
    args = ap.parse_args()
    load_dotenv(args.env, override=True)
    sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

    pts = scoring(sb)
    raw = fetch_all(lambda: sb.table('players').select('id, nhl_id, first_name, last_name, position, player_contracts (season, cap_number)'))
    players = [{
        'id': p['id'], 'nhl_id': p['nhl_id'], 'name': f"{p['first_name']} {p['last_name']}", 'position': p['position'],
        'contracts': {c['season']: c['cap_number'] for c in (p['player_contracts'] or []) if c['cap_number'] is not None},
    } for p in raw]
    players_by_id = {p['id']: p for p in players}

    targets = ['2025-26', '2026-27', '2027-28']
    needed = sorted({s for t in targets for s in (prev_season(t), prev_season(prev_season(t)))})
    print('Statistiques LNH :', ', '.join(needed), file=sys.stderr)
    pts_by_season = {s: pool_points_by_season(s, pts) for s in needed}

    print('## Facteur naturel (équipe de pool « idéale », 22 joueurs)\n')
    print('| Saison | Plafond LNH | Classement sur | Masse moyenne | Facteur naturel | + 2 réservistes | Réservistes au coût médian réel | Caps estimés (×1,20) |')
    print('|---|---|---|---|---|---|---|---|')
    results = {}
    pool_seasons = {s['season']: s['id'] for s in sb.table('pool_seasons').select('id, season').eq('is_playoff', False).execute().data}
    real_2526 = realized(sb, players_by_id, '2025-26', pool_seasons['2025-26'])
    median_res = real_2526['mediane_reserviste'] if real_2526 else 0
    for t in targets:
        ranking = [prev_season(prev_season(t)), prev_season(t)]
        nat = natural_factor(players, t, ranking, pts_by_season)
        plus2 = natural_factor(players, t, ranking, pts_by_season, extra_reserves=2)
        # Variante réaliste : les 16 réservistes au coût médian des réservistes réels du pool.
        cheap = (nat['masse'] - nat['par_groupe']['R'] + RESERVES * median_res) / NHL_CAP[t]
        results[t] = nat
        print(f"| {t} | {m(NHL_CAP[t])} | {ranking[0]} + {ranking[1]} | {m(nat['masse'])} | **{f(nat['facteur'])}** | "
              f"{f(plus2['facteur'])} | {f(cheap)} | {nat['estimes']} / {nat['n']} |")

    print('\n### Masse moyenne par groupe (par équipe)\n')
    print('| Saison | Attaquants (12) | Défenseurs (6) | Gardiens (2) | Réservistes (2) |')
    print('|---|---|---|---|---|')
    for t, r in results.items():
        g = r['par_groupe']
        print(f"| {t} | {m(g['F'])} | {m(g['D'])} | {m(g['G'])} | {m(g['R'])} |")

    print('\n## Facteur réalisé (alignements réels du pool)\n')
    print('| Alignements | Contrats de | Plafond LNH | Masse moyenne | Facteur réalisé | Plus bas / plus haut | Caps estimés |')
    print('|---|---|---|---|---|---|---|')
    for season in ['2025-26', '2026-27']:
        r = realized(sb, players_by_id, season, pool_seasons['2025-26'])
        if r:
            print(f"| 2025-26 ({r['n_poolers']} poolers) | {season} | {m(NHL_CAP[season])} | {m(r['masse'])} | **{f(r['facteur'])}** | "
                  f"{f(r['min'])} / {f(r['max'])} | {r['estimes']} |")
    if real_2526:
        print(f"\nCoût médian d'un réserviste réel du pool (2025-26) : {m(median_res)}")


if __name__ == '__main__':
    main()
