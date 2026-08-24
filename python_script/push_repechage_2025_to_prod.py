"""
Relie le résultat du repêchage recrues 2025 (saison 2025-26) à l'historique déjà réel
en prod, pour consultation — /repechage-recrues, /admin/repechage, /admin/init?tab=choix.

Contexte : contrairement à l'hypothèse de départ, prod a bel et bien 351 lignes
pooler_rosters réelles pour 2025-26 (saison jouée normalement dans l'app). Ce qui
manque, c'est uniquement le lien vers le repêchage : pool_draft_picks.is_used=false
sur les 32 choix, et aucune des 32 lignes pooler_rosters correspondantes n'a
rookie_type/pool_draft_year/draft_pick_id renseignés (ces recrues ont été entrées
directement, pas via /admin/repechage). Le repêchage a été recréé et validé en
staging (32/32 sélections distinctes, vérifié le 2026-07-17).

Ce script ne fait donc AUCUN insert de roster — seulement :
1. UPDATE des 32 lignes pooler_rosters déjà existantes en prod (retrouvées par
   pooler+joueur) : rookie_type='repeche', pool_draft_year=2025, draft_pick_id=<pick>.
   player_type/is_active/added_at/removed_at réels ne sont jamais touchés.
2. UPDATE des 32 pool_draft_picks : is_used=true seulement (current_owner_id n'est
   PAS écrasé — l'ownership réelle en prod est la source de vérité, pas la
   reconstruction staging, qui peut diverger si un échange a eu lieu depuis).

Le pooler assigné à chaque pick est déterminé par pool_draft_picks.current_owner_id
en STAGING, puis vérifié : la ligne pooler_rosters correspondante doit déjà exister
en PROD sous ce même pooler pour ce joueur — sinon abandon (voir "poolers assignés").
Un accord 32/32 confirme que la reconstruction staging correspond à la réalité prod.

pool_draft_picks.id et poolers.id sont identiques entre staging et prod (même origine
de clone, confirmé dans sync_staging_to_prod.py) — pas de remapping nécessaire pour
ces deux-là. players.id peut diverger — mappé par nhl_id, puis par (prénom, nom).

Usage:
    python push_repechage_2025_to_prod.py            # dry-run : affiche ce qui serait fait
    python push_repechage_2025_to_prod.py --apply     # exécute réellement (confirmation "oui" requise)
"""

import os
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
from supabase import create_client

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SEASON_LABEL = '2025-26'
POOL_DRAFT_YEAR = 2025


class Tee:
    """Duplique stdout vers un fichier de log, comme les autres scripts du pipeline."""
    def __init__(self, path):
        self.file = open(path, 'w', encoding='utf-8')
        self.stdout = sys.stdout

    def write(self, data):
        self.stdout.write(data)
        self.file.write(data)

    def flush(self):
        self.stdout.flush()
        self.file.flush()


def connect(env_file: str):
    load_dotenv(os.path.join(BASE_DIR, env_file), override=True)
    url = os.environ['SUPABASE_URL']
    key = os.environ['SUPABASE_SERVICE_KEY']
    return create_client(url, key), url


def get_season_id(db, label: str) -> int:
    r = db.table('pool_seasons').select('id, season').eq('season', SEASON_LABEL).single().execute()
    if not r.data:
        raise SystemExit(f'[ERREUR] Saison {SEASON_LABEL} introuvable en {label}.')
    return r.data['id']


def fetch_all_players(db):
    all_rows, offset, page = [], 0, 1000
    while True:
        r = db.table('players').select('id, nhl_id, first_name, last_name').range(offset, offset + page - 1).execute()
        all_rows.extend(r.data)
        if len(r.data) < page:
            break
        offset += page
    return all_rows


