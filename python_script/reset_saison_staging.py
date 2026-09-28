"""
Remet une saison à neuf en STAGING seulement (jamais en prod) — pour refaire une transition de
saison propre après des tests (voir SUIVI_PROJET.md, session 2026-09-26).

Supprime tout ce qui appartient à la saison : alignements, transactions (+ items), historique
de statut, ballotages (+ réclamations), échanges proposés (+ items), demandes LTIR, surveillance
cap, snapshots de stats, déclarations « prêt », état du repêchage des agents libres. Remet les
choix de repêchage à neuf (propriétaire d'origine, non utilisés, sans ordre ni joueur en attente)
et la saison à « non démarrée ».

Conservé : la saison elle-même et sa configuration (cap, dates, ordre de pré-saison
`presaison_draft_order`...), les joueurs/contrats, les poolers.

Usage:
    python reset_saison_staging.py 2026-27            # dry-run
    python reset_saison_staging.py 2026-27 --apply    # écrit (confirmation "oui")
"""

import argparse
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

from dotenv import dotenv_values
from supabase import create_client

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def fetch_all(db, table, cols, col, value):
    out, offset = [], 0
    while True:
        batch = db.table(table).select(cols).eq(col, value).range(offset, offset + 999).execute().data
        out.extend(batch)
        if len(batch) < 1000:
            return out
        offset += 1000


def delete_in(db, table, col, ids):
    for i in range(0, len(ids), 200):
        db.table(table).delete().in_(col, ids[i:i + 200]).execute()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('saison')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    staging = dotenv_values(os.path.join(BASE_DIR, '.env.staging'))
    prod = dotenv_values(os.path.join(BASE_DIR, '.env'))
    if not staging.get('SUPABASE_URL') or staging['SUPABASE_URL'] == prod.get('SUPABASE_URL'):
        raise SystemExit('[ERREUR] .env.staging absent ou identique à la prod — abandon.')
    db = create_client(staging['SUPABASE_URL'], staging['SUPABASE_SERVICE_KEY'])
    print(f'[INFO] Cible : STAGING ({staging["SUPABASE_URL"]})')

    season = db.table('pool_seasons').select('id, season, is_active, season_started').eq('season', args.saison).single().execute().data
    sid = season['id']
    print(f'[INFO] Saison {season["season"]} (id={sid}, active={season["is_active"]}, démarrée={season["season_started"]})\n')

    tx_ids = [r['id'] for r in fetch_all(db, 'transactions', 'id', 'pool_season_id', sid)]
    wc_ids = [r['id'] for r in fetch_all(db, 'waiver_claims', 'id', 'pool_season_id', sid)]
    to_ids = [r['id'] for r in fetch_all(db, 'trade_offers', 'id', 'pool_season_id', sid)]
    picks = fetch_all(db, 'pool_draft_picks', 'id, original_owner_id, current_owner_id, is_used, draft_order, pending_player_id', 'pool_season_id', sid)

    def count(table, col, value):
        try:
            return db.table(table).select(col, count='exact', head=True).eq(col, value).execute().count or 0
        except Exception:
            return None  # table/colonne absente

    per_season = ['pooler_rosters', 'roster_change_log', 'cap_signing_watch', 'player_stat_snapshots',
                  'presaison_pooler_ready', 'presaison_draft_state', 'ltir_requests']
    counts = {t: count(t, 'pool_season_id', sid) for t in per_season}
    picks_dirty = [p for p in picks if p['current_owner_id'] != p['original_owner_id'] or p['is_used']
                   or p['draft_order'] is not None or p['pending_player_id'] is not None]

    print(f'  transactions : {len(tx_ids)} (+ leurs transaction_items)')
    print(f'  waiver_claims : {len(wc_ids)} (+ leurs réclamations)')
    print(f'  trade_offers : {len(to_ids)} (+ leurs items)')
    for t, n in counts.items():
        print(f'  {t} : {"table absente" if n is None else n}')
    print(f'  pool_draft_picks remis à neuf : {len(picks_dirty)} / {len(picks)} '
          f'(dont {sum(1 for p in picks if p["current_owner_id"] != p["original_owner_id"])} réassignés)')
    print('  pool_seasons : season_started=false, season_started_at=null')

    if not args.apply:
        print('\n[DRY-RUN] Aucune écriture. Relancez avec --apply pour appliquer.')
        return
    if input(f'\nRemettre {season["season"]} à neuf en STAGING ? (oui/non) ').strip().lower() != 'oui':
        print('Annulé.')
        return

    delete_in(db, 'transaction_items', 'transaction_id', tx_ids)
    delete_in(db, 'transactions', 'id', tx_ids)
    delete_in(db, 'waiver_claim_requests', 'waiver_claim_id', wc_ids)
    delete_in(db, 'waiver_claims', 'id', wc_ids)
    delete_in(db, 'trade_offer_items', 'trade_offer_id', to_ids)
    delete_in(db, 'trade_offers', 'id', to_ids)
    for t, n in counts.items():
        if n:
            db.table(t).delete().eq('pool_season_id', sid).execute()
    for p in picks_dirty:
        db.table('pool_draft_picks').update({
            'current_owner_id': p['original_owner_id'], 'is_used': False,
            'draft_order': None, 'pending_player_id': None,
        }).eq('id', p['id']).execute()
    db.table('pool_seasons').update({'season_started': False, 'season_started_at': None}).eq('id', sid).execute()

    left = db.table('pooler_rosters').select('id', count='exact', head=True).eq('pool_season_id', sid).execute().count
    print(f'[OK] Saison {season["season"]} remise à neuf ({left} ligne d\'alignement restante).')


if __name__ == '__main__':
    main()
