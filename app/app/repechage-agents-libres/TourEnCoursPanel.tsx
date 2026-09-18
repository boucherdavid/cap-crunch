'use client'

import FreeAgentSigner from '../admin/presaison/FreeAgentSigner'
import {
  advancePresaisonQueueAction, endPresaisonDraftAction,
  adjustPresaisonTimerAction, resetPresaisonTimerAction,
  pausePresaisonTimerAction, resumePresaisonTimerAction,
} from '../admin/presaison/actions'
import type { PoolerCapInfo, DraftState } from '../admin/presaison/types'

// Widget "Signature en cours" (David, 2026-09-18) — extrait du Panneau admin (déplacé en
// colonne de gauche, voir AdminPanel.tsx) pour rester visible en haut de page pendant un tour
// actif, sans avoir à déplier tout le panneau juste pour signer. Mêmes Server Actions, aucune
// logique dupliquée — seul le tour en cours (Signer/Passer/chrono) vit ici ; la file d'attente
// complète (retirer un pooler) reste dans le Panneau admin.
export default function TourEnCoursPanel({
  saisonId, season, poolers, draftState, nhlMinimumSalary, now, onSelectionChange,
}: {
  saisonId: number
  season: string
  poolers: PoolerCapInfo[]
  draftState: DraftState
  nhlMinimumSalary: number
  now: number
  onSelectionChange?: (active: boolean) => void
}) {
  const currentPoolerId = draftState.queue[0] ?? null
  const currentPooler = poolers.find(p => p.id === currentPoolerId) ?? null
  const nextPoolerName = draftState.queue[1] ? (poolers.find(p => p.id === draftState.queue[1])?.name ?? '?') : null
  // turn_started_at=null pendant que is_active=true = chrono en pause — turn_duration_seconds
  // tient alors le nombre de secondes gelées au moment de la pause (pausePresaisonTimerAction).
  const isPaused = draftState.is_active && draftState.turn_started_at === null
  const remainingSeconds = draftState.turn_started_at
    ? Math.max(0, draftState.turn_duration_seconds - Math.floor((now - new Date(draftState.turn_started_at).getTime()) / 1000))
    : isPaused ? draftState.turn_duration_seconds : null

  const handlePass = async () => {
    try {
      await advancePresaisonQueueAction(saisonId, true)
      window.location.reload()
    } catch { /* le tour reste affiché tel quel, l'admin peut réessayer */ }
  }
  // isPass=false : une signature va toujours en fin de file.
  const handleSignAdvance = async () => {
    try {
      await advancePresaisonQueueAction(saisonId, false)
    } catch { /* la signature a déjà eu lieu ; on recharge quand même pour refléter l'état réel */ }
    window.location.reload()
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
  const handlePauseToggle = async () => {
    try {
      if (isPaused) await resumePresaisonTimerAction(saisonId)
      else await pausePresaisonTimerAction(saisonId)
      window.location.reload()
    } catch { /* chrono inchangé, l'admin peut réessayer */ }
  }

  if (!draftState.is_active || !currentPooler) return null

  // Pas de overflow-hidden sur le conteneur (David, 2026-09-10) — coupait le dropdown flottant
  // de FreeAgentSigner ; aucun enfant ici n'a besoin d'être clippé aux coins arrondis.
  return (
    <div className="bg-white rounded-lg shadow border border-blue-200 p-4 mb-6">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-gray-800 text-sm">
            Tour de : <span className="text-blue-700">{currentPooler.name}</span>
            {isPaused && <span className="ml-2 text-xs font-medium align-middle text-amber-600">⏸ En pause</span>}
            {remainingSeconds !== null && !isPaused && (
              <span className={`ml-2 text-xs font-mono align-middle ${remainingSeconds <= 10 ? 'text-red-600' : remainingSeconds <= 30 ? 'text-amber-600' : 'text-gray-400'}`}>
                ⏱ {String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:{String(remainingSeconds % 60).padStart(2, '0')}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2 mt-1.5">
            <button onClick={handlePauseToggle} className="text-xs text-gray-400 hover:text-gray-700 border rounded px-2 py-0.5">
              {isPaused ? '▶ Reprendre' : '⏸ Pause'}
            </button>
            <button onClick={() => handleTimerAdjust(-30)} className="text-xs text-gray-400 hover:text-gray-700 border rounded px-2 py-0.5">-30s</button>
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
        onSign={handleSignAdvance}
        threshold={nhlMinimumSalary}
        onSelectionChange={onSelectionChange}
      />

      <div className="border-t pt-3 mt-3">
        <button onClick={handlePass} className="text-sm text-gray-500 hover:text-gray-700 border rounded-lg px-4 py-2 hover:bg-gray-50">
          Passer{nextPoolerName ? ` → ${nextPoolerName}` : ''}
        </button>
      </div>
    </div>
  )
}
