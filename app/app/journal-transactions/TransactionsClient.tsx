'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  classifyTx, TradeCard, TAB_LABEL, TAB_BORDER, formatMoment, toBasketLine, BasketCard, formatDate, rowInfo, type TabKey,
} from './journalCards'
import ActivePeriodsPanel, { type JournalPeriod } from './ActivePeriodsPanel'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'echanges', label: 'Échanges' },
  { key: 'ballotage', label: 'Ballotage' },
  { key: 'signatures', label: 'Signatures' },
  { key: 'ltir', label: 'LTIR' },
  { key: 'gestion', label: 'Gestion' },
]

export default function TransactionsClient({
  transactions,
  saison,
  saisons = [],
  activeSaisonId,
  periodsByKey = {},
  nhlSeason,
}: {
  transactions: any[]
  saison: any
  saisons?: any[]
  activeSaisonId?: number
  periodsByKey?: Record<string, JournalPeriod[]>
  nhlSeason: number
}) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('tous')
  const [poolerFilter, setPoolerFilter] = useState('')
  const [playerFilter, setPlayerFilter] = useState('')

  const classified = transactions.map((tx: any) => ({
    ...tx,
    _tab: classifyTx(tx.transaction_items ?? [], tx.notes ?? null),
  }))

  const byTab = tab === 'tous' ? classified : classified.filter(tx => tx._tab === tab)
  // Liste déroulante plutôt qu'un champ texte : toujours les mêmes poolers (David, 2026-10-17).
  type PoolerRef = { from_pooler?: { name?: string }; to_pooler?: { name?: string } }
  const poolerNames = Array.from(new Set(
    transactions.flatMap((tx: any) => (tx.transaction_items ?? []).flatMap((item: PoolerRef) =>
      [item.from_pooler?.name, item.to_pooler?.name])),
  )).filter((n): n is string => !!n).sort((a, b) => a.localeCompare(b, 'fr'))
  // Filtre ligne par ligne (David, 2026-10-18) : une transaction peut regrouper plusieurs poolers
  // (ex. activation automatique des recrues à protection expirée, une seule transaction pour
  // tout le pool) — sans ça, choisir un pooler montrait aussi les joueurs des autres.
  const matchesPooler = (item: PoolerRef) =>
    !poolerFilter || item.from_pooler?.name === poolerFilter || item.to_pooler?.name === poolerFilter
  const byPooler = !poolerFilter ? byTab : byTab.filter(tx =>
    (tx.transaction_items ?? []).some(matchesPooler),
  )
  // Filtre par joueur (David, 2026-10-18 — suivre les mouvements d'un joueur pour valider ses
  // matchs comptés) : seulement les joueurs présents dans les mouvements déjà filtrés (onglet,
  // pooler). Dans le tableau, seules les lignes du joueur restent ; un échange reste entier.
  type PlayerRef = { players?: { id: number; nhl_id: number | null; first_name: string; last_name: string } | null }
  const playerMap = new Map<string, string>()
  const nhlIdByPlayer = new Map<string, number | null>()
  for (const tx of byPooler) {
    for (const item of (tx.transaction_items ?? []) as (PlayerRef & PoolerRef)[]) {
      if (!item.players || !matchesPooler(item)) continue
      playerMap.set(String(item.players.id), `${item.players.last_name}, ${item.players.first_name}`)
      nhlIdByPlayer.set(String(item.players.id), item.players.nhl_id)
    }
  }
  const playerOptions = Array.from(playerMap).sort((a, b) => a[1].localeCompare(b[1], 'fr'))
  const activePlayer = playerOptions.some(([id]) => id === playerFilter) ? playerFilter : ''
  const matchesPlayer = (item: PlayerRef) => !activePlayer || String(item.players?.id) === activePlayer
  const matchesFilters = (tx: { transaction_items?: (PlayerRef & PoolerRef)[] }) =>
    (tx.transaction_items ?? []).some(item => matchesPooler(item) && matchesPlayer(item))
  const visible = !activePlayer ? byPooler : byPooler.filter(matchesFilters)

  // Compteurs des onglets selon les filtres pooler et joueur (David, 2026-10-18), pas tout le pool.
  const filtered = poolerFilter || activePlayer ? classified.filter(matchesFilters) : classified
  const counts: Record<TabKey, number> = {
    tous: filtered.length,
    echanges: filtered.filter(tx => tx._tab === 'echanges').length,
    ballotage: filtered.filter(tx => tx._tab === 'ballotage').length,
    signatures: filtered.filter(tx => tx._tab === 'signatures').length,
    ltir: filtered.filter(tx => tx._tab === 'ltir').length,
    gestion: filtered.filter(tx => tx._tab === 'gestion').length,
  }

  // Échanges gardent leur affichage deux colonnes (TradeCard) ; tout le reste passe en tableau
  // compact — une ligne par mouvement, même en éclatant les items sur plusieurs transactions
  // (David, 2026-09-22).
  const tradeTxs = visible.filter(tx => tx._tab === 'echanges')
  // Un panier par transaction et par pooler (David, 2026-11-15) : une transaction peut toucher
  // plusieurs poolers (activation automatique des recrues). Le filtre joueur garde le panier au
  // complet et surligne le joueur, pour voir avec qui il a changé de place.
  const basketTxs = visible.filter(tx => tx._tab !== 'echanges')
  const baskets = basketTxs.flatMap(tx => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byOwner = new Map<string, any[]>()
    for (const item of tx.transaction_items ?? []) {
      const owner = rowInfo(item).pooler
      if (poolerFilter && !owner.split(' → ').includes(poolerFilter)) continue
      if (!byOwner.has(owner)) byOwner.set(owner, [])
      byOwner.get(owner)!.push(item)
    }
    return [...byOwner].filter(([, items]) => !activePlayer || items.some(matchesPlayer))
      .map(([owner, items]) => ({ tx, owner, lines: items.map(toBasketLine) }))
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          {/* Titre : bandeau de section du layout (SectionEyebrow, Navbar.tsx). */}
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
      <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
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

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <select
          value={poolerFilter}
          onChange={e => setPoolerFilter(e.target.value)}
          aria-label="Filtrer par pooler"
          className="w-full sm:w-64 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous les poolers</option>
          {poolerNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <select
          value={activePlayer}
          onChange={e => setPlayerFilter(e.target.value)}
          aria-label="Filtrer par joueur"
          className="w-full sm:w-64 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous les joueurs</option>
          {playerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {poolerFilter && activePlayer && (() => {
        const nhlId = nhlIdByPlayer.get(activePlayer) ?? null
        return (
          <ActivePeriodsPanel
            key={`${poolerFilter}|${activePlayer}`}
            playerName={playerMap.get(activePlayer) ?? ''}
            poolerName={poolerFilter}
            nhlId={nhlId}
            nhlSeason={nhlSeason}
            periods={nhlId ? periodsByKey[`${poolerFilter}|${nhlId}`] ?? [] : []}
          />
        )
      })()}

      {visible.length === 0 && (
        <p className="text-gray-400 text-sm">Aucune activité dans cette catégorie.</p>
      )}

      {baskets.length > 0 && (
        <div className="space-y-3 mb-4">
          {baskets.map(({ tx, owner, lines }) => (
            <div key={`${tx.id}-${owner}`} className={`bg-white rounded-lg shadow p-3 sm:p-4 border-l-4 ${TAB_BORDER[tx._tab as TabKey]}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-2">
                <p className="text-sm">
                  <span className="font-semibold text-gray-800">{owner}</span>{' '}
                  <span className="text-gray-400">·</span>{' '}
                  <span className="text-gray-600">{TAB_LABEL[tx._tab as TabKey]}</span>
                </p>
                <p className="text-xs text-gray-500">{formatMoment(tx.created_at)}</p>
              </div>
              {tx.override_note && (
                <p className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                  Règle contournée par l&apos;admin : {tx.override_note}
                </p>
              )}
              <BasketCard lines={lines} highlightPlayer={activePlayer} />
            </div>
          ))}
        </div>
      )}

      {tradeTxs.length > 0 && (
        <div className="space-y-4">
          {tradeTxs.map((tx: any) => (
            <div key={tx.id} className="bg-white rounded-lg shadow p-4 sm:p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  {tx.notes && <p className="font-medium text-gray-800">{tx.notes}</p>}
                  {tx.override_note && (
                    <p className="mt-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                      Règle contournée par l&apos;admin : {tx.override_note}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.created_at)}</p>
                </div>
                <span className="text-xs text-gray-300">#{tx.id}</span>
              </div>
              <TradeCard items={tx.transaction_items ?? []} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
