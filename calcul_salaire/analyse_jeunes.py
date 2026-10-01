"""Coût des jeunes joueurs sur leur deuxième contrat, hier et aujourd'hui.

Question : les deuxièmes contrats des jeunes vedettes coûtent-ils plus cher qu'aux débuts du pool,
en proportion du plafond LNH ? On reprend l'équipe de pool « idéale » (176 joueurs, 8 poolers,
voir calcul_facteur.md) et on la découpe selon les années écoulées depuis le repêchage LNH :

    0-3 ans : surtout des contrats d'entrée (ELC)
    4-7 ans : la période du deuxième contrat
    8 ans + : vétérans

(joueur non repêché : âge − 18 en guise d'années depuis le repêchage).

Saisons comparées : 2014-15 et 2015-16 (fichiers Excel de David), 2025-26 et 2026-27 (app, prod).
Lecture seule. Exige xlrd/openpyxl pour les saisons historiques (voir calcul_facteur_historique.py).
    python_script/venv/Scripts/python calcul_salaire/analyse_jeunes.py
"""
import os
import sys
from datetime import date

import requests
from dotenv import load_dotenv
from supabase import create_client

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import calcul_facteur as cf  # noqa: E402
import calcul_facteur_historique as hist  # noqa: E402

N_POOLERS = 8
BUCKETS = [('0-3 ans (contrat d\'entrée)', 0, 3), ('4-7 ans (2e contrat)', 4, 7), ('8 ans et + (vétérans)', 8, 99)]


def bios(season: str) -> dict[int, dict]:
    sid = f'{season[:4]}{int(season[:4]) + 1}'
    out = {}
    for kind, field in (('skater', 'skaterFullName'), ('goalie', 'goalieFullName')):
        data = requests.get(f'https://api.nhle.com/stats/rest/en/{kind}/bios',
                            params={'limit': -1, 'cayenneExp': f'seasonId={sid} and gameTypeId=2'}, timeout=60).json()['data']
        for d in data:
            out[d['playerId']] = {'name': d[field], 'draft': d.get('draftYear'), 'birth': d.get('birthDate')}
    return out


def years_since_draft(info: dict, season: str) -> int | None:
    start = int(season[:4])
    if info.get('draft'):
        return start - int(info['draft'])
    if info.get('birth'):
        b = date.fromisoformat(info['birth'])
        return (date(start, 10, 1) - b).days // 365 - 18
    return None


def ideal_pool(candidates: list[dict]) -> list[dict]:
    """Top 96 A / 48 D / 16 G + 16 meilleurs restants (mêmes règles que calcul_facteur.py)."""
    chosen, taken = [], set()
    for b, n in cf.SLOTS.items():
        top = sorted([p for p in candidates if p['b'] == b], key=lambda p: -p['pts'])[:n * N_POOLERS]
        chosen += top
        taken |= {p['pid'] for p in top}
    rest = sorted([p for p in candidates if p['pid'] not in taken], key=lambda p: -p['pts'])
    return chosen + rest[:cf.RESERVES * N_POOLERS]


def points_by_pid(seasons: list[str]) -> dict[int, float]:
    per = [cf.pool_points_by_season(s, hist.PTS) for s in seasons]
    out = {}
    for pid in set().union(*per):
        vals = [d[pid] for d in per if pid in d]
        out[pid] = sum(vals) / len(vals)
    return out


def historical_candidates(season: str) -> tuple[list[dict], float]:
    cfg = hist.SEASONS[season]
    sheets = hist.read_workbook(os.path.join(hist.HERE, cfg['file']))
    ranking = [hist.prev(hist.prev(season)), hist.prev(season)]
    pts = points_by_pid(ranking)
    name_to_pid: dict[str, int] = {}
    for s in ranking:
        for pid, n in hist.nhl_names(s).items():
            name_to_pid.setdefault(n, pid)
    by_initial: dict[str, list[int]] = {}
    for n, pid in name_to_pid.items():
        first, _, last = n.partition(' ')
        by_initial.setdefault(f'{last}|{first[:1]}', []).append(pid)
    out = []
    for row in sheets['Données'][2:]:
        name, pos, cap = hist.cell(row, 0), hist.cell(row, 2), hist.num(hist.cell(row, 3))
        if not name or not cap or cap <= 0:
            continue
        k = hist.norm(name)
        pid = name_to_pid.get(k)
        if pid is None:
            first, _, last = k.partition(' ')
            c = by_initial.get(f'{last}|{first[:1]}', [])
            pid = c[0] if len(c) == 1 else None
        if pid in pts:
            out.append({'pid': pid, 'b': hist.bucket(pos), 'cap': cap * 1e6, 'pts': pts[pid]})
    return out, cfg['nhl_cap']


