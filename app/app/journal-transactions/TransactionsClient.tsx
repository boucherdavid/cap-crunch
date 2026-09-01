'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DASH = '—'

const typeLabel: Record<string, string> = {
  actif: 'Actif', reserviste: 'Réserviste', ltir: 'LTIR', recrue: 'Recrue',
}

type TabKey = 'tous' | 'echanges' | 'ballotage' | 'signatures' | 'ltir' | 'gestion'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'echanges', label: 'Échanges' },
  { key: 'ballotage', label: 'Ballotage' },
  { key: 'signatures', label: 'Signatures' },
  { key: 'ltir', label: 'LTIR' },
  { key: 'gestion', label: 'Gestion' },
]

const TAB_COLORS: Record<TabKey, string> = {
  tous: 'bg-slate-50',
  echanges: 'bg-blue-50',
  ballotage: 'bg-orange-50',
  signatures: 'bg-green-50',
  ltir: 'bg-amber-50',
  gestion: 'bg-slate-50',
}

function classifyTx(items: any[]): TabKey {
  const types = items.map((i: any) => i.action_type)
  if (types.includes('ballotage')) return 'ballotage'
  if (types.includes('transfer')) return 'echanges'
  if (types.includes('sign')) return 'signatures'
  if (
    types.includes('reactivate') ||
    items.some((i: any) => i.action_type === 'type_change' && (i.old_player_type === 'ltir' || i.new_player_type === 'ltir'))
  ) return 'ltir'
  return 'gestion'
}

function itemDescription(item: any): string {
  const from = item.from_pooler?.name
  const to = item.to_pooler?.name
  const player = item.players
    ? `${item.players.last_name}, ${item.players.first_name} (${item.players.teams?.code ?? DASH}) ${item.players.position ?? ''}`
    : null
  const oldT = item.old_player_type ? typeLabel[item.old_player_type] ?? item.old_player_type : null
  const newT = item.new_player_type ? typeLabel[item.new_player_type] ?? item.new_player_type : null

  switch (item.action_type) {
    case 'ballotage':
      return `${from} cède ${player} à ${to} (ballotage)`
    case 'transfer': {
      if (item.pick) {
        const isOwn = item.pick.original_owner?.name === from
        const pickLabel = `Ronde ${item.pick.round} ${item.pick.pool_seasons?.season ?? ''}${!isOwn ? ` (de ${item.pick.original_owner?.name})` : ''}`
        return `${from} donne ${pickLabel} à ${to}`
      }
      return `${from} donne ${player} à ${to}`
    }
    case 'sign':
      return `${to} signe ${player} (${newT})`
    case 'promote':
      return `${to} promeut ${player} → ${newT}`
    case 'reactivate':
      return `${to} réactive ${player} (LTIR → ${newT})`
    case 'release':
      return `${from} libère ${player}`
    case 'type_change':
      return `${from ?? to} : ${player} ${oldT} → ${newT}`
    default:
      return item.action_type
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export default function TransactionsClient({
  transactions,
  saison,
  saisons = [],
  activeSaisonId,
}: {
  transactions: any[]
  saison: any
  saisons?: any[]
  activeSaisonId?: number
}) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('tous')

  const classified = transactions.map((tx: any) => ({
    ...tx,
    _tab: classifyTx(tx.transaction_items ?? []),
  }))

  const counts: Record<TabKey, number> = {
    tous: classified.length,
    echanges: classified.filter(tx => tx._tab === 'echanges').length,
    ballotage: classified.filter(tx => tx._tab === 'ballotage').length,
    signatures: classified.filter(tx => tx._tab === 'signatures').length,
    ltir: classified.filter(tx => tx._tab === 'ltir').length,
    gestion: classified.filter(tx => tx._tab === 'gestion').length,
  }

  const visible = tab === 'tous' ? classified : classified.filter(tx => tx._tab === tab)
  const itemBg = TAB_COLORS[tab]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Journal des transactions</h1>
          <p className="text-gray-500 text-sm">Saison {saison.season}</p>
        </div>
        {saisons.length > 1 && (
          <select
            value={saison.season}
            onChange={e => router.push(`/journal-transactions?saison=${e.target.value}`)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white"
          >
            {saisons.map((s: any) => (
              <option key={s.id} value={s.season}>
                {s.season}{s.id === activeSaisonId ? ' (active)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-gray-400 text-sm">Aucune transaction dans cette catégorie.</p>
      )}

      <div className="space-y-4">
        {visible.map((tx: any) => (
          <div key={tx.id} className="bg-white rounded-lg shadow p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                {tx.notes && <p className="font-medium text-gray-800">{tx.notes}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.created_at)}</p>
              </div>
              <span className="text-xs text-gray-300">#{tx.id}</span>
            </div>
            <ul className="space-y-1">
              {(tx.transaction_items ?? []).map((item: any) => {
                const bg = tab === 'tous' ? TAB_COLORS[tx._tab as TabKey] : itemBg
                return (
                  <li key={item.id} className={`text-sm text-gray-700 ${bg} px-3 py-1.5 rounded`}>
                    {itemDescription(item)}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
