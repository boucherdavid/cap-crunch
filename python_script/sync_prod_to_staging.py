"""
Copie les alignements réels de prod vers staging, pour tester sur de vraies données
(David, 2026-10-04). Sens inverse de sync_staging_to_prod.py, dont il réutilise le
mapping des joueurs.

Écrit TOUJOURS dans staging (python_script/.env.staging), ne lit que prod (.env).

Portée — chaque saison régulière qui a des alignements ou des transactions en prod
(ex : 2025-26 et 2026-27), jumelée à la saison staging du même libellé :
  - pooler_rosters, roster_change_log, transactions + transaction_items (journal)
    → REMPLACEMENT COMPLET (supprimés en staging puis réinsérés depuis prod) ;
  - presaison_draft_state, presaison_pooler_ready → remplacés aussi ;
  - pool_seasons → réglages et état copiés (season_started, dates, ordre du repêchage,
    cap...), sauf id/created_at.
Aussi copiés (David, 2026-10-06), pour tester le LTIR sur l'état réel :
  - player_injuries → remplacement complet (le scraper ne met à jour que prod) ; un joueur
    blessé absent de staging est simplement ignoré ;
  - ltir_requests des saisons copiées → remplacement complet ;
  - ltir_return_watch des saisons copiées → vidé : la détection de l'app le reconstruit à partir
    des alignements copiés (voir app/lib/ltirReturns.ts) ;
  - app_settings (seuils LTIR, délais...) → copié.
Choix de repêchage (toutes les saisons) : propriétaire actuel, utilisé, ordre — mis à jour
sur place (jamais supprimés : d'autres tables y font référence), jumelés par
(saison, propriétaire d'origine, ronde) car pool_draft_picks.id diverge entre les bases.

Hors portée : joueurs/contrats (pipeline), comptes poolers (mêmes id des deux côtés),
ballotage, échanges proposés, marché des échanges — opérations vivantes, à tester à partir
d'un état propre.

Usage:
    python sync_prod_to_staging.py            # dry-run : affiche ce qui serait fait
    python sync_prod_to_staging.py --apply    # exécute (staging seulement, sans confirmation)
"""

import os
import sys
import time
from datetime import datetime

from sync_staging_to_prod import BASE_DIR, Tee, connect, fetch_all_players, build_player_map

PAGE = 1000
# pool_cap est une colonne générée (nhl_cap × cap_multiplier, arrondi) : non modifiable.
SEASON_SKIP_COLUMNS = ('id', 'created_at', 'pool_cap')


def fetch_all(db, table: str, columns: str, **eq):
    rows, offset = [], 0
    while True:
        q = db.table(table).select(columns)
        for k, v in eq.items():
            q = q.eq(k, v)
        chunk = q.order('id').range(offset, offset + PAGE - 1).execute().data or []
        rows.extend(chunk)
        if len(chunk) < PAGE:
            return rows
        offset += PAGE


def insert_batches(db, table: str, payload: list[dict]) -> list[dict]:
    out = []
    for i in range(0, len(payload), 500):
        out.extend(db.table(table).insert(payload[i:i + 500]).execute().data or [])
    return out


