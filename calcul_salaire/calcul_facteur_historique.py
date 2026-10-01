"""Facteur naturel et réalisé des saisons historiques du pool, à partir des fichiers Excel de David.

Même méthode que calcul_facteur.py, appliquée aux plus vieilles saisons documentées, pour mesurer
la « pression d'origine » du facteur (né d'un plafond de pool de 80 M$ : 80 ÷ 64,9 ≈ 1,233,
d'après le bloc « Calcul Plafond Salarial » du fichier 2014-15).

Pour chaque saison :
- Contrats : feuille « Données » (cap hit de la saison, en M$).
- Alignements réels : une feuille par pooler (actifs + réservistes, comme le plafond du pool).
- Classement : points du pool, moyenne des deux saisons précédentes (2012-13 = lock-out, 48 matchs).

Lecture seule. Exige xlrd (.xls) et openpyxl (.xlsx) :
    python_script/venv/Scripts/python -m pip install xlrd openpyxl
    python_script/venv/Scripts/python calcul_salaire/calcul_facteur_historique.py
Les fichiers Excel ne sont pas versionnés (dépôt public, voir .gitignore).
"""
import os
import sys
import unicodedata

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from calcul_facteur import pool_points_by_season  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SLOTS = {'F': 12, 'D': 6, 'G': 2}
RESERVES = 2
# Barème actuel du pool (scoring_config) — supposé identique à l'époque.
PTS = {'goal': 1, 'assist': 1, 'goalie_win': 2, 'goalie_otl': 1, 'goalie_shutout': 2}
NOT_POOLERS = {'Règlements', 'Données', 'Validation', 'Recrues (Repêchage)'}

SEASONS = {
    '2013-14': {'file': 'Pool LT - 2013-2014.xls', 'nhl_cap': 64_300_000, 'pool_cap': 80_000_000, 'layout': 'deux_colonnes'},
    '2014-15': {'file': 'Pool LT - 2014-2015.xlsx', 'nhl_cap': 69_000_000, 'pool_cap': 85_000_000, 'layout': 'une_colonne'},
    '2015-16': {'file': 'Pool LT - 2015-2016.xlsx', 'nhl_cap': 71_400_000, 'pool_cap': 88_000_000, 'layout': 'une_colonne'},
}


def read_workbook(path: str) -> dict[str, list[list]]:
    """{nom de feuille: lignes} pour un .xls (xlrd) ou un .xlsx (openpyxl, valeurs calculées)."""
    if path.endswith('.xls'):
        import xlrd
        wb = xlrd.open_workbook(path)
        return {sh.name: [sh.row_values(r) for r in range(sh.nrows)] for sh in wb.sheets()}
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    return {ws.title: [list(r) for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets}


def num(v) -> float | None:
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(',', '.'))
    except (TypeError, ValueError):
        return None


def cell(row: list, i: int):
    return row[i] if i < len(row) else None


def norm(name: str) -> str:
    name = str(name).replace('\xa0', ' ').strip()
    if ',' in name:
        last, first = [x.strip() for x in name.split(',', 1)]
        name = f'{first} {last}'
    name = ''.join(c for c in unicodedata.normalize('NFD', name.lower()) if unicodedata.category(c) != 'Mn')
    return ' '.join(name.replace('.', ' ').replace('-', ' ').split())


def bucket(pos: str) -> str:
    pos = str(pos)
    return 'G' if pos.startswith('Goal') else 'D' if pos.startswith('Def') else 'F'


def prev(season: str) -> str:
    start = int(season[:4]) - 1
    return f'{start}-{str(start + 1)[-2:]}'


