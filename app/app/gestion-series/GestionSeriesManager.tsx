'use client'

import { useState, useEffect, useTransition, useMemo } from 'react'
import { normalizeSearch } from '@/lib/normalizeSearch'
import {
  getPlayoffPoolRosterAction,
  getPlayoffChangeCountsAction,
  getAvailablePlayoffPlayersAction,
  getRecentlyRemovedAction,
  submitSeriesBatchAction,
  confirmPlayoffAlignmentAction,
} from './playoff-pool-actions'
import type {
  PlayoffPoolSaison,
  PlayoffPoolEntry,
  PlayoffPoolPlayerResult,
  SeriesBatchRemoval,
  SeriesBatchAddition,
} from './playoff-pool-actions'

// ─── Types panier ─────────────────────────────────────────────────────────────

type CartRemoval = {
  localId: string
  entryId: number
  playerId: number
  nhlId: number | null
  name: string
  teamCode: string | null
  capNumber: number
  positionSlot: 'F' | 'D' | 'G'
  isElimination: boolean
}

type CartAddition = {
  localId: string
  playerId: number
  nhlId: number | null
  name: string
  teamCode: string | null
  capNumber: number
  positionSlot: 'F' | 'D' | 'G'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const capFmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const slotLabel: Record<'F' | 'D' | 'G', string> = { F: 'Attaquant', D: 'Défenseur', G: 'Gardien' }
const slotAccent: Record<'F' | 'D' | 'G', string> = {
  F: 'text-blue-600 border-blue-300 bg-blue-50',
  D: 'text-green-600 border-green-300 bg-green-50',
  G: 'text-purple-600 border-purple-300 bg-purple-50',
}
const slotBadge: Record<'F' | 'D' | 'G', string> = {
  F: 'bg-blue-100 text-blue-700',
  D: 'bg-green-100 text-green-700',
  G: 'bg-purple-100 text-purple-700',
}

function deadlineLabel(deadline: string | null): string {
  if (!deadline) return 'Aucune deadline'
  return new Date(deadline).toLocaleString('fr-CA', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    timeZone: 'America/Toronto',
  })
}

export function posGroup(pos: string | null): 'F' | 'D' | 'G' {
  const p = (pos ?? '').split(',')[0].trim()
  if (p === 'G') return 'G'
  if (['D', 'LD', 'RD'].includes(p)) return 'D'
  return 'F'
}

// ─── CapBar ───────────────────────────────────────────────────────────────────

