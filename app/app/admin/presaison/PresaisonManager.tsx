'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  loadPresaisonDataAction, saveDraftOrderAction, initDraftOrderFromStandingsAction,
  resetLtirToActifAction, resetPresaisonDraftAction,
  loadPresaisonDraftStateAction, startPresaisonDraftAction, advancePresaisonQueueAction,
  endPresaisonDraftAction, adjustPresaisonTimerAction, resetPresaisonTimerAction,
} from './actions'
import { FREE_AGENT_THRESHOLD, type PoolerCapInfo, type RosterEntry, type DraftState } from './types'
import { submitTransactionAction, searchFreeAgentsAction } from '../transactions/actions'

type Saison = { id: number; season: string; is_active: boolean }

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const DASH = '\u2014'
const typeLabel: Record<string, string> = {
  actif: 'Actif', reserviste: 'Réserviste', ltir: 'LTIR', recrue: 'Recrue',
}

// ── Compliance Card ───────────────────────────────────────────────────────────

function posBucket(position: string | null): 'forward' | 'defense' | 'goalie' {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

function ComplianceCard({
  pooler, saisonId, onRefresh, isCurrentDrafter, startExpanded,
}: {
  pooler: PoolerCapInfo
  saisonId: number
  onRefresh: () => Promise<void>
  isCurrentDrafter: boolean
  startExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(!!startExpanded)
  const [releaseMode, setReleaseMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showTypeChange, setShowTypeChange] = useState(false)
  const [typeChangeRosterId, setTypeChangeRosterId] = useState('')
  const [newType, setNewType] = useState('actif')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const toggleSelect = (playerId: number) =>
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })

  const cancelRelease = () => { setReleaseMode(false); setSelectedIds(new Set()); setErr(null) }
  const cancelTypeChange = () => { setShowTypeChange(false); setTypeChangeRosterId(''); setErr(null) }

  const handleRelease = async () => {
    if (selectedIds.size === 0) return
    setBusy(true); setErr(null)
    const items = pooler.roster
      .filter(e => selectedIds.has(e.player_id))
      .map(e => ({ action_type: 'release' as const, from_pooler_id: pooler.id, player_id: e.player_id, old_player_type: e.player_type }))
    const result = await submitTransactionAction(saisonId, 'Ajustement pré-saison', items)
    setBusy(false)
    if (result.error) { setErr(result.error) } else { cancelRelease(); await onRefresh() }
  }

  const handleTypeChange = async () => {
    const entry = pooler.roster.find(e => String(e.roster_id) === typeChangeRosterId)
    if (!entry) return
    setBusy(true); setErr(null)
    const result = await submitTransactionAction(saisonId, 'Ajustement pré-saison', [{
      action_type: 'type_change' as const,
      from_pooler_id: pooler.id,
      to_pooler_id: pooler.id,
      player_id: entry.player_id,
      old_player_type: entry.player_type,
      new_player_type: newType,
    }])
    setBusy(false)
    if (result.error) { setErr(result.error) } else { cancelTypeChange(); await onRefresh() }
  }

  // Groupes par position/type
  const forwards   = pooler.roster.filter(e => e.player_type === 'actif' && posBucket(e.position) === 'forward')
  const defense    = pooler.roster.filter(e => e.player_type === 'actif' && posBucket(e.position) === 'defense')
  const goalies    = pooler.roster.filter(e => e.player_type === 'actif' && posBucket(e.position) === 'goalie')
  const reservistes = pooler.roster.filter(e => e.player_type === 'reserviste')
  const ltir       = pooler.roster.filter(e => e.player_type === 'ltir')

  const renderGroup = (title: string, entries: RosterEntry[]) => {
    if (entries.length === 0) return null
    return (
      <div key={title}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{title}</p>
        <div className="space-y-0.5">
          {entries.map(e => {
            const isChecked = selectedIds.has(e.player_id)
            return (
              <div
                key={e.roster_id}
                onClick={() => releaseMode && toggleSelect(e.player_id)}
                className={`flex items-center text-xs px-2 py-1.5 rounded gap-2 ${
                  releaseMode
                    ? isChecked
                      ? 'bg-red-50 border border-red-200 cursor-pointer'
                      : 'hover:bg-gray-100 bg-white cursor-pointer'
                    : 'bg-gray-50'
                }`}
              >
                {releaseMode && (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    readOnly
                    className="accent-red-500 pointer-events-none shrink-0"
                  />
                )}
                <span className="flex-1 text-gray-700">{e.playerName}</span>
                <span className="text-gray-400 shrink-0 flex items-center gap-1">
                  {e.position ?? DASH} · {e.cap_number > 0 ? fmt(e.cap_number) : DASH}
                  {e.isEstimatedCap && (
                    <span
                      className="text-amber-600 bg-amber-50 rounded px-1 py-0.5 text-[10px] font-medium"
                      title="Cap simulé — joueur sans contrat pour cette saison, en attente du vrai contrat."
                    >
                      ≈ estimé
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div id={`pooler-card-${pooler.id}`} className={`border rounded-lg border-gray-200 ${isCurrentDrafter ? 'ring-2 ring-blue-500' : ''} ${startExpanded ? 'ring-2 ring-amber-400' : ''}`}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left bg-white rounded-lg"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3 flex-wrap">
          {isCurrentDrafter && (
            <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded font-medium">Tour actuel</span>
          )}
          <span className="font-semibold text-gray-800">{pooler.name}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
          <span className="hidden sm:inline">{fmt(pooler.capUsed)} utilisé</span>
          <span className={pooler.capSpace < 0 ? 'text-red-600 font-medium' : 'text-gray-600'}>
            {pooler.capSpace >= 0 ? `${fmt(pooler.capSpace)} dispo` : `${fmt(Math.abs(pooler.capSpace))} dépassé`}
          </span>
          <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3">
          {/* Cap bar */}
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${pooler.capSpace < 0 ? 'bg-red-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, (pooler.capUsed / Math.max(pooler.capUsed + pooler.capSpace, 1)) * 100)}%` }}
            />
          </div>

          {/* Counts */}
          <div className="flex gap-4 text-xs text-gray-500">
            <span>Att {pooler.counts.forward}/12</span>
            <span>Déf {pooler.counts.defense}/6</span>
            <span>Gar {pooler.counts.goalie}/2</span>
            <span>Rés {pooler.counts.reserviste}</span>
          </div>

          {/* Roster par position */}
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {renderGroup('Attaquants', forwards)}
            {renderGroup('Défenseurs', defense)}
            {renderGroup('Gardiens', goalies)}
            {renderGroup('Réservistes', reservistes)}
            {renderGroup('LTIR', ltir)}
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}

          {/* Barre d'actions en mode libération */}
          {releaseMode && (
            <div className="flex items-center gap-3 pt-2 border-t">
              <span className="text-xs text-gray-500 flex-1">
                {selectedIds.size > 0 ? `${selectedIds.size} joueur${selectedIds.size > 1 ? 's' : ''} sélectionné${selectedIds.size > 1 ? 's' : ''}` : 'Cocher les joueurs à libérer'}
              </span>
              <button
                onClick={handleRelease}
                disabled={busy || selectedIds.size === 0}
                className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40"
              >
                {busy ? '...' : `Libérer (${selectedIds.size})`}
              </button>
              <button onClick={cancelRelease} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
            </div>
          )}

          {/* Formulaire changement de type */}
          {showTypeChange && (
            <div className="bg-gray-50 border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Changer le type</span>
                <button onClick={cancelTypeChange} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
              </div>
              <select
                value={typeChangeRosterId}
                onChange={e => setTypeChangeRosterId(e.target.value)}
                className="w-full border rounded px-2 py-1 text-xs focus:outline-none"
              >
                <option value="">— Sélectionner un joueur —</option>
                {pooler.roster
                  .filter(e => ['actif', 'reserviste', 'ltir'].includes(e.player_type))
                  .map(e => (
                    <option key={e.roster_id} value={String(e.roster_id)}>
                      {e.playerName} — {typeLabel[e.player_type]}
                    </option>
                  ))}
              </select>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value)}
                className="w-full border rounded px-2 py-1 text-xs focus:outline-none"
              >
                {['actif', 'reserviste', 'ltir'].map(t => (
                  <option key={t} value={t}>{typeLabel[t]}</option>
                ))}
              </select>
              <button
                onClick={handleTypeChange}
                disabled={busy || !typeChangeRosterId}
                className="w-full text-xs bg-gray-700 text-white py-1.5 rounded hover:bg-gray-800 disabled:opacity-40"
              >
                {busy ? 'En cours...' : 'Confirmer'}
              </button>
            </div>
          )}

          {/* Boutons d'entrée dans un mode */}
          {!releaseMode && !showTypeChange && (
            <div className="flex gap-2 pt-1 border-t">
              <button
                onClick={() => setReleaseMode(true)}
                className="text-xs px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded"
              >
                Libérer des joueurs
              </button>
              <button
                onClick={() => setShowTypeChange(true)}
                className="text-xs px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded"
              >
                Changer type
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Draft Order Editor ────────────────────────────────────────────────────────

function DraftOrderEditor({
  poolers, order, onChange, onSave, saving,
}: {
  poolers: PoolerCapInfo[]
  order: string[]
  onChange: (order: string[]) => void
  onSave: () => void
  saving: boolean
}) {
  const poolerMap = new Map(poolers.map(p => [p.id, p.name]))
  const unordered = poolers.filter(p => !order.includes(p.id))

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-2">
        Le pooler en position 1 signe en premier. L'ordre est séquentiel et cyclique.
      </p>

      {order.map((id, idx) => (
        <div key={id} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded border">
          <span className="text-xs text-gray-400 w-5 text-right font-mono">{idx + 1}</span>
          <span className="flex-1 text-sm text-gray-800">{poolerMap.get(id) ?? id}</span>
          <div className="flex gap-1">
            <button
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-20 px-1 text-xs"
            >▲</button>
            <button
              onClick={() => move(idx, 1)}
              disabled={idx === order.length - 1}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-20 px-1 text-xs"
            >▼</button>
            <button
              onClick={() => onChange(order.filter(x => x !== id))}
              className="text-red-300 hover:text-red-500 px-1 text-xs ml-1"
            >✕</button>
          </div>
        </div>
      ))}

      {unordered.length > 0 && (
        <div className="pt-2 space-y-1">
          <p className="text-xs text-gray-400">Non inclus :</p>
          {unordered.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded border border-dashed">
              <span className="text-sm text-gray-500">{p.name}</span>
              <button
                onClick={() => onChange([...order, p.id])}
                className="text-xs text-blue-600 hover:underline"
              >
                Ajouter
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onSave}
        disabled={saving || order.length === 0}
        className="w-full mt-3 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40"
      >
        {saving ? 'Sauvegarde...' : 'Sauvegarder l\'ordre'}
      </button>
    </div>
  )
}

// ── Free Agent Signer ─────────────────────────────────────────────────────────

function FreeAgentSigner({
  pooler, saisonId, season, onSign,
}: {
  pooler: PoolerCapInfo
  saisonId: number
  season: string
  onSign: () => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [newType, setNewType] = useState('actif')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) { setResults([]); return }
      setLoadingSearch(true)
      const res = await searchFreeAgentsAction(saisonId, query)
      setResults(res.players)
      setLoadingSearch(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, saisonId])

  const getCap = (p: any) =>
    p.player_contracts?.find((c: any) => c.season === season)?.cap_number ?? 0

  const handleSign = async () => {
    const fa = results.find(p => String(p.id) === selectedId)
    if (!fa) return
    setBusy(true)
    setErr(null)
    const result = await submitTransactionAction(saisonId, 'Repêchage pré-saison', [{
      action_type: 'sign',
      to_pooler_id: pooler.id,
      player_id: fa.id,
      new_player_type: newType,
    }])
    setBusy(false)
    if (result.error) {
      setErr(result.error)
    } else {
      setQuery('')
      setResults([])
      setSelectedId('')
      await onSign()
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Espace disponible :{' '}
        <span className={`font-semibold ${pooler.capSpace < FREE_AGENT_THRESHOLD ? 'text-amber-600' : 'text-green-700'}`}>
          {fmt(pooler.capSpace)}
        </span>
        {pooler.capSpace < FREE_AGENT_THRESHOLD && (
          <span className="text-amber-600"> — sous le seuil de {fmt(FREE_AGENT_THRESHOLD)}</span>
        )}
      </p>

      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Rechercher un agent libre..."
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loadingSearch && <p className="text-xs text-gray-400">Recherche...</p>}

      {results.length > 0 && (
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          size={Math.min(results.length, 6)}
          className="w-full border rounded-lg text-sm focus:outline-none"
        >
          <option value="">— Sélectionner —</option>
          {results.map(p => (
            <option key={p.id} value={String(p.id)}>
              {p.last_name}, {p.first_name} ({p.teams?.code ?? DASH}) {p.position}
              {getCap(p) > 0 ? ` — ${fmt(getCap(p))}` : ''}
            </option>
          ))}
        </select>
      )}

      {selectedId && (
        <select
          value={newType}
          onChange={e => setNewType(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="actif">Actif</option>
          <option value="reserviste">Réserviste</option>
        </select>
      )}

      {err && <p className="text-xs text-red-600">{err}</p>}

      <button
        onClick={handleSign}
        disabled={busy || !selectedId}
        className="w-full px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40"
      >
        {busy ? 'Signature en cours...' : 'Signer'}
      </button>
    </div>
  )
}

// ── Main PresaisonManager ─────────────────────────────────────────────────────

type Data = {
  poolers: PoolerCapInfo[]
  draftOrder: string[]
  poolCap: number
  season: string
}

export default function PresaisonManager({
  saisons,
  defaultSaisonId,
  highlightPoolerId,
}: {
  saisons: Saison[]
  defaultSaisonId: number
  highlightPoolerId?: string
}) {
  const [saisonId, setSaisonId] = useState(defaultSaisonId)
  const [data, setData] = useState<Data | null>(null)
  const [loadingInit, setLoadingInit] = useState(true)
  const [initErr, setInitErr] = useState<string | null>(null)

  // Draft order (editable, saved separately)
  const [draftOrder, setDraftOrder] = useState<string[]>([])
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderMsg, setOrderMsg] = useState<string | null>(null)
  const [initializingOrder, setInitializingOrder] = useState(false)

  // Draft state — persisté en base (presaison_draft_state), partagé avec /repechage-agents-libres
  const [draftState, setDraftState] = useState<DraftState | null>(null)
  const [starting, setStarting] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // LTIR reset
  const [resettingLtir, setResettingLtir] = useState(false)
  const [ltirMsg, setLtirMsg] = useState<string | null>(null)

  // Draft reset
  const [resettingDraft, setResettingDraft] = useState(false)
  const [resetDraftMsg, setResetDraftMsg] = useState<string | null>(null)

  // Full load (on season change): also resets draft order from DB
  const loadAll = useCallback(async (id: number) => {
    setLoadingInit(true)
    setInitErr(null)
    const [result, stateResult] = await Promise.all([
      loadPresaisonDataAction(id),
      loadPresaisonDraftStateAction(id),
    ])
    setLoadingInit(false)
    if (result.error) { setInitErr(result.error); return null }
    const d: Data = {
      poolers: result.poolers!,
      draftOrder: result.draftOrder!,
      poolCap: result.poolCap!,
      season: result.season!,
    }
    setData(d)
    setDraftOrder(d.draftOrder)
    setDraftState(stateResult.state ?? null)
    return d
  }, [])

  // Refresh cap data after actions (preserves admin's in-progress order edits)
  const refreshData = useCallback(async (): Promise<Data | null> => {
    const result = await loadPresaisonDataAction(saisonId)
    if (result.error) return null
    const d: Data = {
      poolers: result.poolers!,
      draftOrder: result.draftOrder!,
      poolCap: result.poolCap!,
      season: result.season!,
    }
    setData(d)
    return d
  }, [saisonId])

  useEffect(() => {
    loadAll(saisonId)
  }, [saisonId, loadAll])

  // Arrivée depuis "Démarrer la saison" (carte de conformité) avec un pooler à corriger —
  // fait défiler jusqu'à sa carte, déjà dépliée via startExpanded.
  useEffect(() => {
    if (!data || !highlightPoolerId) return
    document.getElementById(`pooler-card-${highlightPoolerId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [data, highlightPoolerId])

  // Chrono affiché — purement local, aucun appel serveur, ancré sur turn_started_at
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const eligibleIds = (poolers: PoolerCapInfo[], order: string[]) =>
    order.filter(id => {
      const p = poolers.find(pp => pp.id === id)
      return p && p.capSpace >= FREE_AGENT_THRESHOLD
    })

  const startDraft = async () => {
    setStarting(true)
    const result = await startPresaisonDraftAction(saisonId)
    setStarting(false)
    if (result.state) setDraftState(result.state)
  }

  // Après une signature ("Signer") ou "Passer" : le serveur recalcule l'éligibilité à partir
  // de données fraîches et fait tourner la file — remplace l'ancien advanceQueue() local.
  const advanceAfterAction = async () => {
    const [stateResult] = await Promise.all([advancePresaisonQueueAction(saisonId), refreshData()])
    if (stateResult.state) setDraftState(stateResult.state)
  }

  const handleSign = advanceAfterAction
  const handlePass = advanceAfterAction

  const handleEndDraft = async () => {
    const result = await endPresaisonDraftAction(saisonId)
    if (result.state) setDraftState(result.state)
  }

  const handleTimerAdjust = async (delta: number) => {
    const result = await adjustPresaisonTimerAction(saisonId, delta)
    if (result.state) setDraftState(result.state)
  }

  const handleTimerReset = async () => {
    const result = await resetPresaisonTimerAction(saisonId)
    if (result.state) setDraftState(result.state)
  }

  const handleSaveOrder = async () => {
    setSavingOrder(true)
    const result = await saveDraftOrderAction(saisonId, draftOrder)
    setSavingOrder(false)
    setOrderMsg(result.error ? `Erreur : ${result.error}` : 'Ordre sauvegardé.')
    setTimeout(() => setOrderMsg(null), 3000)
  }

  const handleInitOrderFromStandings = async () => {
    setInitializingOrder(true)
    const result = await initDraftOrderFromStandingsAction(saisonId)
    setInitializingOrder(false)
    if (result.error) {
      setOrderMsg(`Erreur : ${result.error}`)
    } else {
      setDraftOrder(result.order ?? [])
      setOrderMsg(`Ordre initialisé d'après le classement ${result.previousSeason} (inversé). N'oubliez pas de sauvegarder.`)
    }
    setTimeout(() => setOrderMsg(null), 5000)
  }

  if (loadingInit) return <div className="text-gray-400 text-sm p-8">Chargement...</div>
  if (initErr) return <div className="text-red-600 text-sm p-8">{initErr}</div>
  if (!data) return null

  const queue = draftState?.queue ?? []
  const isDraftActive = draftState?.is_active ?? false
  const isDraftDone = !isDraftActive && draftState?.ended_at != null
  const currentPoolerId = queue[0] ?? null
  const currentPooler = data.poolers.find(p => p.id === currentPoolerId) ?? null
  const nextPoolerName = queue[1] ? (data.poolers.find(p => p.id === queue[1])?.name ?? '?') : null
  const remainingSeconds = draftState?.turn_started_at
    ? Math.max(0, draftState.turn_duration_seconds - Math.floor((now - new Date(draftState.turn_started_at).getTime()) / 1000))
    : null

  const ltirCount = data.poolers.reduce(
    (sum, p) => sum + p.roster.filter(e => e.player_type === 'ltir').length, 0,
  )

  const handleResetLtir = async () => {
    setResettingLtir(true)
    const result = await resetLtirToActifAction(saisonId)
    setResettingLtir(false)
    if (result.error) {
      setLtirMsg(`Erreur : ${result.error}`)
    } else {
      setLtirMsg(`${result.updated} joueur${(result.updated ?? 0) > 1 ? 's' : ''} remis à Actif.`)
      await refreshData()
    }
    setTimeout(() => setLtirMsg(null), 4000)
  }

  return (
    <div className="space-y-6">
      {/* Season selector */}
      <div className="flex items-center gap-4 flex-wrap">
        <select
          value={saisonId}
          onChange={e => setSaisonId(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {saisons.map(s => (
            <option key={s.id} value={s.id}>
              {s.season}{s.is_active ? ' (active)' : ''}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">
          Cap du pool :{' '}
          <span className="font-semibold text-gray-800">{fmt(data.poolCap)}</span>
        </span>
      </div>

      {/* Banner LTIR */}
      {ltirCount > 0 && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-800">
            {ltirCount} joueur{ltirCount > 1 ? 's' : ''} encore en LTIR dans cette saison.
            Les joueurs en LTIR doivent être remis à Actif au début de saison.
          </p>
          <div className="flex items-center gap-3 ml-4 shrink-0">
            {ltirMsg && <span className="text-xs text-amber-700">{ltirMsg}</span>}
            <button
              onClick={handleResetLtir}
              disabled={resettingLtir}
              className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 whitespace-nowrap"
            >
              {resettingLtir ? '...' : 'Remettre tous à Actif'}
            </button>
          </div>
        </div>
      )}


      {/* Compliance panel */}
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Aperçu des rosters</h2>
        <p className="text-xs text-gray-400 mb-4">
          Cliquer sur un pooler pour voir son roster et effectuer des ajustements (libérations, changements de type) en dehors des tours de repêchage.
        </p>
        <div className="space-y-2">
          {data.poolers.map(p => (
            <ComplianceCard
              key={p.id}
              pooler={p}
              saisonId={saisonId}
              onRefresh={async () => { await refreshData() }}
              isCurrentDrafter={p.id === currentPoolerId}
              startExpanded={p.id === highlightPoolerId}
            />
          ))}
        </div>
      </div>

      {/* Draft section */}
      {!isDraftActive && !isDraftDone && (
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="font-semibold text-gray-800 mb-1">Ordre du repêchage</h2>
          <p className="text-xs text-gray-400 mb-4">
            Seuil de participation : {fmt(FREE_AGENT_THRESHOLD)} d'espace cap. En dessous, le pooler est retiré automatiquement de la file.
          </p>
          <button
            onClick={handleInitOrderFromStandings}
            disabled={initializingOrder}
            className="text-xs px-3 py-1.5 mb-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg disabled:opacity-40"
          >
            {initializingOrder ? 'Calcul...' : 'Initialiser à partir du classement précédent (inversé)'}
          </button>
          <p className="text-xs text-gray-400 mb-3 -mt-2">
            Met aussi à jour l&apos;ordre du repêchage des recrues (onglet Repêchage recrues).
          </p>
          <DraftOrderEditor
            poolers={data.poolers}
            order={draftOrder}
            onChange={setDraftOrder}
            onSave={handleSaveOrder}
            saving={savingOrder}
          />
          {orderMsg && (
            <p className={`text-sm mt-2 ${orderMsg.startsWith('Erreur') ? 'text-red-600' : 'text-green-600'}`}>
              {orderMsg}
            </p>
          )}
          <div className="border-t pt-4 mt-4">
            <button
              onClick={startDraft}
              disabled={draftOrder.length === 0 || starting}
              className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm"
            >
              {starting ? 'Démarrage...' : 'Démarrer le repêchage'}
            </button>
            {draftOrder.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                {eligibleIds(data.poolers, draftOrder).length} pooler{eligibleIds(data.poolers, draftOrder).length > 1 ? 's' : ''} éligibles (≥ {fmt(FREE_AGENT_THRESHOLD)} d'espace) · visible en direct par les poolers sur /repechage-agents-libres
              </p>
            )}
          </div>
        </div>
      )}

      {isDraftDone && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-5">
          <p className="text-green-700 font-semibold">Repêchage terminé.</p>
          <p className="text-sm text-green-600 mt-1">
            Tous les poolers éligibles ont complété leur repêchage ou n'ont plus d'espace suffisant.
          </p>
          <button
            onClick={startDraft}
            disabled={starting}
            className="mt-3 text-sm text-blue-600 hover:underline disabled:opacity-40"
          >
            {starting ? 'Démarrage...' : 'Recommencer un repêchage'}
          </button>
        </div>
      )}

      {isDraftActive && currentPooler && (
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-800 text-lg">
                Tour de : <span className="text-blue-700">{currentPooler.name}</span>
                {remainingSeconds !== null && (
                  <span className={`ml-3 text-sm font-mono align-middle ${
                    remainingSeconds <= 10 ? 'text-red-600' : remainingSeconds <= 30 ? 'text-amber-600' : 'text-gray-400'
                  }`}>
                    ⏱ {String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:{String(remainingSeconds % 60).padStart(2, '0')}
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                File : {queue.map(id => data.poolers.find(p => p.id === id)?.name ?? id).join(' → ')}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <button onClick={() => handleTimerAdjust(30)} className="text-xs text-gray-400 hover:text-gray-700 border rounded px-2 py-0.5">
                  +30s
                </button>
                <button onClick={handleTimerReset} className="text-xs text-gray-400 hover:text-gray-700 border rounded px-2 py-0.5">
                  ↺ Réinitialiser le chrono
                </button>
              </div>
            </div>
            <button
              onClick={handleEndDraft}
              className="text-xs text-gray-400 hover:text-red-600 border rounded px-2 py-1"
            >
              Terminer le repêchage
            </button>
          </div>

          <FreeAgentSigner
            pooler={currentPooler}
            saisonId={saisonId}
            season={data.season}
            onSign={handleSign}
          />

          <div className="border-t pt-4 mt-4">
            <button
              onClick={handlePass}
              className="text-sm text-gray-500 hover:text-gray-700 border rounded-lg px-4 py-2 hover:bg-gray-50"
            >
              Passer{nextPoolerName ? ` → ${nextPoolerName}` : ''}
            </button>
            <p className="text-xs text-gray-400 mt-1">
              Passer replace {currentPooler.name} en fin de file s'il reste éligible.
            </p>
          </div>
        </div>
      )}

      {/* ── Zone de réinitialisation ─────────────────────────────────────────── */}
      <div className="mt-10 border-t border-red-200 pt-6">
        <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-2">Zone de test</h2>
        <p className="text-xs text-gray-500 mb-3">
          Annule toutes les transactions de repêchage pré-saison pour cette saison et retire les agents libres signés des rosters.
        </p>
        <div className="flex items-center gap-4">
          <button
            disabled={resettingDraft || !saisonId}
            onClick={async () => {
              if (!saisonId) return
              if (!window.confirm('Réinitialiser le repêchage pré-saison ? Toutes les signatures seront annulées.')) return
              setResettingDraft(true)
              setResetDraftMsg(null)
              const res = await resetPresaisonDraftAction(saisonId)
              if (res.error) {
                setResetDraftMsg(`Erreur : ${res.error}`)
              } else {
                setResetDraftMsg(`${res.reversed} transaction(s) annulée(s).`)
                await loadAll(saisonId)
              }
              setResettingDraft(false)
            }}
            className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm hover:bg-red-50 disabled:opacity-50"
          >
            {resettingDraft ? '...' : 'Réinitialiser le repêchage'}
          </button>
          {resetDraftMsg && <span className="text-xs text-red-700">{resetDraftMsg}</span>}
        </div>
      </div>
    </div>
  )
}
