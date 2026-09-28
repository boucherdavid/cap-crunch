"""
Corrige les projections captées par des fiches `players` en double (orphelins) — voir
SUIVI_PROJET.md, sessions 2026-09-22 et 2026-09-26.

Certains imports créent une seconde fiche sous une variante de prénom ("Mitch" vs "Mitchell",
"Matt" vs "Matthew"...) ; les scripts d'import de projections jumellent alors parfois sur
l'orphelin plutôt que sur la vraie fiche (celle des alignements/contrats). Ce script :
  1. déplace les projections de chaque orphelin vers la vraie fiche (ou les supprime si la
     vraie fiche a déjà cette source pour cette saison) ;
  2. supprime l'orphelin s'il n'est plus référencé nulle part (sinon, le signale et le garde —
     ex: "Mitch Marner", recréé avec des contrats par le pipeline PuckPedia) ;
  3. corrige la projection CBS d'Aliaksei Protas ("Alexei" chez CBS, non jumelé).

Jumelage par nom (les IDs diffèrent entre staging et prod). À relancer après chaque import de
projections, tant que le pipeline recrée ces orphelins.

Usage:
    python fix_projections_doublons.py --env staging            # dry-run
    python fix_projections_doublons.py --env prod --apply       # écrit (confirmation "oui")
"""

import argparse
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

from dotenv import dotenv_values
from supabase import create_client

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# (nom de famille, prénom de l'orphelin, prénom de la vraie fiche)
DUPLICATES = [
    ('Moser', 'J.J.', 'Janis Jérôme'),
    ('Beniers', 'Matty', 'Matthew'),
    ('Savoie', 'Matt', 'Matthew'),
    ('Simashev', 'Dmitriy', 'Dmitri'),
    ('Marner', 'Mitch', 'Mitchell'),
]

# Tables qui référencent players(id) — un orphelin encore référencé n'est jamais supprimé.
REFERENCES = [
    ('player_contracts', 'player_id'), ('pooler_rosters', 'player_id'),
    ('roster_change_log', 'player_id'), ('transaction_items', 'player_id'),
    ('player_stat_snapshots', 'player_id'), ('playoff_pool_rosters', 'player_id'),
    ('cap_signing_watch', 'player_id'), ('roster_changes', 'player_in_id'),
    ('roster_changes', 'player_out_id'), ('player_injuries', 'player_id'),
    ('ltir_requests', 'player_id'), ('waiver_claims', 'player_id'),
    ('trade_offer_items', 'player_id'),
]

# Valeur CBS 2026-27 d'"Alexei Protas" (63.09 dans CBS_Proj_2026-2027.xlsx, arrondi).
PROTAS_CBS = {'season': '2026-27', 'points': 63}


def find_player(db, last, first):
    rows = db.table('players').select('id, first_name').eq('last_name', last).execute().data
    matches = [r for r in rows if r['first_name'] == first]
    return matches[0]['id'] if len(matches) == 1 else None


def references(db, player_id):
    used = []
    for table, col in REFERENCES:
        try:
            n = db.table(table).select(col, count='exact', head=True).eq(col, player_id).execute().count
        except Exception:
            continue  # table absente dans cet environnement
        if n:
            used.append(f'{table} ({n})')
    return used


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--env', choices=['staging', 'prod'], required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    env_file = '.env.staging' if args.env == 'staging' else '.env'
    cfg = dotenv_values(os.path.join(BASE_DIR, env_file))
    db = create_client(cfg['SUPABASE_URL'], cfg['SUPABASE_SERVICE_KEY'])
    print(f'[INFO] Cible : {args.env} ({cfg["SUPABASE_URL"]})')

    ops = []  # (description, callable)
    for last, orphan_first, real_first in DUPLICATES:
        real = find_player(db, last, real_first)
        orphan = find_player(db, last, orphan_first)
        if real is None:
            print(f'[ATTENTION] {real_first} {last} : vraie fiche introuvable ou ambiguë — ignoré.')
            continue
        if orphan is None:
            print(f'[OK] {orphan_first} {last} : aucun orphelin.')
            continue

        projs = db.table('player_projections').select('id, season, source').eq('player_id', orphan).execute().data
        for p in projs:
            exists = db.table('player_projections').select('id').eq('player_id', real) \
                .eq('season', p['season']).eq('source', p['source']).execute().data
            if exists:
                ops.append((f'{orphan_first} {last} : projection {p["source"]} {p["season"]} supprimée (déjà sur la vraie fiche)',
                            lambda pid=p['id']: db.table('player_projections').delete().eq('id', pid).execute()))
            else:
                ops.append((f'{orphan_first} {last} : projection {p["source"]} {p["season"]} → {real_first} {last} (#{real})',
                            lambda pid=p['id'], r=real: db.table('player_projections').update({'player_id': r}).eq('id', pid).execute()))

        used = [u for u in references(db, orphan)]
        if used:
            print(f'[ATTENTION] {orphan_first} {last} (#{orphan}) gardé — encore référencé : {", ".join(used)}')
        else:
            ops.append((f'{orphan_first} {last} (#{orphan}) : fiche orpheline supprimée',
                        lambda o=orphan: db.table('players').delete().eq('id', o).execute()))

    aliaksei = find_player(db, 'Protas', 'Aliaksei')
    if aliaksei is not None:
        cur = db.table('player_projections').select('projected_points').eq('player_id', aliaksei) \
            .eq('season', PROTAS_CBS['season']).eq('source', 'cbs').execute().data
        if not cur or cur[0]['projected_points'] != PROTAS_CBS['points']:
            ops.append((f'Aliaksei Protas : CBS {PROTAS_CBS["season"]} = {PROTAS_CBS["points"]} (était {cur[0]["projected_points"] if cur else "absent"})',
                        lambda: db.table('player_projections').upsert(
                            {'player_id': aliaksei, 'season': PROTAS_CBS['season'], 'source': 'cbs',
                             'projected_points': PROTAS_CBS['points']},
                            on_conflict='player_id,season,source').execute()))

    print()
    if not ops:
        print('[OK] Rien à corriger.')
        return
    for desc, _ in ops:
        print(f'  - {desc}')
    if not args.apply:
        print('\n[DRY-RUN] Aucune écriture. Relancez avec --apply pour appliquer.')
        return
    if input(f'\nAppliquer {len(ops)} correction(s) sur {args.env} ? (oui/non) ').strip().lower() != 'oui':
        print('Annulé.')
        return
    for desc, fn in ops:
        fn()
    print(f'[OK] {len(ops)} correction(s) appliquée(s).')


if __name__ == '__main__':
    main()