def current_candidates(sb, season: str) -> tuple[list[dict], float]:
    ranking = [cf.prev_season(cf.prev_season(season)), cf.prev_season(season)]
    pts = points_by_pid(ranking)
    raw = cf.fetch_all(lambda: sb.table('players').select('id, nhl_id, position, player_contracts (season, cap_number)'))
    out = []
    for p in raw:
        if not p['nhl_id'] or p['nhl_id'] not in pts:
            continue
        contracts = {c['season']: c['cap_number'] for c in (p['player_contracts'] or []) if c['cap_number'] is not None}
        cap, _ = cf.effective_cap(contracts, season)
        if cap:
            out.append({'pid': p['nhl_id'], 'b': cf.bucket(p['position']), 'cap': cap, 'pts': pts[p['nhl_id']]})
    return out, cf.NHL_CAP[season]


def report(season: str, pool: list[dict], nhl_cap: float, info: dict[int, dict]):
    total = sum(p['cap'] for p in pool)
    rows = []
    for label, lo, hi in BUCKETS:
        grp = [p for p in pool if (y := years_since_draft(info.get(p['pid'], {}), season)) is not None and lo <= y <= hi]
        n = len(grp)
        avg = sum(p['cap'] for p in grp) / n / nhl_cap if n else 0
        rows.append((label, n, avg, sum(p['cap'] for p in grp) / total))
    young = sorted([p for p in pool if (y := years_since_draft(info.get(p['pid'], {}), season)) is not None and 4 <= y <= 7],
                   key=lambda p: -p['cap'])[:10]
    return rows, [(info.get(p['pid'], {}).get('name', p['pid']), p['cap'] / nhl_cap) for p in young]


def pct(x: float) -> str:
    return f'{x * 100:.1f} %'.replace('.', ',')


def main():
    load_dotenv(os.path.join(cf.ROOT, 'python_script', '.env'), override=True)
    sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
    results = {}
    for season in ['2014-15', '2015-16', '2025-26', '2026-27']:
        if season in hist.SEASONS:
            if not os.path.exists(os.path.join(hist.HERE, hist.SEASONS[season]['file'])):
                continue
            cands, cap = historical_candidates(season)
        else:
            cands, cap = current_candidates(sb, season)
        ranking = [cf.prev_season(cf.prev_season(season)), cf.prev_season(season)]
        info = {}
        for s in ranking:
            info.update(bios(s))
        results[season] = report(season, ideal_pool(cands), cap, info)
        print(f'{season} : ok', file=sys.stderr)

    print('## Coût moyen d\'un joueur de l\'équipe idéale, en % du plafond LNH\n')
    print('| Saison | ' + ' | '.join(b[0] for b in BUCKETS) + ' |')
    print('|---|' + '---|' * len(BUCKETS))
    for season, (rows, _) in results.items():
        print(f'| {season} | ' + ' | '.join(f'{pct(avg)} ({n} joueurs)' for _, n, avg, _ in rows) + ' |')
    print('\n## Part de la masse de l\'équipe idéale\n')
    print('| Saison | ' + ' | '.join(b[0] for b in BUCKETS) + ' |')
    print('|---|' + '---|' * len(BUCKETS))
    for season, (rows, _) in results.items():
        print(f'| {season} | ' + ' | '.join(pct(share) for *_, share in rows) + ' |')
    print('\n## Les 10 jeunes (4-7 ans) les plus chers, en % du plafond LNH\n')
    for season, (_, young) in results.items():
        print(f'- **{season}** : ' + ', '.join(f'{n} {pct(x)}' for n, x in young))


if __name__ == '__main__':
    main()
