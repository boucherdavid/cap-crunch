'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { poolDraftYear } from '@/lib/poolDraftYear'
import { JOURNAL_NOTES_BALLOTAGE } from '@/lib/transactionJournal'
import ActivePeriodsPanel, { type JournalPeriod } from './ActivePeriodsPanel'

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

function classifyTx(items: any[], notes: string | null): TabKey {
  const types = items.map((i: any) => i.action_type)
  if (types.includes('ballotage') || notes === JOURNAL_NOTES_BALLOTAGE) return 'ballotage'
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
        const pickLabel = `Ronde ${item.pick.round} ${poolDraftYear(item.pick.pool_seasons?.season)}${!isOwn ? ` (de ${item.pick.original_owner?.name})` : ''}`
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

// Affichage deux colonnes pour un échange entre poolers (David, 2026-09-22) — même patron que
// l'onglet Échanges de Gestion d'effectifs ("Tu donnes"/"Tu reçois"), plus lisible que la liste
// à plat d'origine. Les items 'transfer' (joueurs/choix qui changent de main) vont dans la
// colonne du pooler qui les donne ; les ajustements de la même transaction (retour en banque,
// activation de recrue, libération — ajoutés par un pooler pour rester conforme) s'affichent
// en petit sous la colonne du pooler concerné, sans confondre les deux catégories.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TradeCard({ items }: { items: any[] }) {
  const transfers = items.filter(i => i.action_type === 'transfer')
  const adjustments = items.filter(i => i.action_type !== 'transfer')

  const poolerNames = Array.from(new Set(transfers.flatMap(i => [i.from_pooler?.name, i.to_pooler?.name]).filter(Boolean)))
  if (poolerNames.length !== 2) {
    // Cas limite (ex: aucun item 'transfer' trouvable) — repli sur la liste à plat habituelle.
    return (
      <ul className="space-y-1">
        {items.map(item => (
          <li key={item.id} className="text-sm text-gray-700 bg-blue-50 px-3 py-1.5 rounded">{itemDescription(item)}</li>
        ))}
      </ul>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function transferLabel(item: any): string {
    if (item.pick) {
      const isOwn = item.pick.original_owner?.name === item.from_pooler?.name
      return `Ronde ${item.pick.round} ${poolDraftYear(item.pick.pool_seasons?.season)}${!isOwn ? ` (de ${item.pick.original_owner?.name})` : ''}`
    }
    const p = item.players
    return p ? `${p.last_name}, ${p.first_name} (${p.teams?.code ?? DASH}) ${p.position ?? ''}` : '?'
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {poolerNames.map(name => (
          <div key={name}>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{name} donne</p>
            <ul className="space-y-1">
              {transfers.filter(i => i.from_pooler?.name === name).map(item => (
                <li key={item.id} className="text-sm text-gray-700 bg-blue-50 px-3 py-1.5 rounded">{transferLabel(item)}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {adjustments.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
          {adjustments.map(item => (
            <p key={item.id} className="text-xs text-gray-500">{itemDescription(item)}</p>
          ))}
        </div>
      )}
    </div>
  )
}

const TAB_LABEL: Record<TabKey, string> = {
  tous: '', echanges: 'Échange', ballotage: 'Ballotage', signatures: 'Signature', ltir: 'LTIR', gestion: "Gestion d'effectifs",
}
const TAB_BORDER: Record<TabKey, string> = {
  tous: 'border-slate-300', echanges: 'border-blue-400', ballotage: 'border-orange-400',
  signatures: 'border-green-400', ltir: 'border-amber-400', gestion: 'border-slate-400',
}

type Pos = 'A' | 'D' | 'G'
function posOf(position: string | null | undefined): Pos {
  const first = (position ?? '').split(',')[0].trim().toUpperCase()
  if (first === 'G') return 'G'
  if (first === 'D' || first === 'LD' || first === 'RD') return 'D'
  return 'A'
}
const POS_LABEL: Record<Pos, string> = { A: 'attaquant', D: 'défenseur', G: 'gardien' }

// Moment d'effet du panier (David, 2026-11-15) : midi UTC pile = date sans heure (date forcée ou
// mouvement reporté au lendemain), effectif avant les matchs du jour — même convention que
// l'onglet Marqueur. Sinon l'heure exacte, heure de l'Est.
function formatMoment(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' })
  if (d.getUTCHours() === 12 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return `${day}, avant les matchs du jour`
  const [h, m] = d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Toronto' }).split(/[: h]+/)
  return `${day} à ${Number(h)} h ${m} (heure de l'Est)`
}

// Un mouvement d'un panier, vu par le pooler concerné : d'où il part et où il arrive.
type BasketLine = { id: number; player: string; pos: Pos; from: string | null; to: string | null; label: string; playerId: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBasketLine(item: any): BasketLine {
  const p = item.players
  const player = p ? `${p.last_name}, ${p.first_name} (${p.teams?.code ?? DASH}) ${p.position ?? ''}` : '?'
  const from: string | null = item.action_type === 'sign' || item.action_type === 'ballotage' ? null : item.old_player_type ?? null
  const to: string | null = item.action_type === 'release' ? null : item.new_player_type ?? null
  const t = (x: string | null) => (x ? typeLabel[x] ?? x : null)
  let label: string
  switch (item.action_type) {
    case 'sign': label = `Signature (${t(to) ?? '?'})`; break
    case 'ballotage': label = `Ballotage (${t(to) ?? '?'})`; break
    case 'release': label = from ? `Libération (était ${t(from)?.toLowerCase()})` : 'Libération'; break
    case 'promote': label = `Banque de recrues → ${t(to)}`; break
    case 'reactivate': label = `LTIR → ${t(to)}`; break
    default: label = `${t(from) ?? '?'} → ${t(to) ?? '?'}`
  }
  return { id: item.id, player, pos: posOf(p?.position), from, to, label, playerId: p ? String(p.id) : null }
}

function BasketLineView({ l, highlight }: { l: BasketLine; highlight: boolean }) {
  return (
    <div className={`text-sm rounded px-1 -mx-1 ${highlight ? 'bg-yellow-100' : ''}`}>
      <span className="font-medium text-gray-800">{l.player}</span>
      <p className="text-xs text-gray-500">{l.label}</p>
    </div>
  )
}

/**
 * Un panier soumis, pour un pooler (David, 2026-11-15) : qui sort des actifs, qui y entre,
 * jumelés par position, et si le compte des actifs balance — pour recouper avec Marqueur.
 */
function BasketCard({ lines, highlightPlayer }: { lines: BasketLine[]; highlightPlayer: string }) {
  const outs = lines.filter(l => l.from === 'actif' && l.to !== 'actif')
  const ins = lines.filter(l => l.to === 'actif' && l.from !== 'actif')
  const others = lines.filter(l => !outs.includes(l) && !ins.includes(l))
  const pairs: { out: BasketLine | null; in: BasketLine | null }[] = []
  const insLeft = [...ins]
  for (const out of outs) {
    const i = insLeft.findIndex(x => x.pos === out.pos)
    pairs.push({ out, in: i >= 0 ? insLeft.splice(i, 1)[0] : null })
  }
  for (const left of insLeft) pairs.push({ out: null, in: left })

  const net = (['A', 'D', 'G'] as Pos[]).map(pos => ({
    pos, diff: ins.filter(l => l.pos === pos).length - outs.filter(l => l.pos === pos).length,
  })).filter(x => x.diff !== 0)
  const hl = (l: BasketLine) => !!highlightPlayer && l.playerId === highlightPlayer

  return (
    <div className="space-y-2">
      {pairs.length > 0 && (
        <div>
          <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-x-3 text-[11px] font-semibold text-gray-400 uppercase mb-1">
            <span>Sort des actifs</span><span /><span>Entre dans les actifs</span>
          </div>
          <ul className="space-y-1.5">
            {pairs.map((pair, i) => (
              <li key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-0.5 items-start">
                <div>{pair.out ? <BasketLineView l={pair.out} highlight={hl(pair.out)} /> : <span className="text-xs text-gray-400">Aucune sortie</span>}</div>
                <span className="hidden sm:inline text-gray-400 pt-0.5">⇄</span>
                <div className="pl-3 sm:pl-0 border-l-2 sm:border-l-0 border-gray-100">
                  {pair.in ? <BasketLineView l={pair.in} highlight={hl(pair.in)} /> : <span className="text-xs text-gray-400">Aucune entrée</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {others.length > 0 && (
        <div className={pairs.length > 0 ? 'pt-2 border-t border-gray-100' : ''}>
          {pairs.length > 0 && <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Autres mouvements</p>}
          <ul className="space-y-1.5">
            {others.map(l => <li key={l.id}><BasketLineView l={l} highlight={hl(l)} /></li>)}
          </ul>
        </div>
      )}
      {pairs.length > 0 && (
        net.length === 0 ? (
          <p className="text-xs font-medium text-emerald-700">✓ Le compte des actifs balance</p>
        ) : (
          <p className="text-xs font-medium text-amber-700">
            ⚠ Actifs :{' '}
            {net.map(x => `${x.diff > 0 ? '+' : '−'}${Math.abs(x.diff)} ${POS_LABEL[x.pos]}${Math.abs(x.diff) > 1 ? 's' : ''}`).join(', ')}
          </p>
        )
      )}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

// Colonnes structurées pour l'affichage tabulaire (David, 2026-09-22) — même données que
// itemDescription() mais en morceaux séparés plutôt qu'en phrase, pour un tableau compact
// (Signatures/LTIR/Gestion/Ballotage — pas Échanges, qui garde son affichage deux colonnes).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowInfo(item: any): { pooler: string; player: string; detail: string } {
  const from = item.from_pooler?.name ?? DASH
  const to = item.to_pooler?.name ?? DASH
  const player = item.players
    ? `${item.players.last_name}, ${item.players.first_name} (${item.players.teams?.code ?? DASH}) ${item.players.position ?? ''}`
    : '?'
  const oldT = item.old_player_type ? typeLabel[item.old_player_type] ?? item.old_player_type : null
  const newT = item.new_player_type ? typeLabel[item.new_player_type] ?? item.new_player_type : null

  switch (item.action_type) {
    case 'ballotage':
      return { pooler: `${from} → ${to}`, player, detail: 'Ballotage' }
    case 'sign':
      return { pooler: to, player, detail: `Signature (${newT})` }
    case 'promote':
      return { pooler: to, player, detail: `Promotion → ${newT}` }
    case 'reactivate':
      return { pooler: to, player, detail: `Retour LTIR → ${newT}` }
    case 'release':
      return { pooler: from, player, detail: 'Libération' }
    case 'type_change':
      return { pooler: item.from_pooler?.name ?? to, player, detail: `${oldT} → ${newT}` }
    default:
      return { pooler: from !== DASH ? from : to, player, detail: item.action_type }
  }
}

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
