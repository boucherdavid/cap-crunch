"""
Reconstitue le journal des transactions des lots de Gestion d'effectifs (David, 2026-10-16).

Jusqu'au 2026-10-16, submitBatchAction (app/app/gestion-effectifs/actions.ts) n'écrivait que
roster_change_log : /journal-transactions, qui lit `transactions`, ne montrait aucun mouvement
fait en saison. Ce script crée une transaction par lot déjà fait, à partir de roster_change_log
de la saison régulière active, depuis le démarrage de la saison (season_started_at).

- Lot = mêmes pooler, date effective (changed_at) et auteur (changed_by).
- Ignore les lignes déjà couvertes par une transaction existante (échanges, /admin/transactions :
  écrites dans les 30 secondes suivant la transaction), et les lots déjà reconstitués.
- Même conversion change_type → action_type que app/lib/transactionJournal.ts.

Cible prod (python_script/.env) par défaut, --staging pour .env.staging.

    python backfill_journal_gestion.py            # dry-run
    python backfill_journal_gestion.py --apply    # écriture réelle
"""
import argparse
import os
import sys
from collections import OrderedDict
from datetime import datetime, timedelta

from dotenv import load_dotenv
from supabase import create_client

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
NOTES_GESTION = "Gestion d'effectifs"
NOTES_BALLOTAGE = 'Ballotage'


def journal_action_type(change_type, old_type, new_type):
    if change_type in ('signature_agent_libre', 'signature_ltir', 'ballotage', 'ajout_recrue'):
        return 'sign'
    if change_type == 'retour_ltir' and old_type == 'ltir':
        return 'reactivate'
    if change_type == 'retrait' or new_type is None:
        return 'release'
    if change_type == 'activation' and old_type == 'recrue':
        return 'promote'
    return 'type_change'


def ts(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


def fetch_all(query_fn):
    rows, start = [], 0
    while True:
        page = query_fn().range(start, start + 999).execute().data
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--staging', action='store_true')
    args = ap.parse_args()

    load_dotenv(os.path.join(BASE_DIR, '.env.staging' if args.staging else '.env'), override=True)
    sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

    season = sb.table('pool_seasons').select('id, season, season_started_at') \
        .eq('is_active', True).eq('is_playoff', False).single().execute().data
    if not season['season_started_at']:
        sys.exit('Saison pas encore démarrée — rien à reconstituer.')
    sid = season['id']
    started = season['season_started_at']

    names = {p['id']: p['name'] for p in sb.table('poolers').select('id, name').execute().data}
    logs = fetch_all(lambda: sb.table('roster_change_log')
                     .select('id, pooler_id, player_id, change_type, old_type, new_type, changed_at, created_at, changed_by, players(first_name, last_name)')
                     .eq('pool_season_id', sid).gte('created_at', started)
                     .order('created_at').order('id'))
    txs = fetch_all(lambda: sb.table('transactions')
                    .select('id, created_at, notes, transaction_items(from_pooler_id, to_pooler_id, player_id)')
                    .eq('pool_season_id', sid).order('id'))

    # Lignes écrites par une transaction existante (échange, /admin/transactions).
    windows = [(ts(t['created_at']), ts(t['created_at']) + timedelta(seconds=30)) for t in txs
               if t['notes'] not in (NOTES_GESTION, NOTES_BALLOTAGE)]
    # Lots déjà reconstitués ou écrits par l'app : (pooler, date effective).
    done = set()
    for t in txs:
        if t['notes'] in (NOTES_GESTION, NOTES_BALLOTAGE):
            for i in t['transaction_items']:
                done.add((i['from_pooler_id'] or i['to_pooler_id'], ts(t['created_at'])))

    groups = OrderedDict()
    for r in logs:
        created = ts(r['created_at'])
        if any(a <= created <= b for a, b in windows):
            continue
        key = (r['pooler_id'], ts(r['changed_at']), r['changed_by'])
        if (key[0], key[1]) in done:
            continue
        groups.setdefault(key, []).append(r)

    print(f"Saison {season['season']} — {len(groups)} lot(s) à reconstituer\n")
    for (pooler_id, changed_at, changed_by), rows in groups.items():
        notes = NOTES_BALLOTAGE if any(r['change_type'] == 'ballotage' for r in rows) else NOTES_GESTION
        print(f"{changed_at:%Y-%m-%d %H:%M} UTC  {names.get(pooler_id)}  ({notes})")
        items = []
        for r in rows:
            action = journal_action_type(r['change_type'], r['old_type'], r['new_type'])
            incoming = action in ('sign', 'promote', 'reactivate')
            items.append({
                'action_type': action,
                'from_pooler_id': None if incoming else pooler_id,
                'to_pooler_id': pooler_id if incoming else None,
                'player_id': r['player_id'],
                'old_player_type': r['old_type'],
                'new_player_type': r['new_type'],
            })
            p = r['players'] or {}
            print(f"    {p.get('last_name')}, {p.get('first_name')} : {r['old_type']} → {r['new_type']}  [{action}]")
        if args.apply:
            tx = sb.table('transactions').insert({
                'pool_season_id': sid, 'notes': notes, 'created_by': changed_by,
                'created_at': changed_at.isoformat(),
            }).execute().data[0]
            sb.table('transaction_items').insert([{**i, 'transaction_id': tx['id']} for i in items]).execute()

    print('\n' + ('Écrit.' if args.apply else 'Dry-run — rien écrit (--apply pour écrire).'))


if __name__ == '__main__':
    main()