function CapBar({ entries, poolCap, cartRemovals, cartAdditions, previewAdd }: {
  entries: PlayoffPoolEntry[]
  poolCap: number
  cartRemovals: CartRemoval[]
  cartAdditions: CartAddition[]
  previewAdd: PlayoffPoolPlayerResult | null
}) {
  const removingIds = new Set(cartRemovals.map(r => r.playerId))
  const base = entries.reduce((s, e) => s + (e.capNumber ?? 0), 0)
  const projected = entries
    .filter(e => !removingIds.has(e.playerId))
    .reduce((s, e) => s + (e.capNumber ?? 0), 0)
    + cartAdditions.reduce((s, a) => s + a.capNumber, 0)
  const preview = projected + (previewAdd?.capNumber ?? 0)

  const pct = poolCap > 0 ? Math.min(100, (projected / poolCap) * 100) : 0
  const previewPct = poolCap > 0 ? Math.min(100, (preview / poolCap) * 100) : 0
  const hasPreview = !!previewAdd
  const over = hasPreview ? preview > poolCap : projected > poolCap
  const cartChanged = projected !== base
  const barColor = projected > poolCap ? 'bg-red-500' : projected > poolCap * 0.95 ? 'bg-orange-400' : 'bg-blue-500'
  const previewColor = preview > poolCap ? 'bg-red-300' : 'bg-blue-200'

  return (
    <div className="bg-white rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-500 font-medium uppercase tracking-wide">
        <span>Masse salariale</span>
        <span className={over ? 'text-red-600 font-semibold' : 'text-gray-700'}>
          {capFmt(projected)} <span className="text-gray-400">/ {capFmt(poolCap)}</span>
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        {hasPreview && (
          <div
            className={`absolute top-0 h-full rounded-full transition-all ${previewColor}`}
            style={{ left: `${Math.min(pct, previewPct)}%`, width: `${Math.abs(previewPct - pct)}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-xs">
        <span className={`font-medium ${poolCap - projected < 0 ? 'text-red-600' : 'text-gray-600'}`}>
          Disponible{cartChanged ? ' après panier' : ''} : {capFmt(Math.max(0, poolCap - projected))}
        </span>
        {hasPreview && (
          <span className={`font-medium ${preview > poolCap ? 'text-red-600' : 'text-blue-600'}`}>
            Après ajout : {capFmt(poolCap - preview)}{preview > poolCap && ' ⚠ Dépassement'}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── PlayerPicker ─────────────────────────────────────────────────────────────

function PlayerPicker({
  poolSeasonId, season, excludeIds, cooldownMap, activeSlot, selected, onSelect, resetKey,
}: {
  poolSeasonId: number
  season: string
  excludeIds: Set<number>
  cooldownMap: Map<number, Date>
  activeSlot: 'F' | 'D' | 'G'
  selected: PlayoffPoolPlayerResult | null
  onSelect: (p: PlayoffPoolPlayerResult | null) => void
  resetKey: number
}) {
  const [allPlayers, setAllPlayers] = useState<PlayoffPoolPlayerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [nameFilter, setNameFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    setNameFilter('')
    setTeamFilter('')
    getAvailablePlayoffPlayersAction(poolSeasonId, season).then(p => {
      setAllPlayers(p)
      setLoading(false)
    })
  }, [poolSeasonId, season, resetKey])

  const teams = useMemo(() =>
    [...new Set(allPlayers.filter(p => posGroup(p.position) === activeSlot).map(p => p.teamCode).filter(Boolean) as string[])].sort(),
    [allPlayers, activeSlot],
  )

  const filtered = useMemo(() =>
    allPlayers.filter(p => {
      if (excludeIds.has(p.id)) return false
      if (posGroup(p.position) !== activeSlot) return false
      if (teamFilter && p.teamCode !== teamFilter) return false
      if (nameFilter.trim()) {
        const q = normalizeSearch(nameFilter.trim())
        if (!normalizeSearch(`${p.firstName} ${p.lastName}`).includes(q)) return false
      }
      return true
    }),
    [allPlayers, excludeIds, activeSlot, teamFilter, nameFilter],
  )

  if (selected) return (
    <div className="border border-green-300 bg-green-50 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-gray-800">{selected.lastName}, {selected.firstName}</span>
        <span className="text-xs text-gray-500 ml-2">{selected.teamCode} — {selected.position}</span>
        {selected.teamEliminated && <span className="ml-1 text-xs text-red-600 font-medium">ÉLIMINÉ</span>}
      </div>
      {selected.capNumber != null && (
        <span className="text-xs font-semibold text-gray-600 tabular-nums shrink-0">{capFmt(selected.capNumber)}</span>
      )}
      <button onClick={() => onSelect(null)} className="text-gray-400 hover:text-gray-600 text-xs shrink-0">✕</button>
    </div>
  )

  return (
    <div className="space-y-2">
      <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-700 bg-white">
        <option value="">Toutes les équipes</option>
        {teams.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <input type="text" value={nameFilter} onChange={e => setNameFilter(e.target.value)}
        placeholder="Rechercher par nom..."
        className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
      {loading ? (
        <p className="text-xs text-gray-400 text-center py-6">Chargement...</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-xs text-gray-400 text-center">Aucun joueur pour ces filtres.</p>
            ) : filtered.map(p => {
              const cooldownUntil = cooldownMap.get(p.id)
              const disabled = p.teamEliminated || !!cooldownUntil
              return (
                <button key={p.id} onClick={() => onSelect(p)} disabled={disabled}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium text-gray-800 truncate">{p.lastName}, {p.firstName}</span>
                    <span className="text-xs text-gray-400 shrink-0">{p.teamCode}</span>
                    <span className="text-xs text-gray-400 shrink-0 w-5">{(p.position ?? '').split(',')[0]}</span>
                    {p.capNumber != null
                      ? <span className="text-xs font-semibold text-gray-600 tabular-nums shrink-0 w-24 text-right">{capFmt(p.capNumber)}</span>
                      : <span className="text-xs text-gray-300 shrink-0 w-24 text-right">—</span>}
                    {p.teamEliminated && <span className="text-xs text-red-400 shrink-0">ÉL.</span>}
                    {cooldownUntil && (
                      <span className="text-xs text-orange-500 shrink-0">
                        dispo {cooldownUntil.toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="px-3 py-1.5 bg-gray-50 border-t text-xs text-gray-400">
            {filtered.length} joueur{filtered.length > 1 ? 's' : ''}
            {allPlayers.length !== filtered.length && ` / ${allPlayers.length} au total`}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SlotRow ──────────────────────────────────────────────────────────────────

function SlotRow({
  slot, index, entry, isLocked, canMarkForRemoval, isPendingRemoval,
  onMarkForRemoval, onUndoRemoval,
}: {
  slot: 'F' | 'D' | 'G'
  index: number
  entry: PlayoffPoolEntry | undefined
  isLocked: boolean
  canMarkForRemoval: boolean
  isPendingRemoval: boolean
  onMarkForRemoval: () => void
  onUndoRemoval: () => void
}) {
  if (isPendingRemoval && entry) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-sm opacity-70">
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${slotBadge[slot]}`}>
          {slot}{index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <span className="line-through text-gray-400 truncate block">{entry.lastName}, {entry.firstName}</span>
          <span className="text-xs text-amber-600 font-medium">En sortie</span>
        </div>
        {entry.capNumber != null && (
          <span className="text-xs text-gray-400 tabular-nums shrink-0 line-through">{capFmt(entry.capNumber)}</span>
        )}
        <button onClick={onUndoRemoval} className="text-xs text-amber-600 hover:text-red-600 shrink-0" title="Annuler le retrait">↩</button>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors
      ${entry ? 'border-gray-200 bg-white hover:border-gray-300' : 'border-dashed border-gray-200 bg-gray-50'}`}>
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${slotBadge[slot]}`}>
        {slot}{index + 1}
      </span>
      {entry ? (
        <>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-gray-800 truncate block">{entry.lastName}, {entry.firstName}</span>
            <span className="text-xs text-gray-400">{entry.teamCode} — {entry.position}</span>
            {entry.teamEliminated && <span className="ml-1 text-xs text-red-600 font-semibold">⚠ Éliminé</span>}
          </div>
          {entry.capNumber != null && (
            <span className="text-xs font-semibold text-gray-500 tabular-nums shrink-0">{capFmt(entry.capNumber)}</span>
          )}
          {canMarkForRemoval ? (
            <button onClick={onMarkForRemoval} className="text-xs text-red-400 hover:text-red-600 shrink-0 ml-1">
              {isLocked && !!entry.teamEliminated ? '↺' : '✕'}
            </button>
          ) : (
            <span className="text-xs text-gray-300 shrink-0">🔒</span>
          )}
        </>
      ) : (
        <span className="flex-1 text-xs text-gray-400 italic">— Vide —</span>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GestionSeriesManager({
  isAdmin, poolers, selfPoolerId, selfPoolerName, saison,
}: {
  isAdmin: boolean
  poolers?: { id: string; name: string }[]
  selfPoolerId: string
  selfPoolerName: string
  saison: PlayoffPoolSaison
}) {
  const [poolerId, setPoolerId] = useState(selfPoolerId)
  const [entries, setEntries] = useState<PlayoffPoolEntry[]>([])
  const [counts, setCounts] = useState({ voluntary: 0, elimination: 0 })
  const [loading, setLoading] = useState(true)

  // ── Panier découplé ──
  const [cartRemovals, setCartRemovals] = useState<CartRemoval[]>([])
  const [cartAdditions, setCartAdditions] = useState<CartAddition[]>([])

  // ── Sélection en cours (ajout) ──
  const [activeSlot, setActiveSlot] = useState<'F' | 'D' | 'G'>('F')
  const [addPlayer, setAddPlayer] = useState<PlayoffPoolPlayerResult | null>(null)
  const [searchKey, setSearchKey] = useState(0)

  const [cooldownMap, setCooldownMap] = useState<Map<number, Date>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [confirmPending, setConfirmPending] = useState(false)
  const [isPending, startTransition] = useTransition()

  const isLocked = saison.submissionDeadline ? new Date() > new Date(saison.submissionDeadline) : false
  const adminBypassCooldown = isAdmin && poolerId !== selfPoolerId
  const poolerName = poolers?.find(p => p.id === poolerId)?.name ?? selfPoolerName


  const pendingRemovalIds = useMemo(() => new Set(cartRemovals.map(r => r.entryId)), [cartRemovals])
  const pendingRemovalPlayerIds = useMemo(() => new Set(cartRemovals.map(r => r.playerId)), [cartRemovals])
  const pendingAdditionPlayerIds = useMemo(() => new Set(cartAdditions.map(a => a.playerId)), [cartAdditions])

  const hasEliminatedPlayers = entries.some(e => e.teamEliminated && !pendingRemovalIds.has(e.id))

  const canMarkForRemovalEntry = (entry: PlayoffPoolEntry): boolean => {
    if (pendingRemovalIds.has(entry.id)) return false // déjà en sortie
    return true // changements illimités
  }

  const canAddPlayer = true // changements illimités

  // IDs exclus du sélecteur : joueurs du roster non en sortie + joueurs déjà ajoutés au panier
  const excludeIds = useMemo(() => new Set([
    ...entries.filter(e => !pendingRemovalPlayerIds.has(e.playerId)).map(e => e.playerId),
    ...pendingAdditionPlayerIds,
  ]), [entries, pendingRemovalPlayerIds, pendingAdditionPlayerIds])

  const isTrulyLocked = false // changements illimités — jamais verrouillé

  useEffect(() => {
    setLoading(true)
    setCartRemovals([])
    setCartAdditions([])
    setAddPlayer(null)
    const fetchCooldown = isLocked && !adminBypassCooldown
      ? getRecentlyRemovedAction(saison.id, poolerId)
      : Promise.resolve([] as { playerId: number; cooldownUntil: string }[])
    Promise.all([
      getPlayoffPoolRosterAction(poolerId, saison.id, saison.season),
      getPlayoffChangeCountsAction(poolerId, saison.id),
      fetchCooldown,
    ]).then(([r, c, cooldown]) => {
      setEntries(r)
      setCounts(c)
      const map = new Map<number, Date>()
      for (const { playerId, cooldownUntil } of cooldown) map.set(playerId, new Date(cooldownUntil))
      setCooldownMap(map)
      setLoading(false)
    })
  }, [poolerId, saison.id, saison.season, isLocked, adminBypassCooldown])

  function handleMarkForRemoval(entry: PlayoffPoolEntry) {
    const isElimination = isLocked && !!entry.teamEliminated
    setCartRemovals(prev => [...prev, {
      localId: crypto.randomUUID(),
      entryId: entry.id,
      playerId: entry.playerId,
      nhlId: entry.nhlId,
      name: `${entry.lastName}, ${entry.firstName}`,
      teamCode: entry.teamCode,
      capNumber: entry.capNumber ?? 0,
      positionSlot: entry.positionSlot,
      isElimination,
    }])
    setError(null)
  }

  function handleUndoRemoval(localId: string) {
    setCartRemovals(prev => prev.filter(r => r.localId !== localId))
  }

  function handleAddToCart() {
    if (!addPlayer) return
    setCartAdditions(prev => [...prev, {
      localId: crypto.randomUUID(),
      playerId: addPlayer.id,
      nhlId: addPlayer.nhlId,
      name: `${addPlayer.lastName}, ${addPlayer.firstName}`,
      teamCode: addPlayer.teamCode,
      capNumber: addPlayer.capNumber ?? 0,
      positionSlot: activeSlot,
    }])
    setAddPlayer(null)
    setError(null)
  }

  function handleRemoveAddition(localId: string) {
    setCartAdditions(prev => prev.filter(a => a.localId !== localId))
  }

  function handleEditAddition(addition: CartAddition) {
    setCartAdditions(prev => prev.filter(a => a.localId !== addition.localId))
    setActiveSlot(addition.positionSlot)
    setAddPlayer({
      id: addition.playerId,
      firstName: addition.name.split(', ')[1] ?? addition.name,
      lastName: addition.name.split(', ')[0] ?? '',
      position: null,
      teamCode: addition.teamCode,
      teamId: null,
      nhlId: addition.nhlId,
      capNumber: addition.capNumber,
      teamEliminated: false,
    })
    setSearchKey(k => k + 1)
    setError(null)
  }

  // Cap projetée après tout le panier
  const projectedCap = entries
    .filter(e => !pendingRemovalPlayerIds.has(e.playerId))
    .reduce((s, e) => s + (e.capNumber ?? 0), 0)
    + cartAdditions.reduce((s, a) => s + a.capNumber, 0)
  const projectedOver = projectedCap > saison.poolCap
  const hasCart = cartRemovals.length > 0 || cartAdditions.length > 0

  function handleConfirmBatch() {
    if (!hasCart) return
    setError(null)
    startTransition(async () => {
      try {
        const removals: SeriesBatchRemoval[] = cartRemovals.map(r => ({
          entryId: r.entryId,
          playerId: r.playerId,
          nhlId: r.nhlId,
          removalType: !isLocked ? 'free' : r.isElimination ? 'elimination' : 'voluntary',
        }))
        const additions: SeriesBatchAddition[] = cartAdditions.map(a => ({
          playerId: a.playerId,
          nhlId: a.nhlId,
          positionSlot: a.positionSlot,
        }))
        const result = await submitSeriesBatchAction({ poolerId, poolSeasonId: saison.id, season: saison.season, removals, additions })
        if (result.error) {
          setError(result.error)
        } else {
          setSuccess(true)
          setCartRemovals([])
          setCartAdditions([])
          setAddPlayer(null)
          const [r, c] = await Promise.all([
            getPlayoffPoolRosterAction(poolerId, saison.id, saison.season),
            getPlayoffChangeCountsAction(poolerId, saison.id),
          ])
          setEntries(r)
          setCounts(c)
          setTimeout(() => setSuccess(false), 3000)
        }
      } catch (e: any) {
        setError(e?.message ?? 'Erreur lors de la soumission. Veuillez réessayer.')
      }
    })
  }

  const slots: { slot: 'F' | 'D' | 'G'; count: number }[] = [
    { slot: 'F', count: saison.maxF },
    { slot: 'D', count: saison.maxD },
    { slot: 'G', count: saison.maxG },
  ]
  const entriesBySlot = (slot: 'F' | 'D' | 'G') => entries.filter(e => e.positionSlot === slot)
  const totalRequired = saison.maxF + saison.maxD + saison.maxG
  const isComplete =
    entriesBySlot('F').length === saison.maxF &&
    entriesBySlot('D').length === saison.maxD &&
    entriesBySlot('G').length === saison.maxG

  return (
    <div className="space-y-4">

      {/* Sélecteur pooler (admin) */}
      {isAdmin && poolers && poolers.length > 0 && (
        <div className="bg-white rounded-lg shadow p-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Pooler</label>
          <select value={poolerId}
            onChange={e => { setPoolerId(e.target.value); setCartRemovals([]); setCartAdditions([]); setAddPlayer(null); setError(null) }}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
            {poolers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {/* Bannière statut */}
      <div className={`rounded-lg p-3 text-sm ${!isLocked ? 'bg-green-50 border border-green-200' : isTrulyLocked ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className={`font-semibold ${!isLocked ? 'text-green-700' : isTrulyLocked ? 'text-red-700' : 'text-orange-700'}`}>
              {!isLocked ? '✏️ Soumission libre' : isTrulyLocked ? '🔒 Alignement verrouillé' : '📅 Comptabilisation en cours'}
            </span>
            <span className="text-gray-400 text-xs ml-2">{deadlineLabel(saison.submissionDeadline)}</span>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-gray-600">
              Changements : {counts.voluntary}{cartRemovals.filter(r => !r.isElimination).length > 0 ? `+${cartRemovals.filter(r => !r.isElimination).length}` : ''} / illimité
            </span>
          </div>
        </div>
        {hasEliminatedPlayers && (
          <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-1.5">
            ⚠ Un ou plusieurs joueurs sont sur une équipe éliminée — cliquez ↺ pour les marquer en sortie.
          </p>
        )}
      </div>

      {/* Confirmation alignement */}
      {!loading && isComplete && !isLocked && !isAdmin && (
        <div className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-4 ${confirmed ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className="text-sm">
            {confirmed
              ? <span className="text-green-700 font-semibold">✓ Alignement confirmé — l&apos;admin a été notifié.</span>
              : <span className="text-blue-700">Ton alignement est complet. Confirme-le pour aviser l&apos;admin.</span>}
          </div>
          {!confirmed && (
            <button disabled={confirmPending}
              onClick={async () => { setConfirmPending(true); await confirmPlayoffAlignmentAction(selfPoolerId, selfPoolerName); setConfirmed(true); setConfirmPending(false) }}
              className="shrink-0 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
              {confirmPending ? 'Envoi...' : 'Confirmer mon alignement'}
            </button>
          )}
        </div>
      )}

      {/* Avertissement incomplet */}
      {!loading && !isComplete && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">⚠ Alignement incomplet</span>
          <span className="ml-2 text-amber-600">
            {entries.length}/{totalRequired} joueurs —{' '}
            {[
              entriesBySlot('F').length < saison.maxF && `${entriesBySlot('F').length}/${saison.maxF} F`,
              entriesBySlot('D').length < saison.maxD && `${entriesBySlot('D').length}/${saison.maxD} D`,
              entriesBySlot('G').length < saison.maxG && `${entriesBySlot('G').length}/${saison.maxG} G`,
            ].filter(Boolean).join(', ')}
          </span>
        </div>
      )}

      {/* Layout deux colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* ── Colonne gauche : roster ── */}
        <div className="bg-white rounded-lg shadow p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">{poolerName}</h2>
          {loading ? (
            <p className="text-sm text-gray-400 py-4 text-center">Chargement...</p>
          ) : (
            slots.map(({ slot, count }) => (
              <div key={slot}>
                <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${slotAccent[slot].split(' ')[0]}`}>
                  {slotLabel[slot]}s ({entriesBySlot(slot).length}/{count})
                </p>
                <div className="space-y-1.5">
                  {Array.from({ length: count }).map((_, i) => {
                    const entry = entriesBySlot(slot)[i]
                    const cartRemoval = entry ? cartRemovals.find(r => r.entryId === entry.id) : undefined
                    return (
                      <SlotRow
                        key={i}
                        slot={slot}
                        index={i}
                        entry={entry}
                        isLocked={isLocked}
                        canMarkForRemoval={!!entry && canMarkForRemovalEntry(entry)}
                        isPendingRemoval={!!cartRemoval}
                        onMarkForRemoval={() => entry && handleMarkForRemoval(entry)}
                        onUndoRemoval={() => cartRemoval && handleUndoRemoval(cartRemoval.localId)}
                      />
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Colonne droite ── */}
        <div className="space-y-4">

          <CapBar
            entries={entries}
            poolCap={saison.poolCap}
            cartRemovals={cartRemovals}
            cartAdditions={cartAdditions}
            previewAdd={addPlayer}
          />

          {/* Panneau ajout joueur */}
          {canAddPlayer ? (
            <div className="bg-white rounded-lg shadow p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">Ajouter un joueur au panier</p>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Slot à remplir</label>
                <div className="flex gap-2">
                  {(['F', 'D', 'G'] as const).map(s => (
                    <button key={s} onClick={() => { setActiveSlot(s); setAddPlayer(null) }}
                      className={`flex-1 py-1.5 text-sm font-semibold rounded border transition-colors
                        ${activeSlot === s ? `${slotAccent[s]} border-current` : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <PlayerPicker
                poolSeasonId={saison.id}
                season={saison.season}
                excludeIds={excludeIds}
                cooldownMap={cooldownMap}
                activeSlot={activeSlot}
                selected={addPlayer}
                onSelect={setAddPlayer}
                resetKey={searchKey}
              />

              <button onClick={handleAddToCart} disabled={!addPlayer}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-40 text-sm font-medium transition-colors">
                + Ajouter au panier
              </button>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-sm text-gray-400 text-center">
              L&apos;alignement est verrouillé.
            </div>
          )}

          {/* Panier */}
          {hasCart && (
            <div className="bg-white rounded-lg shadow p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Panier</p>
                <button onClick={() => { setCartRemovals([]); setCartAdditions([]); setError(null) }}
                  className="text-xs text-red-500 hover:text-red-700">Vider</button>
              </div>

              {/* Sortants */}
              {cartRemovals.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Sortants ({cartRemovals.length})
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {cartRemovals.map(r => (
                      <li key={r.localId} className="flex items-center justify-between py-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded mr-2 ${r.isElimination ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            {r.isElimination ? 'Élim.' : 'Volont.'}
                          </span>
                          <span className="text-gray-700">{r.name}</span>
                          <span className="text-xs text-gray-400 ml-2">{r.teamCode} · {r.positionSlot}</span>
                        </div>
                        <div className="flex items-center gap-1 ml-3 shrink-0">
                          <span className="text-xs text-red-600 tabular-nums">−{capFmt(r.capNumber)}</span>
                          <button onClick={() => handleUndoRemoval(r.localId)}
                            className="text-xs text-gray-400 hover:text-red-500 ml-1">↩</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Entrants */}
              {cartAdditions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Entrants ({cartAdditions.length})
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {cartAdditions.map(a => (
                      <li key={a.localId} className="flex items-center justify-between py-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded mr-2 ${slotBadge[a.positionSlot]}`}>
                            {a.positionSlot}
                          </span>
                          <span className="text-gray-700">{a.name}</span>
                          <span className="text-xs text-gray-400 ml-2">{a.teamCode}</span>
                        </div>
                        <div className="flex items-center gap-1 ml-3 shrink-0">
                          <span className="text-xs text-green-600 tabular-nums">+{capFmt(a.capNumber)}</span>
                          <button onClick={() => handleEditAddition(a)}
                            className="text-xs text-blue-500 hover:text-blue-700 ml-1">Modifier</button>
                          <button onClick={() => handleRemoveAddition(a.localId)}
                            className="text-xs text-gray-400 hover:text-red-500 ml-1">✕</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Résumé cap */}
              {hasCart && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
                  Cap projetée : <span className={projectedOver ? 'text-red-600 font-semibold' : 'text-gray-800 font-semibold'}>{capFmt(projectedCap)}</span>
                  {' / '}{capFmt(saison.poolCap)}
                  {projectedOver && <span className="text-red-600 ml-1">⚠ Dépassement</span>}
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && <p className="text-sm text-green-600 font-medium">✓ Changements enregistrés.</p>}

              <button onClick={handleConfirmBatch} disabled={isPending || projectedOver || !hasCart}
                className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-40 text-sm font-semibold transition-colors">
                {isPending ? 'Enregistrement...' : `Confirmer (${cartRemovals.length} sortant${cartRemovals.length > 1 ? 's' : ''} · ${cartAdditions.length} entrant${cartAdditions.length > 1 ? 's' : ''})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