def build_player_map(staging_players, prod_players):
    prod_by_nhl = {}
    prod_by_name = {}
    for p in prod_players:
        if p['nhl_id']:
            prod_by_nhl[p['nhl_id']] = p['id']
        key = (p['first_name'].strip().lower(), p['last_name'].strip().lower())
        prod_by_name.setdefault(key, []).append(p['id'])

    mapping = {}
    problems = []
    for p in staging_players:
        if p['nhl_id'] and p['nhl_id'] in prod_by_nhl:
            mapping[p['id']] = prod_by_nhl[p['nhl_id']]
            continue
        key = (p['first_name'].strip().lower(), p['last_name'].strip().lower())
        candidates = prod_by_name.get(key, [])
        if len(candidates) == 1:
            mapping[p['id']] = candidates[0]
        elif len(candidates) == 0:
            problems.append(f'  INTROUVABLE en prod : {p["first_name"]} {p["last_name"]} (staging id={p["id"]})')
        else:
            problems.append(f'  AMBIGU en prod ({len(candidates)} candidats) : {p["first_name"]} {p["last_name"]} (staging id={p["id"]})')
    return mapping, problems


def main():
    apply_changes = '--apply' in sys.argv

    logs_dir = os.path.join(BASE_DIR, 'logs')
    os.makedirs(logs_dir, exist_ok=True)
    log_path = os.path.join(logs_dir, f'push_repechage_2025_{datetime.now().strftime("%Y-%m-%d_%H-%M-%S")}.log')
    sys.stdout = Tee(log_path)
    print(f'[INFO] Log : {log_path}')

    print('=' * 60)
    print('  Repêchage recrues 2025 : staging -> prod (consultation)')
    print('=' * 60)
    print(f'  Mode : {"APPLICATION REELLE" if apply_changes else "dry-run (aucune ecriture)"}')

    staging_db, staging_url = connect('.env.staging')
    prod_db, prod_url = connect('.env')
    print(f'[INFO] Source (staging) : {staging_url}')
    print(f'[INFO] Cible  (prod)    : {prod_url}')

    staging_season_id = get_season_id(staging_db, 'staging')
    prod_season_id = get_season_id(prod_db, 'prod')

    poolers = {p['id']: p['name'] for p in prod_db.table('poolers').select('id, name').execute().data}

    picks = staging_db.table('pool_draft_picks').select(
        'id, round, original_owner_id, current_owner_id, is_used, draft_order'
    ).eq('pool_season_id', staging_season_id).eq('is_used', True).order('round').execute().data

    if not picks:
        raise SystemExit(f'[ERREUR] Aucun choix marqué is_used=true en staging pour {SEASON_LABEL}.')

    pick_ids = [p['id'] for p in picks]
    rosters = staging_db.table('pooler_rosters').select(
        'draft_pick_id, player_id, pooler_id, rookie_type, pool_draft_year, added_at'
    ).in_('draft_pick_id', pick_ids).execute().data
    roster_by_pick = {r['draft_pick_id']: r for r in rosters}

    missing = [p for p in picks if p['id'] not in roster_by_pick]
    if missing:
        print(f'\n[ERREUR] {len(missing)} choix marqués utilisés en staging sans ligne pooler_rosters liée :')
        for p in missing:
            print(f'  pick id={p["id"]} ronde {p["round"]}')
        sys.exit(1)

    print('\n[INFO] Chargement des joueurs (staging + prod) pour construire le mapping...')
    staging_players = fetch_all_players(staging_db)
    prod_players = fetch_all_players(prod_db)
    player_map, problems = build_player_map(staging_players, prod_players)

    referenced_ids = {r['player_id'] for r in roster_by_pick.values()}
    unmapped = referenced_ids - set(player_map.keys())
    if unmapped:
        print(f'\n[ERREUR] {len(unmapped)} joueur(s) repêché(s) sans correspondance fiable en prod :')
        for p in problems:
            if any(f'staging id={pid})' in p for pid in unmapped):
                print(p)
        print('\n[ERREUR] Abandon — aucune ecriture effectuee.')
        sys.exit(1)

    prod_picks = prod_db.table('pool_draft_picks').select('id, is_used, current_owner_id').eq(
        'pool_season_id', prod_season_id
    ).in_('id', pick_ids).execute().data
    already_used = [p for p in prod_picks if p['is_used']]

    existing_rosters = prod_db.table('pooler_rosters').select(
        'id, player_id, pooler_id, player_type, is_active, rookie_type, pool_draft_year, draft_pick_id'
    ).eq('pool_season_id', prod_season_id).execute().data
    existing_by_pair = {(r['pooler_id'], r['player_id']): r for r in existing_rosters}

    print(f'\n[INFO] {len(picks)} choix repêchés à relier en prod :\n')
    plan = []
    unmatched = []
    for p in sorted(picks, key=lambda x: (x['round'], x['id'])):
        r = roster_by_pick[p['id']]
        staging_pname = next((f'{sp["first_name"]} {sp["last_name"]}' for sp in staging_players if sp['id'] == r['player_id']), '?')
        prod_pid = player_map[r['player_id']]
        # Le pooler assigné est celui qui détenait le pick au moment du repêchage
        # (current_owner_id en STAGING) — on vérifie ensuite qu'une ligne prod réelle
        # existe bien sous ce même pooler pour ce joueur, sinon abandon (voir plus bas).
        drafting_pooler_id = p['current_owner_id']
        pooler_name = poolers.get(drafting_pooler_id, drafting_pooler_id)

        existing = existing_by_pair.get((drafting_pooler_id, prod_pid))
        if not existing:
            print(f'  Ronde {p["round"]:>1}  {pooler_name:<20} -> {staging_pname}  [AUCUNE ligne prod correspondante]')
            unmatched.append((p, staging_pname, pooler_name))
            continue

        already_linked = existing['draft_pick_id'] is not None and existing['draft_pick_id'] != p['id']
        flag = '  [déjà lié à un autre pick !]' if already_linked else ''
        print(f'  Ronde {p["round"]:>1}  {pooler_name:<20} -> {staging_pname}  (roster id={existing["id"]}, type={existing["player_type"]}){flag}')
        plan.append({
            'pick_id': p['id'],
            'roster_id': existing['id'],
            'pool_draft_year': r['pool_draft_year'] or POOL_DRAFT_YEAR,
        })

    if unmatched:
        print(f'\n[ERREUR] {len(unmatched)} choix sans ligne pooler_rosters correspondante en prod — abandon (pas de fabrication de données).')
        sys.exit(1)

    if already_used:
        print(f'\n[AVERTISSEMENT] {len(already_used)} choix déjà marqués is_used=true en prod.')

    if not apply_changes:
        print('\n[DRY-RUN] Aucune ecriture effectuee. Relancer avec --apply pour executer.')
        return

    print('\n' + '!' * 60)
    print(f'  Ceci va marquer {len(plan)} choix comme utilisés (is_used=true) et mettre à')
    print(f'  jour {len(plan)} lignes pooler_rosters EXISTANTES (rookie_type, pool_draft_year,')
    print(f'  draft_pick_id) dans la saison {SEASON_LABEL} en PROD ({prod_url}).')
    print('  Aucune ligne pooler_rosters n\'est insérée ni supprimée ; player_type,')
    print('  is_active, added_at, removed_at ne sont pas touchés.')
    print('!' * 60)
    confirm = input('Continuer ? (oui/non) : ').strip().lower()
    if confirm != 'oui':
        print('Annule.')
        return

    print(f'\n[INFO] Mise à jour de {len(plan)} pool_draft_picks en prod (is_used=true)...')
    for e in plan:
        prod_db.table('pool_draft_picks').update({'is_used': True}).eq('id', e['pick_id']).execute()

    print(f'[INFO] Mise à jour de {len(plan)} lignes pooler_rosters en prod (lien repêchage)...')
    for e in plan:
        prod_db.table('pooler_rosters').update({
            'rookie_type': 'repeche',
            'pool_draft_year': e['pool_draft_year'],
            'draft_pick_id': e['pick_id'],
        }).eq('id', e['roster_id']).execute()

    print(f'\n[OK] Terminé. Log : {log_path}')


if __name__ == '__main__':
    main()
