'use client'

import { useEffect, useState } from 'react'
import YourTurnPrompt from '@/components/YourTurnPrompt'
import { formatClock, remainingSeconds, type RookieTimer } from '@/lib/draftTimers'
import {
  adjustRookieTimerAction, pauseRookieTimerAction, resetRookieTimerAction,
  resumeRookieTimerAction, startRookieTimerAction, stopRookieTimerAction, getRookieTurnStateAction,
  confirmRookiePickAction, type RookieOnTheClock,
} from '../admin/repechage/actions'

export type OnTheClock = RookieOnTheClock

/**
 * Bandeau du tour du repêchage des recrues (David, 2026-10-02) — collé en haut de l'écran, sur
 * la page des poolers (/repechage-recrues) et la page admin (/admin/repechage, avec les
 * contrôles du chrono quand `adminSaisonId` est fourni). Le chrono est indicatif : rien ne se
 * passe à 00:00. Il repart à zéro dès qu'une sélection est enregistrée (voir
 * restartRookieTimerIfActive, admin/repechage/actions.ts).
 */
export default function RookieTurnBanner({
  onTheClock: initialOnTheClock, isMyTurn: initialIsMyTurn, showPrompt, timer: initialTimer, adminSaisonId, myPoolerId,
}: {
  onTheClock: OnTheClock | null
  isMyTurn: boolean
  showPrompt: boolean
  timer: RookieTimer
  adminSaisonId?: number
  myPoolerId?: string
}) {
  // Admin : le tableau garde ses sélections en état local et ne se recharge pas (voir
  // saveDraftProgressAction) — le bandeau relit donc lui-même le tour en cours toutes les 5 s, et
  // tout de suite quand le tableau signale une sélection enregistrée (`rookie-draft-changed`).
  const [live, setLive] = useState<{ onTheClock: OnTheClock | null; timer: RookieTimer; isMyTurn: boolean } | null>(null)
  useEffect(() => {
    if (adminSaisonId === undefined) return
    let cancelled = false
    const load = () => getRookieTurnStateAction(adminSaisonId).then(st => {
      if (cancelled) return
      setLive({
        onTheClock: st.onTheClock,
        timer: st.timer,
        isMyTurn: !!st.onTheClock && st.onTheClock.ownerId === myPoolerId,
      })
    }).catch(() => {})
    const id = setInterval(load, 5000)
    window.addEventListener('rookie-draft-changed', load)
    return () => { cancelled = true; clearInterval(id); window.removeEventListener('rookie-draft-changed', load) }
  }, [adminSaisonId, myPoolerId])
  const onTheClock = live ? live.onTheClock : initialOnTheClock
  const timer = live ? live.timer : initialTimer
  const isMyTurn = live ? live.isMyTurn : initialIsMyTurn

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!timer.active || !timer.startedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [timer.active, timer.startedAt])

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const run = async (action: () => Promise<{ error?: string }>) => {
    setBusy(true); setActionError(null)
    try {
      const result = await action()
      if (result.error) { setActionError(result.error); setBusy(false); return }
    } catch { /* l'état affiché reste celui d'avant ; le rechargement montre l'état réel */ }
    window.location.reload()
  }

  if (!onTheClock) return null
  const isPaused = timer.active && timer.startedAt === null
  const remaining = timer.active ? remainingSeconds(timer, now) : null
  const pickLabel = <>Ronde {onTheClock.round}{onTheClock.draftOrder != null && <>, choix {onTheClock.draftOrder}</>}</>
  const btn = 'text-xs text-gray-500 hover:text-gray-800 border rounded px-2 py-0.5 bg-white disabled:opacity-40'

  return (
    <>
      <div className={`sticky top-14 z-30 rounded-lg shadow-md px-5 py-3 mb-6 flex items-center justify-between flex-wrap gap-x-6 gap-y-2 border-2 ${
        isMyTurn ? 'bg-amber-400 border-amber-500' : 'bg-white border-blue-100'
      }`}>
        <div className="min-w-0">
          {isMyTurn ? (
            <p className="text-2xl font-extrabold text-amber-950">C&apos;est ton tour !</p>
          ) : (
            <p className="text-lg text-gray-700">Au tour de : <span className="font-bold text-blue-700">{onTheClock.ownerName}</span></p>
          )}
          <p className={`text-xs mt-1 ${isMyTurn ? 'text-amber-900' : 'text-gray-400'}`}>
            {pickLabel}
            {onTheClock.pendingPlayerName && <> · Sélection à confirmer : <span className="font-semibold">{onTheClock.pendingPlayerName}</span></>}
          </p>
          {/* Le tour ne change qu'à la confirmation par l'admin (David, 2026-10-02). */}
          {adminSaisonId !== undefined && onTheClock.pendingPlayerName && (
            <button
              disabled={busy}
              onClick={() => run(() => confirmRookiePickAction(adminSaisonId))}
              className="mt-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-4 py-1.5 disabled:opacity-40"
            >
              ✓ Confirmer : {onTheClock.pendingPlayerName}{onTheClock.nextOwnerName ? ` → passer à ${onTheClock.nextOwnerName}` : ' (dernier choix)'}
            </button>
          )}
          {actionError && <p className="mt-1 text-xs text-red-700">{actionError}</p>}
          {adminSaisonId !== undefined && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {!timer.active ? (
                <button
                  disabled={busy}
                  onClick={() => run(() => startRookieTimerAction(adminSaisonId))}
                  className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-1.5 disabled:opacity-40"
                  title="Lance le chrono du premier choix et avertit le pooler dont c'est le tour"
                >
                  ▶ Démarrer le repêchage
                </button>
              ) : (
                <>
                  <button disabled={busy} onClick={() => run(() => (isPaused ? resumeRookieTimerAction(adminSaisonId) : pauseRookieTimerAction(adminSaisonId)))} className={btn}>
                    {isPaused ? '▶ Reprendre' : '⏸ Pause'}
                  </button>
                  <button disabled={busy} onClick={() => run(() => adjustRookieTimerAction(adminSaisonId, -30))} className={btn}>-30s</button>
                  <button disabled={busy} onClick={() => run(() => adjustRookieTimerAction(adminSaisonId, 30))} className={btn}>+30s</button>
                  <button disabled={busy} onClick={() => run(() => resetRookieTimerAction(adminSaisonId))} className={btn}>↺ Réinitialiser le chrono</button>
                  <button disabled={busy} onClick={() => run(() => stopRookieTimerAction(adminSaisonId))} className={btn} title="Cache le chrono ; le repêchage continue">■ Arrêter le chrono</button>
                </>
              )}
            </div>
          )}
        </div>
        {timer.active && (
          <div className="shrink-0 text-right">
            {isPaused ? (
              <p className={`text-3xl font-bold ${isMyTurn ? 'text-amber-950' : 'text-amber-600'}`}>⏸ En pause</p>
            ) : remaining !== null && (
              <p className={`text-5xl font-mono font-bold tabular-nums leading-none ${
                isMyTurn
                  ? (remaining <= 10 ? 'text-red-700' : 'text-amber-950')
                  : remaining <= 10 ? 'text-red-600' : remaining <= 30 ? 'text-amber-600' : 'text-gray-700'
              }`}>
                {formatClock(remaining)}
              </p>
            )}
          </div>
        )}
      </div>

      {isMyTurn && showPrompt && (
        <YourTurnPrompt turnKey={`recrues:${onTheClock.pickId}`}>
          <p>{pickLabel} : dis à l&apos;admin quelle recrue tu repêches.</p>
          {timer.active && !isPaused && remaining !== null && (
            <p className="mt-2 text-4xl font-mono font-bold tabular-nums text-gray-900">{formatClock(remaining)}</p>
          )}
        </YourTurnPrompt>
      )}
    </>
  )
}
