'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  loadPresaisonDataAction, saveDraftOrderAction, initDraftOrderFromStandingsAction,
  resetLtirToActifAction, demoteSurplusToReserveAction, resetPresaisonDraftAction,
  loadPresaisonDraftStateAction, startPresaisonDraftAction, advancePresaisonQueueAction,
  endPresaisonDraftAction, adjustPresaisonTimerAction, resetPresaisonTimerAction,
  setReleasePhaseAction, pausePresaisonTimerAction, resumePresaisonTimerAction,
} from './actions'
import { DEFAULT_NHL_MINIMUM_SALARY, type PoolerCapInfo, type RosterEntry, type DraftState } from './types'
import DraftOrderEditor from './DraftOrderEditor'
import FreeAgentSigner from './FreeAgentSigner'

type Saison = { id: number; season: string; is_active: boolean }

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const DASH = '\u2014'
// ── Compliance Card ───────────────────────────────────────────────────────────

function posBucket(position: string | null): 'forward' | 'defense' | 'goalie' {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

// Suivi en lecture seule (David, 2026-09-06) — les actions (libérer, changer de type) sont
// maintenant en libre-service par chaque pooler via /repechage-agents-libres (Mon
// alignement) ; garder les mêmes boutons ici en plus faisait double emploi et portait à
// confusion. Pour agir au nom d'un pooler dans un cas exceptionnel, /admin/transactions
// couvre déjà tout (release/type_change/promote pour n'importe quel pooler) — pas besoin de
// dupliquer ce pouvoir ici.
function ComplianceCard({
  pooler, isCurrentDrafter, startExpanded,
}: {
  pooler: PoolerCapInfo
  isCurrentDrafter: boolean
  startExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(!!startExpanded)

  // Groupes par position/type, triés par salaire décroissant dans chaque groupe (David,
  // 2026-09-08) — facilite le repérage visuel des plus gros contrats à libérer en premier.
  const byCapDesc = (a: RosterEntry, b: RosterEntry) => b.cap_number - a.cap_number
  const forwards   = pooler.roster.filter(e => e.player_type === 'actif' && posBucket(e.position) === 'forward').sort(byCapDesc)
  const defense    = pooler.roster.filter(e => e.player_type === 'actif' && posBucket(e.position) === 'defense').sort(byCapDesc)
  const goalies    = pooler.roster.filter(e => e.player_type === 'actif' && posBucket(e.position) === 'goalie').sort(byCapDesc)
  const reservistes = pooler.roster.filter(e => e.player_type === 'reserviste').sort(byCapDesc)
  const ltir       = pooler.roster.filter(e => e.player_type === 'ltir').sort(byCapDesc)

  const renderGroup = (title: string, entries: RosterEntry[]) => {
    if (entries.length === 0) return null
    return (
      <div key={title}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{title}</p>
        <div className="space-y-0.5">
          {entries.map(e => (
            <div key={e.roster_id} className="flex items-center text-xs px-2 py-1.5 rounded gap-2 bg-gray-50">
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
          ))}
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
          {pooler.isReadyForDraft ? (
            <span className="text-[10px] font-medium bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">Prêt</span>
          ) : pooler.isOverLimits ? (
            <span className="text-[10px] font-medium bg-red-50 text-red-600 px-1.5 py-0.5 rounded">À libérer</span>
          ) : (
            <span className="text-[10px] font-medium bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">
              Manque {fmt(pooler.capNeededForReady - pooler.capSpace)}
            </span>
          )}
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
          {/* Préparation au repêchage AL */}
          {pooler.isOverLimits && (
            <p className="text-xs text-red-600">
              ⚠ Dépasse le plafond de {fmt(Math.abs(pooler.capSpace))} — libérer des joueurs avant de pouvoir participer au repêchage.
            </p>
          )}
          {!pooler.isOverLimits && pooler.slotsManquants > 0 && (
            <p className={`text-xs ${pooler.isReadyForDraft ? 'text-emerald-600' : 'text-amber-600'}`}>
              {pooler.slotsManquants} poste{pooler.slotsManquants > 1 ? 's' : ''} à combler — besoin d&apos;au moins{' '}
              {fmt(pooler.capNeededForReady)} d&apos;espace pour compléter l&apos;alignement au salaire minimum.
              {!pooler.isReadyForDraft && ' Pas encore assez d\'espace disponible.'}
            </p>
          )}

          {/* Roster par position */}
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {renderGroup('Attaquants', forwards)}
            {renderGroup('Défenseurs', defense)}
            {renderGroup('Gardiens', goalies)}
            {renderGroup('Réservistes', reservistes)}
            {renderGroup('LTIR', ltir)}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Main PresaisonManager ─────────────────────────────────────────────────────

type Data = {
  poolers: PoolerCapInfo[]
  draftOrder: string[]
  poolCap: number
  season: string
  nhlMinimumSalary: number
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
  const [startErr, setStartErr] = useState<string | null>(null)
  const [togglingReleasePhase, setTogglingReleasePhase] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // LTIR reset
  const [resettingLtir, setResettingLtir] = useState(false)
  const [ltirMsg, setLtirMsg] = useState<string | null>(null)

  // Reclassement du surplus actif → réserviste
  const [demoting, setDemoting] = useState(false)
  const [demoteMsg, setDemoteMsg] = useState<string | null>(null)

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
      nhlMinimumSalary: result.nhlMinimumSalary ?? DEFAULT_NHL_MINIMUM_SALARY,
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
      nhlMinimumSalary: result.nhlMinimumSalary ?? DEFAULT_NHL_MINIMUM_SALARY,
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

  const eligibleIds = (poolers: PoolerCapInfo[], order: string[], threshold: number) =>
    order.filter(id => {
      const p = poolers.find(pp => pp.id === id)
      return p && p.capSpace >= threshold
    })

  const startDraft = async () => {
    setStarting(true)
    setStartErr(null)
    const result = await startPresaisonDraftAction(saisonId)
    setStarting(false)
    if (result.error) { setStartErr(result.error); return }
    if (result.state) setDraftState(result.state)
  }

  const handleSetReleasePhase = async (open: boolean) => {
    setTogglingReleasePhase(true)
    const result = await setReleasePhaseAction(saisonId, open)
    setTogglingReleasePhase(false)
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

  const handlePauseToggle = async () => {
    const result = isPaused
      ? await resumePresaisonTimerAction(saisonId)
      : await pausePresaisonTimerAction(saisonId)
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
  // turn_started_at=null pendant que is_active=true = chrono en pause — voir AdminPanel.tsx
  // (repechage-agents-libres), même mécanique, même presaison_draft_state.
  const isPaused = isDraftActive && draftState?.turn_started_at === null
  const remainingSeconds = draftState?.turn_started_at
    ? Math.max(0, draftState.turn_duration_seconds - Math.floor((now - new Date(draftState.turn_started_at).getTime()) / 1000))
    : isPaused ? (draftState?.turn_duration_seconds ?? null) : null

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

  const MAX_BY_BUCKET = { forward: 12, defense: 6, goalie: 2 } as const
  const surplusCount = data.poolers.reduce((sum, p) => {
    const counts = { forward: 0, defense: 0, goalie: 0 }
    for (const e of p.roster) {
      if (e.player_type === 'actif') counts[posBucket(e.position)]++
    }
    return sum
      + Math.max(0, counts.forward - MAX_BY_BUCKET.forward)
      + Math.max(0, counts.defense - MAX_BY_BUCKET.defense)
      + Math.max(0, counts.goalie - MAX_BY_BUCKET.goalie)
  }, 0)

  const handleDemoteSurplus = async () => {
    setDemoting(true)
    const result = await demoteSurplusToReserveAction(saisonId)
    setDemoting(false)
    if (result.error) {
      setDemoteMsg(`Erreur : ${result.error}`)
    } else {
      setDemoteMsg(`${result.updated} joueur${(result.updated ?? 0) > 1 ? 's' : ''} reclassé${(result.updated ?? 0) > 1 ? 's' : ''} en réserviste.`)
      await refreshData()
    }
    setTimeout(() => setDemoteMsg(null), 4000)
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

      {/* Banner surplus actif → réserviste */}
      {surplusCount > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <p className="text-sm text-blue-800">
            {surplusCount} joueur{surplusCount > 1 ? 's' : ''} actif{surplusCount > 1 ? 's' : ''} en trop à une position (au-delà de 12A/6D/2G), tous poolers confondus.
            Un surplus de composition n&apos;affecte pas le cap — les moins chers seraient reclassés en réserviste, chaque pooler pourra ajuster ensuite lui-même en libre-service.
          </p>
          <div className="flex items-center gap-3 ml-4 shrink-0">
            {demoteMsg && <span className="text-xs text-blue-700">{demoteMsg}</span>}
            <button
              onClick={handleDemoteSurplus}
              disabled={demoting}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
            >
              {demoting ? '...' : 'Mettre les surplus en réserviste'}
            </button>
          </div>
        </div>
      )}

      {/* Compliance panel */}
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Aperçu des rosters</h2>
        <p className="text-xs text-gray-400 mb-4">
          Suivi en lecture seule — chaque pooler ajuste son propre alignement (libérations, actif/réserviste, activer une recrue) en libre-service depuis /repechage-agents-libres. Pour agir à sa place dans un cas exceptionnel, utiliser /admin/transactions.
        </p>
        <div className="space-y-2">
          {data.poolers.map(p => (
            <ComplianceCard
              key={p.id}
              pooler={p}
              isCurrentDrafter={p.id === currentPoolerId}
              startExpanded={p.id === highlightPoolerId}
            />
          ))}
        </div>
      </div>

      {/* Phase de libération de joueurs — David, 2026-09-08 : distincte du repêchage AL
          lui-même. Tant qu'elle est ouverte, chaque pooler peut libérer n'importe quel joueur
          signé en libre-service ; une fois fermée, seules les recrues de banque restent
          libérables/activables, et le repêchage AL peut démarrer. */}
      {(() => {
        const releaseOpen = draftState?.release_phase_open ?? false
        return (
          <div className={`rounded-lg shadow p-5 flex items-center justify-between flex-wrap gap-3 ${releaseOpen ? 'bg-amber-50 border border-amber-200' : 'bg-white'}`}>
            <div>
              <h2 className="font-semibold text-gray-800">Phase de libération de joueurs</h2>
              <p className="text-xs text-gray-500 mt-1 max-w-2xl">
                {releaseOpen
                  ? 'Ouverte — chaque pooler peut libérer n’importe quel joueur signé, basculer actif/réserviste, et activer/libérer une recrue depuis /repechage-agents-libres. Ferme-la une fois que tout le monde a ajusté sa masse salariale.'
                  : 'Fermée — les poolers ne peuvent plus libérer de joueurs signés (les recrues de banque restent activables/libérables). Le repêchage d’agents libres peut démarrer.'}
              </p>
            </div>
            <button
              onClick={() => handleSetReleasePhase(!releaseOpen)}
              disabled={togglingReleasePhase}
              className={`text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-40 shrink-0 ${releaseOpen ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {togglingReleasePhase ? '...' : releaseOpen ? 'Fermer la libération de joueurs' : 'Rouvrir la libération de joueurs'}
            </button>
          </div>
        )
      })()}

      {/* Draft section — l'éditeur d'ordre + "Démarrer" reste visible même après un
          repêchage terminé (isDraftDone), pour pouvoir en relancer un sans devoir passer par
          la Zone de test tout en bas. Un seul bouton "Démarrer/Relancer", pas de doublon. */}
      {!isDraftActive && (
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="font-semibold text-gray-800 mb-1">Ordre du repêchage</h2>
          {isDraftDone && (
            <p className="text-xs mb-3 rounded-lg px-2 py-1.5 bg-emerald-50 text-emerald-700">
              ✓ Dernier repêchage terminé — tous les poolers éligibles ont complété leur tour ou n&apos;ont plus d&apos;espace suffisant.
            </p>
          )}
          <p className="text-xs text-gray-400 mb-4">
            Seuil de participation : {fmt(data.nhlMinimumSalary)} d'espace cap. En dessous, le pooler est retiré automatiquement de la file.
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
              disabled={draftOrder.length === 0 || starting || (draftState?.release_phase_open ?? false)}
              className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm"
            >
              {starting ? 'Démarrage...' : isDraftDone ? 'Relancer le repêchage' : 'Démarrer le repêchage'}
            </button>
            {(draftState?.release_phase_open ?? false) && (
              <p className="text-xs text-amber-600 mt-2">Ferme d’abord la phase de libération de joueurs ci-dessus.</p>
            )}
            {draftOrder.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                {eligibleIds(data.poolers, draftOrder, data.nhlMinimumSalary).length} pooler{eligibleIds(data.poolers, draftOrder, data.nhlMinimumSalary).length > 1 ? 's' : ''} éligibles (≥ {fmt(data.nhlMinimumSalary)} d'espace) · visible en direct par les poolers sur /repechage-agents-libres
              </p>
            )}
            {startErr && (
              <p className="text-sm text-red-600 mt-2">{startErr}</p>
            )}
          </div>
        </div>
      )}

      {isDraftActive && currentPooler && (
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-800 text-lg">
                Tour de : <span className="text-blue-700">{currentPooler.name}</span>
                {isPaused && <span className="ml-3 text-sm font-medium align-middle text-amber-600">⏸ En pause</span>}
                {remainingSeconds !== null && !isPaused && (
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
                <button onClick={handlePauseToggle} className="text-xs text-gray-400 hover:text-gray-700 border rounded px-2 py-0.5">
                  {isPaused ? '▶ Reprendre' : '⏸ Pause'}
                </button>
                <button onClick={() => handleTimerAdjust(-30)} className="text-xs text-gray-400 hover:text-gray-700 border rounded px-2 py-0.5">
                  -30s
                </button>
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
            threshold={data.nhlMinimumSalary}
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
