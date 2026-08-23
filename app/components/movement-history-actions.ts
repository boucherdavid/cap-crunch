'use server'

import { createClient } from '@/lib/supabase/server'
import { CHANGE_LABEL, CHANGE_COLOR } from '@/lib/rosterChangeLabels'

export type MovementEvent = {
  id: string
  at: string
  category: 'roster' | 'transaction'
  poolerName: string
  label: string
  detail: string
  color: string
}

// Historique compact pour le panneau latéral de /gestion-effectifs et /admin/transactions —
// même source de données que l'onglet Suivi (roster_change_log + transactions), mais
// filtrable sur un pooler précis pour suivre ses propres mouvements pendant la saisie.
export async function getMovementHistoryAction(
  poolerId: string | null,
  limit = 30,
): Promise<MovementEvent[]> {
  const supabase = await createClient()
  const events: MovementEvent[] = []

  let rosterQuery = supabase
    .from('roster_change_log')
    .select('id, change_type, old_type, new_type, changed_at, is_admin_override, players(first_name, last_name), poolers!roster_change_log_pooler_id_fkey(name)')
    .order('changed_at', { ascending: false })
    .limit(limit)
  if (poolerId) rosterQuery = rosterQuery.eq('pooler_id', poolerId)
  const { data: rcr } = await rosterQuery

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (rcr ?? []) as any[]) {
    const pl = r.players as { first_name: string; last_name: string } | null
    const po = r.poolers as { name: string } | null
    const label = CHANGE_LABEL[r.change_type] ?? r.change_type
    const color = CHANGE_COLOR[r.change_type] ?? 'bg-gray-100 text-gray-700'
    const pName = pl ? `${pl.last_name}, ${pl.first_name}` : '—'
    events.push({
      id: `r-${r.id}`,
      at: r.changed_at,
      category: 'roster',
      poolerName: po?.name ?? '?',
      label,
      detail: (r.old_type && r.new_type ? `${pName} (${r.old_type} → ${r.new_type})` : pName) + (r.is_admin_override ? ' · override date' : ''),
      color,
    })
  }

  // Transactions (lignes de lot avec notes) : quand filtré sur un pooler, on ne retient
  // que celles où ce pooler apparaît réellement comme partie prenante (transaction_items).
  let txIds: number[] | null = null
  if (poolerId) {
    const [{ data: itemsFrom }, { data: itemsTo }] = await Promise.all([
      supabase.from('transaction_items').select('transaction_id').eq('from_pooler_id', poolerId),
      supabase.from('transaction_items').select('transaction_id').eq('to_pooler_id', poolerId),
    ])
    txIds = Array.from(new Set([...(itemsFrom ?? []), ...(itemsTo ?? [])].map((i: { transaction_id: number }) => i.transaction_id)))
    if (txIds.length === 0) {
      events.sort((a, b) => b.at.localeCompare(a.at))
      return events.slice(0, limit)
    }
  }

  let txQuery = supabase
    .from('transactions')
    .select('id, notes, created_at, poolers!transactions_created_by_fkey(name)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (txIds) txQuery = txQuery.in('id', txIds)
  const { data: txr } = await txQuery

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (txr ?? []) as any[]) {
    const po = t.poolers as { name: string } | null
    events.push({
      id: `t-${t.id}`,
      at: t.created_at,
      category: 'transaction',
      poolerName: po?.name ?? 'Admin',
      label: 'Transaction',
      detail: t.notes ?? '(sans notes)',
      color: 'bg-slate-100 text-slate-800',
    })
  }

  events.sort((a, b) => b.at.localeCompare(a.at))
  return events.slice(0, limit)
}
