"""Prix du marché : ce que coûterait l'équipe de pool « idéale » si tous ses joueurs étaient payés
au tarif des contrats récents (période de transition, voir calcul_facteur.md).

Beaucoup de contrats en vigueur ont été signés avec des plafonds LNH plus bas (ex. : Cale Makar,
9 M$ signé en 2021 avec un plafond de 81,5 M$). À leur renouvellement, ils seront payés au prix
actuel. Ce script mesure l'écart :

- « Prix du marché » d'un joueur = médiane, en % du plafond LNH, des contrats commençant en
  2026-27 (hors contrats d'entrée) des joueurs de même position et de même palier de talent
  (rang selon les points du pool, moyenne 2024-25 et 2025-26).
- Facteur naturel « au prix du marché » = même équipe idéale que calcul_facteur.py, chaque joueur
  hors ELC compté à ce prix.

Lecture seule (prod + API stats LNH).
    python_script/venv/Scripts/python calcul_salaire/prix_du_marche.py
"""
import os
import statistics
import sys

from dotenv import load_dotenv
from supabase import create_client

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyse_jeunes as aj  # noqa: E402
import calcul_facteur as cf  # noqa: E402

load_dotenv(os.path.join(cf.ROOT, 'python_script', '.env'), override=True)
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
S, CAP = '2026-27', cf.NHL_CAP['2026-27']
pts = aj.points_by_pid(['2024-25', '2025-26'])
raw = cf.fetch_all(lambda: sb.table('players').select('id, nhl_id, first_name, last_name, position, player_contracts (season, cap_number, is_elc)'))
cands = []
for p in raw:
    if not p['nhl_id'] or p['nhl_id'] not in pts: continue
    c = {x['season']: x for x in (p['player_contracts'] or [])}
    now = c.get(S, {}); before = c.get('2025-26', {})
    if now.get('cap_number') is None: continue
    new = (not now.get('is_elc')) and (before.get('cap_number') is None or before.get('is_elc') or abs(before['cap_number'] - now['cap_number']) > 1)
    cands.append({'pid': p['nhl_id'], 'name': f"{p['first_name']} {p['last_name']}", 'b': cf.bucket(p['position']),
                  'cap': now['cap_number'], 'pts': pts[p['nhl_id']], 'new': new, 'elc': bool(now.get('is_elc'))})
pool = aj.ideal_pool(cands)
# Paliers de talent : rang du joueur dans sa position (au sein de TOUS les candidats)
TIERS = {'F': [16, 48, 96, 140], 'D': [8, 24, 48, 70], 'G': [8, 16, 24]}
def tier(p):
    ranked = sorted([q for q in cands if q['b'] == p['b']], key=lambda q: -q['pts'])
    r = ranked.index(p) + 1
    for i, lim in enumerate(TIERS[p['b']]):
        if r <= lim: return i
    return len(TIERS[p['b']])
for q in cands: q['tier'] = tier(q)
market = {}
print('Prix du marché = médiane des contrats commençant en 2026-27, par position et palier de talent')
for b in 'FDG':
    for t in range(len(TIERS[b]) + 1):
        new = [q['cap'] / CAP for q in cands if q['b'] == b and q['tier'] == t and q['new']]
        allq = [q['cap'] / CAP for q in cands if q['b'] == b and q['tier'] == t and not q['elc']]
        if new:
            market[(b, t)] = statistics.median(new)
            print(f"  {b} palier {t}: {len(new):3} nouveaux contrats, médiane {statistics.median(new)*100:5.1f} % | tous contrats hors ELC {statistics.median(allq)*100:5.1f} %  ({len(allq)})")
actual = sum(p['cap'] for p in pool) / 8 / CAP
# Au prix du marché : chaque joueur hors ELC payé au prix médian de son palier (les ELC gardent leur contrat)
mkt = sum((p['cap'] if p['elc'] else market.get((p['b'], p['tier']), p['cap'] / CAP) * CAP) for p in pool) / 8 / CAP
print(f'\nFacteur naturel 2026-27, contrats en vigueur : {actual:.3f}')
print(f'Facteur naturel 2026-27, tous au prix du marché 2026-27 : {mkt:.3f}  (+{(mkt/actual-1)*100:.1f} %)')
under = sorted([(market.get((p['b'], p['tier']), 0) * CAP - p['cap'], p['name'], p['cap'] / CAP) for p in pool if not p['elc']], reverse=True)[:12]
print('Plus gros « rabais » actuels (contrat < prix du marché de leur palier) :')
for d, n, c in under: print(f'   {n:24} paie {c*100:4.1f} % du plafond, marché {(c + d/CAP)*100:4.1f} %  (+{d/1e6:.1f} M$)')
