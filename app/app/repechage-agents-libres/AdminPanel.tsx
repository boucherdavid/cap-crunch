'use client'

import { useState } from 'react'
import DraftOrderEditor from '../admin/presaison/DraftOrderEditor'
import FreeAgentSigner from '../admin/presaison/FreeAgentSigner'
import {
  saveDraftOrderAction, initDraftOrderFromStandingsAction, setReleasePhaseAction,
  startPresaisonDraftAction, advancePresaisonQueueAction, endPresaisonDraftAction,
  adjustPresaisonTimerAction, resetPresaisonTimerAction, resetPresaisonDraftAction,
} from '../admin/presaison/actions'
import type { PoolerCapInfo, DraftState } from '../admin/presaison/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

// Panneau admin rétractable (David, 2026-09-08) — porte l'ordre du repêchage, la phase de
// libération, le tour en cours et la Zone de test sur /repechage-agents-libres, pour que
// l'admin n'ait plus à jongler entre cette page et /admin/init?tab=presaison (qui reste
// fonctionnelle, inchangée, comme filet de sécurité). Réutilise les mêmes Server Actions —
// aucune logique métier dupliquée, juste une seconde surface d'affichage. Recharge la page
// après chaque action mutante plutôt que de synchroniser un état local, même patron que le
// reste de cette page (self-service, AutoReload).
export default function AdminPanel({
  saisonId, season, poolers, initialDraftOrder, draftState, nhlMinimumSalary,
}: {
  saisonId: number
  season: string
  poolers: PoolerCapInfo[]
  initialDraftOrder: string[]
  draftState: DraftState
  nhlMinimumSalary: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [draftOrder, setDraftOrder] = useState(initialDraftOrder)
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderMsg, setOrderMsg] = useState<string | null>(null)
  const [initializingOrder, setInitializingOrder] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startErr, setStartErr] = useState<string | null>(null)
  const [togglingReleasePhase, setTogglingReleasePhase] = useState(false)
  const [resettingDraft, setResettingDraft] = useState(false)
  const [resetDraftMsg, setResetDraftMsg] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  const isDraftActive = draftState.is_active
  const isDraftDone = !isDraftActive && draftState.ended_at != null
  const currentPoolerId = draftState.queue[0] ?? null
  const currentPooler = poolers.find(p => p.id === currentPoolerId) ?? null
  const nextPoolerName = draftState.queue[1] ? (poolers.find(p => p.id === draftState.queue[1])?.name ?? '?') : null
  const remainingSeconds = draftState.turn_started_at
    ? Math.max(0, draftState.turn_duration_seconds - Math.floor((now - new Date(draftState.turn_started_at).getTime()) / 1000))
    : null
  const eligibleCount = draftOrder.filter(id => {
    const p = poolers.find(pp => pp.id === id)
    return p !== undefined && p.capSpace >= nhlMinimumSalary
  }).length

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

  // try/catch partout ici : une exception inattendue (pas un simple {error} renvoyé) laissait
  // sinon le bouton figé indéfiniment sans aucun message (David, 2026-09-08, même bug repéré
  // côté self-service pooler dans AgentsLibresDashboard.tsx).
  const handleSetReleasePhase = async (open: boolean) => {
    setTogglingReleasePhase(true)
    try {
      await setReleasePhaseAction(saisonId, open)
      window.location.reload()
    } catch {
      setTogglingReleasePhase(false)
    }
  }

  const startDraft = async () => {
    setStarting(true)
    setStartErr(null)
    try {
      const result = await startPresaisonDraftAction(saisonId)
      if (result.error) { setStarting(false); setStartErr(result.error); return }
      window.location.reload()
    } catch {
      setStarting(false)
      setStartErr('Erreur inattendue — réessaie.')
    }
  }

  const handlePass = async () => {
    try {
      await advancePresaisonQueueAction(saisonId)
      window.location.reload()
    } catch { /* le tour reste affiché tel quel, l'admin peut réessayer */ }
  }
  const handleEndDraft = async () => {
    try {
      await endPresaisonDraftAction(saisonId)
      window.location.reload()
    } catch { /* rien à réinitialiser côté client, l'admin peut réessayer */ }
  }
  const handleTimerAdjust = async (delta: number) => {
    try {
      await adjustPresaisonTimerAction(saisonId, delta)
      window.location.reload()
    } catch { /* chrono inchangé, l'admin peut réessayer */ }
  }
  const handleTimerReset = async () => {
    try {
      await resetPresaisonTimerAction(saisonId)
      window.location.reload()
    } catch { /* chrono inchangé, l'admin peut réessayer */ }
  }
  const handleReset = async () => {
    if (!window.confirm('Réinitialiser le repêchage pré-saison ? Toutes les signatures seront annulées.')) return
    setResettingDraft(true)
    try {
      const res = await resetPresaisonDraftAction(saisonId)
      if (res.error) { setResettingDraft(false); setResetDraftMsg(`Erreur : ${res.error}`); return }
      window.location.reload()
    } catch {
      setResettingDraft(false)
      setResetDraftMsg('Erreur inattendue — réessaie.')
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden mb-6">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-blue-700 flex items-center gap-2">
          <span className="text-xs">{expanded ? '▾' : '▸'}</span> Panneau admin
          <span className="text-[10px] font-mono uppercase tracking-wide bg-white border border-blue-300 text-blue-600 rounded px-1.5 py-0.5">
            Admin seulement
          </span>
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          <div className={`rounded-lg p-4 flex items-center justify-between flex-wrap gap-3 ${draftState.release_phase_open ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-gray-200'}`}>
            <div>
              <p className="text-sm font-semibold text-gray-800">Phase de libération de joueurs</p>
              <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                {draftState.release_phase_open
                  ? 'Ouverte — les poolers peuvent libérer n’importe quel joueur signé. Ferme-la une fois tout le monde ajusté.'
                  : 'Fermée — seules les recrues de banque restent activables/libérables. Le repêchage peut démarrer.'}
              </p>
            </div>
            <button
              onClick={() => handleSetReleasePhase(!draftState.release_phase_open)}
              disabled={togglingReleasePhase}
              className={`text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-40 shrink-0 ${draftState.release_phase_open ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              {togglingReleasePhase ? '...' : draftState.release_phase_open ? 'Fermer la libération de joueurs' : 'Ouvrir la libération de joueurs'}
            </button>
          </div>

          {!isDraftActive && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-1">Ordre du repêchage</h3>
              {isDraftDone && (
                <p className="text-xs mb-3 rounded-lg px-2 py-1.5 bg-emerald-50 text-emerald-700">
                  ✓ Dernier repêchage terminé.
                </p>
              )}
              <p className="text-xs text-gray-400 mb-3">
                Seuil de participation : {fmt(nhlMinimumSalary)} d&apos;espace cap.
              </p>
              <button
                onClick={handleInitOrderFromStandings}
                disabled={initializingOrder}
                className="text-xs px-3 py-1.5 mb-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg disabled:opacity-40"
              >
                {initializingOrder ? 'Calcul...' : 'Initialiser à partir du classement précédent (inversé)'}
              </button>
              <DraftOrderEditor
                poolers={poolers}
                order={draftOrder}
                onChange={setDraftOrder}
                onSave={handleSaveOrder}
                saving={savingOrder}
              />
              {orderMsg && (
                <p className={`text-sm mt-2 ${orderMsg.startsWith('Erreur') ? 'text-red-600' : 'text-green-600'}`}>{orderMsg}</p>
              )}
              <div className="border-t pt-3 mt-3">
                <button
                  onClick={startDraft}
                  disabled={draftOrder.length === 0 || starting || draftState.release_phase_open}
                  className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm"
                >
                  {starting ? 'Démarrage...' : isDraftDone ? 'Relancer le repêchage' : 'Démarrer le repêchage'}
                </button>
                {draftState.release_phase_open && (
                  <p className="text-xs text-amber-600 mt-2">Ferme d&apos;abord la phase de libération de joueurs ci-dessus.</p>
                )}
                {draftOrder.length > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    {eligibleCount} pooler{eligibleCount > 1 ? 's' : ''} éligibles (≥ {fmt(nhlMinimumSalary)} d&apos;espace)
                  </p>
                )}
                {startErr && <p className="text-sm text-red-600 mt-2">{startErr}</p>}
              </div>
            </div>
          )}

          {isDraftActive && currentPooler && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-800 text-sm">
                    Tour de : <span className="text-blue-700">{currentPooler.name}</span>
                    {remainingSeconds !== null && (
                      <span className={`ml-2 text-xs font-mono align-middle ${remainingSeconds <= 10 ? 'text-red-600' : remainingSeconds <= 30 ? 'text-amber-600' : 'text-gray-400'}`}>
                        ⏱ {String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:{String(remainingSeconds % 60).padStart(2, '0')}
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button onClick={() => handleTimerAdjust(30)} className="text-xs text-gray-400 hover:text-gray-700 border rounded px-2 py-0.5">+30s</button>
                    <button onClick={handleTimerReset} className="text-xs text-gray-400 hover:text-gray-700 border rounded px-2 py-0.5">↺ Réinitialiser le chrono</button>
                  </div>
                </div>
                <button onClick={handleEndDraft} className="text-xs text-gray-400 hover:text-red-600 border rounded px-2 py-1">
                  Terminer le repêchage
                </button>
              </div>

              <FreeAgentSigner
                pooler={currentPooler}
                saisonId={saisonId}
                season={season}
                onSign={async () => { window.location.reload() }}
                threshold={nhlMinimumSalary}
              />

              <div className="border-t pt-3 mt-3">
                <button onClick={handlePass} className="text-sm text-gray-500 hover:text-gray-700 border rounded-lg px-4 py-2 hover:bg-gray-50">
                  Passer{nextPoolerName ? ` → ${nextPoolerName}` : ''}
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-red-200 pt-3">
            <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1.5">Zone de test</h3>
            <p className="text-xs text-gray-500 mb-2">
              Annule toutes les transactions de repêchage pré-saison et retire les agents libres signés des rosters.
            </p>
            <div className="flex items-center gap-3">
              <button
                disabled={resettingDraft}
                onClick={handleReset}
                className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm hover:bg-red-50 disabled:opacity-50"
              >
                {resettingDraft ? '...' : 'Réinitialiser le repêchage'}
              </button>
              {resetDraftMsg && <span className="text-xs text-red-700">{resetDraftMsg}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
