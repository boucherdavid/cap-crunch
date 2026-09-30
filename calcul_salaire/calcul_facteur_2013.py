"""Facteur naturel et réalisé de 2013-14, à partir de « Pool LT - 2013-2014.xls ».

Même méthode que calcul_facteur.py, appliquée à la plus vieille saison documentée du pool, pour
mesurer la « pression d'origine » du facteur 1,24 (déjà en vigueur : 80 M$ ≈ 1,24 × 64,3 M$).

- Contrats : feuille « Données » (cap hit 13/14, en M$).
- Alignements réels : une feuille par pooler (actifs + réservistes, comme le plafond de 80 M$).
- Classement : points du pool, moyenne de 2011-12 et 2012-13 (saison écourtée par le lock-out).

Lecture seule. Exige le module xlrd (fichiers .xls) :
    python_script/venv/Scripts/python -m pip install xlrd
    python_script/venv/Scripts/python calcul_salaire/calcul_facteur_2013.py
"""
import os
import sys
import unicodedata

import xlrd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from calcul_facteur import pool_points_by_season  # noqa: E402

XLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Pool LT - 2013-2014.xls')
NHL_CAP_2013 = 64_300_000
POOL_CAP_2013 = 80_000_000
SLOTS = {'F': 12, 'D': 6, 'G': 2}
RESERVES = 2
# Barème actuel du pool (scoring_config) — supposé identique en 2013-14.
PTS = {'goal': 1, 'assist': 1, 'goalie_win': 2, 'goalie_otl': 1, 'goalie_shutout': 2}


def norm(name: str) -> str:
    name = name.replace('\xa0', ' ').strip()
    if ',' in name:
        last, first = [x.strip() for x in name.split(',', 1)]
        name = f'{first} {last}'
    name = ''.join(c for c in unicodedata.normalize('NFD', name.lower()) if unicodedata.category(c) != 'Mn')
    return ' '.join(name.replace('.', ' ').replace('-', ' ').split())


def bucket(pos: str) -> str:
    return 'G' if pos.startswith('Goal') else 'D' if pos.startswith('Def') else 'F'


def nhl_names(season_id: str) -> dict[int, str]:
    import requests
    out = {}
    for kind, field in (('skater', 'skaterFullName'), ('goalie', 'goalieFullName')):
        data = requests.get(f'https://api.nhle.com/stats/rest/en/{kind}/summary',
                            params={'limit': -1, 'cayenneExp': f'seasonId={season_id} and gameTypeId=2'}, timeout=60).json()['data']
        out.update({d['playerId']: norm(d[field]) for d in data})
    return out


def main():
    wb = xlrd.open_workbook(XLS)
    donnees = wb.sheet_by_name('Données')
    players = {}
    for r in range(2, donnees.nrows):
        name, team, pos, cap = donnees.row_values(r)[:4]
        if not name or not isinstance(cap, float) or cap <= 0:
            continue
        players[norm(name)] = {'name': name, 'b': bucket(pos), 'cap': cap * 1e6}

    seasons = ['2011-12', '2012-13']
    pts_by_name: dict[str, list[float]] = {}
    for s in seasons:
        sid = f'{s[:4]}{int(s[:4]) + 1}'
        names = nhl_names(sid)
        for pid, p in pool_points_by_season(s, PTS).items():
            if pid in names:
                pts_by_name.setdefault(names[pid], []).append(p)

    # Secours pour les variantes de prénom (Mike/Michael, P.A./Pierre-Alexandre, Dan/Daniel...) :
    # nom de famille + initiale du prénom, seulement si ce couple est unique dans les stats.
    by_initial: dict[str, list[str]] = {}
    for k in pts_by_name:
        first, _, last = k.partition(' ')
        by_initial.setdefault(f'{last}|{first[:1]}', []).append(k)

    def stats_key(k: str) -> str | None:
        if k in pts_by_name:
            return k
        first, _, last = k.partition(' ')
        cands = by_initial.get(f'{last}|{first[:1]}', [])
        return cands[0] if len(cands) == 1 else None

    pool = []
    for k, p in players.items():
        sk = stats_key(k)
        if sk:
            pool.append({**p, 'pts': sum(pts_by_name[sk]) / len(pts_by_name[sk])})
    print(f'Contrats 2013-14 : {len(players)} joueurs ; jumelés aux stats : {len(pool)}')

    # Alignements réels (actifs + réservistes), une feuille par pooler.
    poolers = [s for s in wb.sheet_names() if s not in ('Règlements', 'Données', 'Validation')]
    masses, reserve_counts = {}, {}
    for pn in poolers:
        sh = wb.sheet_by_name(pn)
        total, nres = 0.0, 0
        for r in range(2, 22):
            row = sh.row_values(r)
            if row[1] and isinstance(row[4], float):
                total += row[4]
            if row[8] and isinstance(row[11], float):
                total += row[11]
                nres += 1
        masses[pn], reserve_counts[pn] = total * 1e6, nres

    def natural(n_poolers: int, reserves: int = RESERVES) -> float:
        chosen, taken = [], set()
        for b, n in SLOTS.items():
            top = sorted([p for p in pool if p['b'] == b], key=lambda p: -p['pts'])[:n * n_poolers]
            chosen += top
            taken |= {id(p) for p in top}
        rest = sorted([p for p in pool if id(p) not in taken], key=lambda p: -p['pts'])[:reserves * n_poolers]
        return sum(p['cap'] for p in chosen + rest) / n_poolers / NHL_CAP_2013

    n = len(poolers)
    real = sum(masses.values()) / n / NHL_CAP_2013
    print(f'\nPoolers : {n} ({", ".join(poolers)}) ; réservistes par équipe : {sorted(reserve_counts.values())}')
    print(f'Plafond LNH 2013-14 : 64,3 M$ ; plafond du pool : 80 M$ = {POOL_CAP_2013 / NHL_CAP_2013:.3f} × LNH')
    print(f'Facteur naturel 2013-14 ({n} poolers, 22 joueurs)  : {natural(n):.3f}')
    print(f'Facteur naturel 2013-14 (si 8 poolers)            : {natural(8):.3f}')
    print(f'Facteur réalisé 2013-14 : {real:.3f} (masse moyenne {sum(masses.values()) / n / 1e6:.1f} M$ ; '
          f'de {min(masses.values()) / NHL_CAP_2013:.3f} à {max(masses.values()) / NHL_CAP_2013:.3f})')
    print(f'Pression d\'origine (1,24 ÷ naturel) : {1.24 / natural(n):.3f}')


if __name__ == '__main__':
    main()