def roster_masses(sheets: dict, layout: str) -> dict[str, float]:
    """Masse (actifs + réservistes, en $) de chaque pooler."""
    out = {}
    for name, rows in sheets.items():
        if name in NOT_POOLERS:
            continue
        total = 0.0
        if layout == 'deux_colonnes':          # 2013-14 : actifs colonnes B/E, réservistes I/L
            for row in rows[2:22]:
                for name_col, cap_col in ((1, 4), (8, 11)):
                    cap = num(cell(row, cap_col))
                    if cell(row, name_col) and cap:
                        total += cap
        else:                                  # 2014-15 : une seule colonne jusqu'à « TOTAL »
            for row in rows[2:]:
                if str(cell(row, 0) or '').strip().upper() == 'TOTAL':
                    break
                cap = num(cell(row, 4))
                if cell(row, 1) and cap:
                    total += cap
        out[name] = total * 1e6
    return out


def nhl_names(season: str) -> dict[int, str]:
    sid = f'{season[:4]}{int(season[:4]) + 1}'
    out = {}
    for kind, field in (('skater', 'skaterFullName'), ('goalie', 'goalieFullName')):
        data = requests.get(f'https://api.nhle.com/stats/rest/en/{kind}/summary',
                            params={'limit': -1, 'cayenneExp': f'seasonId={sid} and gameTypeId=2'}, timeout=60).json()['data']
        out.update({d['playerId']: norm(d[field]) for d in data})
    return out


def analyse(season: str, cfg: dict) -> dict:
    sheets = read_workbook(os.path.join(HERE, cfg['file']))
    players = {}
    for row in sheets['Données'][2:]:
        name, pos, cap = cell(row, 0), cell(row, 2), num(cell(row, 3))
        if name and cap and cap > 0:
            players[norm(name)] = {'b': bucket(pos), 'cap': cap * 1e6}

    ranking = [prev(prev(season)), prev(season)]
    pts_by_name: dict[str, list[float]] = {}
    for s in ranking:
        names = nhl_names(s)
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

    def natural(n_poolers: int) -> float:
        chosen, taken = [], set()
        for b, n in SLOTS.items():
            top = sorted([p for p in pool if p['b'] == b], key=lambda p: -p['pts'])[:n * n_poolers]
            chosen += top
            taken |= {id(p) for p in top}
        rest = sorted([p for p in pool if id(p) not in taken], key=lambda p: -p['pts'])[:RESERVES * n_poolers]
        return sum(p['cap'] for p in chosen + rest) / n_poolers / cfg['nhl_cap']

    masses = roster_masses(sheets, cfg['layout'])
    n = len(masses)
    return {
        'season': season, 'ranking': ranking, 'contracts': len(players), 'matched': len(pool), 'poolers': n,
        'pool_factor': cfg['pool_cap'] / cfg['nhl_cap'],
        'natural_n': natural(n), 'natural_8': natural(8),
        'realized': sum(masses.values()) / n / cfg['nhl_cap'],
        'realized_min': min(masses.values()) / cfg['nhl_cap'], 'realized_max': max(masses.values()) / cfg['nhl_cap'],
    }


def f(x: float) -> str:
    return f'{x:.3f}'.replace('.', ',')


def main():
    print('| Saison | Plafond LNH | Plafond du pool | Classement sur | Poolers | Naturel (poolers réels) | Naturel (8 poolers) | '
          'Réalisé (min – max) | Taux de pression (8 poolers) | Contrats jumelés |')
    print('|---|---|---|---|---|---|---|---|---|---|')
    for season, cfg in SEASONS.items():
        if not os.path.exists(os.path.join(HERE, cfg['file'])):
            print(f'| {season} | fichier absent : {cfg["file"]} |')
            continue
        r = analyse(season, cfg)
        print(f"| {season} | {cfg['nhl_cap'] / 1e6:.1f} M$ | {cfg['pool_cap'] / 1e6:.0f} M$ ({f(r['pool_factor'])}) | "
              f"{r['ranking'][0]} + {r['ranking'][1]} | {r['poolers']} | {f(r['natural_n'])} | {f(r['natural_8'])} | "
              f"{f(r['realized'])} ({f(r['realized_min'])} – {f(r['realized_max'])}) | "
              f"**{r['pool_factor'] / r['natural_8']:.0%}** | {r['matched']} / {r['contracts']} |")


if __name__ == '__main__':
    main()