def main():
    apply_changes = '--apply' in sys.argv

    logs_dir = os.path.join(BASE_DIR, 'logs')
    os.makedirs(logs_dir, exist_ok=True)
    log_path = os.path.join(logs_dir, f'sync_prod_to_staging_{datetime.now().strftime("%Y-%m-%d_%H-%M-%S")}.log')
    sys.stdout = Tee(log_path)
    print(f'[INFO] Log : {log_path}')
    print('=' * 60)
    print('  Copie prod -> staging (alignements réels)')
    print('=' * 60)
    print(f'  Mode : {"APPLICATION REELLE (staging)" if apply_changes else "dry-run (aucune ecriture)"}')

    prod_db, prod_url = connect('.env')
    staging_db, staging_url = connect('.env.staging')
    if prod_url == staging_url:
        raise SystemExit('[ERREUR] .env et .env.staging pointent vers la même base — abandon.')
    print(f'[INFO] Source (prod)    : {prod_url}')
    print(f'[INFO] Cible  (staging) : {staging_url}')

    # ── Saisons ──────────────────────────────────────────────────────────────
    prod_seasons = prod_db.table('pool_seasons').select('*').order('id').execute().data
    staging_seasons = staging_db.table('pool_seasons').select('id, season, is_playoff').execute().data
    staging_by_label = {(s['season'], s['is_playoff']): s['id'] for s in staging_seasons}
    season_map = {}   # prod season id -> staging season id
    for s in prod_seasons:
        key = (s['season'], s['is_playoff'])
        if key in staging_by_label:
            season_map[s['id']] = staging_by_label[key]

    # ── Données prod ─────────────────────────────────────────────────────────
    rosters = fetch_all(prod_db, 'pooler_rosters',
        'id, pooler_id, player_id, pool_season_id, player_type, is_active, added_at, removed_at, rookie_type, pool_draft_year, draft_pick_id')
    changelog = fetch_all(prod_db, 'roster_change_log',
        'id, player_id, pooler_id, pool_season_id, change_type, old_type, new_type, changed_by, changed_at, is_admin_override, created_at, pick_id')
    transactions = fetch_all(prod_db, 'transactions', 'id, pool_season_id, notes, created_by, created_at')
    items = fetch_all(prod_db, 'transaction_items',
        'id, transaction_id, action_type, from_pooler_id, to_pooler_id, player_id, pick_id, old_player_type, new_player_type')
    picks = fetch_all(prod_db, 'pool_draft_picks',
        'id, pool_season_id, original_owner_id, current_owner_id, round, is_used, draft_order')
    injuries = fetch_all(prod_db, 'player_injuries', '*')
    ltir_requests = fetch_all(prod_db, 'ltir_requests', '*')
    app_settings = (prod_db.table('app_settings').select('*').eq('id', 1).execute().data or [None])[0]
    draft_states = prod_db.table('presaison_draft_state').select('*').execute().data or []
    ready_rows = prod_db.table('presaison_pooler_ready').select('*').execute().data or []

    synced = sorted({r['pool_season_id'] for r in rosters} | {t['pool_season_id'] for t in transactions})
    missing = [sid for sid in synced if sid not in season_map]
    if missing:
        raise SystemExit(f'[ERREUR] Saison(s) prod sans équivalent en staging : {missing} — abandon.')
    labels = {s['id']: s['season'] for s in prod_seasons}
    print(f'[INFO] Saisons copiées : {", ".join(f"{labels[sid]} (prod {sid} -> staging {season_map[sid]})" for sid in synced)}')

    # ── Mapping joueurs (prod -> staging) ────────────────────────────────────
    print('\n[INFO] Chargement des joueurs pour le mapping...')
    player_map, problems = build_player_map(fetch_all_players(prod_db), fetch_all_players(staging_db))

    # ── Mapping choix de repêchage ───────────────────────────────────────────
    staging_picks = fetch_all(staging_db, 'pool_draft_picks', 'id, pool_season_id, original_owner_id, round')
    staging_pick_by_key = {(p['pool_season_id'], p['original_owner_id'], p['round']): p['id'] for p in staging_picks}
    pick_map = {}
    for p in picks:
        sid = season_map.get(p['pool_season_id'])
        key = (sid, p['original_owner_id'], p['round'])
        if key in staging_pick_by_key:
            pick_map[p['id']] = staging_pick_by_key[key]

    # ── Vérifications ────────────────────────────────────────────────────────
    synced_set = set(synced)
    rosters = [r for r in rosters if r['pool_season_id'] in synced_set]
    changelog = [c for c in changelog if c['pool_season_id'] in synced_set]
    transactions = [t for t in transactions if t['pool_season_id'] in synced_set]
    ltir_requests = [r for r in ltir_requests if r['pool_season_id'] in synced_set]
    tx_ids = {t['id'] for t in transactions}
    items = [i for i in items if i['transaction_id'] in tx_ids]

    ref_players = ({r['player_id'] for r in rosters} | {c['player_id'] for c in changelog if c['player_id']}
                   | {i['player_id'] for i in items if i['player_id']}
                   | {r['ltir_player_id'] for r in ltir_requests if r['ltir_player_id']}
                   | {r['new_player_id'] for r in ltir_requests if r['new_player_id']})
    injuries_mapped = [i for i in injuries if i['player_id'] in player_map]
    ref_picks = ({r['draft_pick_id'] for r in rosters if r['draft_pick_id']} | {c['pick_id'] for c in changelog if c['pick_id']}
                 | {i['pick_id'] for i in items if i['pick_id']})
    unmapped_players = ref_players - set(player_map)
    unmapped_picks = ref_picks - set(pick_map)

    print(f'\n[INFO] pooler_rosters      : {len(rosters)}')
    print(f'[INFO] roster_change_log   : {len(changelog)}')
    print(f'[INFO] transactions        : {len(transactions)} ({len(items)} items)')
    print(f'[INFO] choix de repêchage  : {len(picks)} en prod, {len(pick_map)} jumelés en staging')
    print(f'[INFO] blessures           : {len(injuries_mapped)} (sur {len(injuries)} en prod, le reste absent de staging)')
    print(f'[INFO] demandes de LTIR    : {len(ltir_requests)}')

    if unmapped_players:
        print(f'\n[ERREUR] {len(unmapped_players)} joueur(s) de prod sans correspondance fiable en staging :')
        for p in problems:
            print(p)
        print('  Piste : rouler ./run_pipeline_staging.ps1 --no-scrape pour importer ces joueurs en staging.')
        print('[ERREUR] Abandon — aucune écriture.')
        sys.exit(1)
    if unmapped_picks:
        print(f'\n[ERREUR] {len(unmapped_picks)} choix de repêchage référencé(s) sans correspondance en staging : {sorted(unmapped_picks)}')
        print('[ERREUR] Abandon — aucune écriture.')
        sys.exit(1)

    if not apply_changes:
        print('\n[DRY-RUN] Aucune écriture effectuée. Relancer avec --apply pour exécuter.')
        return

    start = time.time()
    m = lambda pid: player_map[pid] if pid else None
    pk = lambda pid: pick_map[pid] if pid else None

    for sid in synced:
        tid = season_map[sid]
        print(f'\n[INFO] Staging, saison {labels[sid]} : suppression de l\'existant...')
        staging_db.table('roster_change_log').delete().eq('pool_season_id', tid).execute()
        staging_db.table('pooler_rosters').delete().eq('pool_season_id', tid).execute()
        staging_db.table('transactions').delete().eq('pool_season_id', tid).execute()   # items : ON DELETE CASCADE
        staging_db.table('presaison_pooler_ready').delete().eq('pool_season_id', tid).execute()
        staging_db.table('presaison_draft_state').delete().eq('pool_season_id', tid).execute()
        staging_db.table('ltir_requests').delete().eq('pool_season_id', tid).execute()
        staging_db.table('ltir_return_watch').delete().eq('pool_season_id', tid).execute()

        season_row = next(s for s in prod_seasons if s['id'] == sid)
        staging_db.table('pool_seasons').update(
            {k: v for k, v in season_row.items() if k not in SEASON_SKIP_COLUMNS}
        ).eq('id', tid).execute()

    print(f'[INFO] Insertion de {len(rosters)} lignes pooler_rosters...')
    insert_batches(staging_db, 'pooler_rosters', [{
        'pooler_id': r['pooler_id'], 'player_id': m(r['player_id']), 'pool_season_id': season_map[r['pool_season_id']],
        'player_type': r['player_type'], 'is_active': r['is_active'], 'added_at': r['added_at'],
        'removed_at': r['removed_at'], 'rookie_type': r['rookie_type'], 'pool_draft_year': r['pool_draft_year'],
        'draft_pick_id': pk(r['draft_pick_id']),
    } for r in rosters])

    print(f'[INFO] Insertion de {len(changelog)} lignes roster_change_log...')
    insert_batches(staging_db, 'roster_change_log', [{
        'player_id': m(c['player_id']), 'pooler_id': c['pooler_id'], 'pool_season_id': season_map[c['pool_season_id']],
        'change_type': c['change_type'], 'old_type': c['old_type'], 'new_type': c['new_type'],
        'changed_by': c['changed_by'], 'changed_at': c['changed_at'], 'is_admin_override': c['is_admin_override'],
        'created_at': c['created_at'], 'pick_id': pk(c['pick_id']),
    } for c in changelog])

    # Transactions une à la fois : il faut le nouvel id staging de chaque en-tête pour ses items.
    print(f'[INFO] Insertion de {len(transactions)} transactions et {len(items)} items...')
    items_by_tx: dict[int, list[dict]] = {}
    for i in items:
        items_by_tx.setdefault(i['transaction_id'], []).append(i)
    item_payload = []
    for t in transactions:
        new_tx = staging_db.table('transactions').insert({
            'pool_season_id': season_map[t['pool_season_id']], 'notes': t['notes'],
            'created_by': t['created_by'], 'created_at': t['created_at'],
        }).execute().data[0]
        for i in items_by_tx.get(t['id'], []):
            item_payload.append({
                'transaction_id': new_tx['id'], 'action_type': i['action_type'],
                'from_pooler_id': i['from_pooler_id'], 'to_pooler_id': i['to_pooler_id'],
                'player_id': m(i['player_id']), 'pick_id': pk(i['pick_id']),
                'old_player_type': i['old_player_type'], 'new_player_type': i['new_player_type'],
            })
    insert_batches(staging_db, 'transaction_items', item_payload)

    synced_states = [d for d in draft_states if d['pool_season_id'] in synced_set]
    synced_ready = [r for r in ready_rows if r['pool_season_id'] in synced_set]
    if synced_states:
        insert_batches(staging_db, 'presaison_draft_state',
                       [{**d, 'pool_season_id': season_map[d['pool_season_id']]} for d in synced_states])
    if synced_ready:
        insert_batches(staging_db, 'presaison_pooler_ready',
                       [{**r, 'pool_season_id': season_map[r['pool_season_id']]} for r in synced_ready])

    print(f'[INFO] Remplacement de {len(injuries_mapped)} blessures...')
    staging_db.table('player_injuries').delete().neq('id', 0).execute()
    insert_batches(staging_db, 'player_injuries', [
        {**{k: v for k, v in i.items() if k != 'id'}, 'player_id': m(i['player_id'])} for i in injuries_mapped
    ])

    if ltir_requests:
        print(f'[INFO] Insertion de {len(ltir_requests)} demandes de LTIR...')
        insert_batches(staging_db, 'ltir_requests', [{
            **{k: v for k, v in r.items() if k != 'id'},
            'pool_season_id': season_map[r['pool_season_id']],
            'ltir_player_id': m(r['ltir_player_id']), 'new_player_id': m(r['new_player_id']),
        } for r in ltir_requests])

    if app_settings:
        # Une colonne ajoutée en prod avant staging ferait échouer la mise à jour : non bloquant.
        try:
            staging_db.table('app_settings').update({k: v for k, v in app_settings.items() if k != 'id'}).eq('id', 1).execute()
            print('[INFO] app_settings copié.')
        except Exception as e:
            print(f'[AVERTISSEMENT] app_settings non copié (migration manquante en staging ?) : {e}')

    print(f'[INFO] Mise à jour de {len(pick_map)} choix de repêchage...')
    for p in picks:
        if p['id'] in pick_map:
            staging_db.table('pool_draft_picks').update({
                'current_owner_id': p['current_owner_id'], 'is_used': p['is_used'],
                'draft_order': p['draft_order'], 'pending_player_id': None,
            }).eq('id', pick_map[p['id']]).execute()

    print(f'\n[OK] Copie terminée en {time.time() - start:.1f}s.')
    print(f'[INFO] Log : {log_path}')


if __name__ == '__main__':
    main()
