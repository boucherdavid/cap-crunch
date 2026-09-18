'use client'

import { useEffect, useState } from 'react'
import DraftOrderEditor from '../admin/presaison/DraftOrderEditor'
import {
  saveDraftOrderAction, initDraftOrderFromStandingsAction, setReleasePhaseAction,
  startPresaisonDraftAction, resetPresaisonDraftAction, setPassModeAction,
  removePoolerFromQueueAction,
} from '../admin/presaison/actions'
import type { PoolerCapInfo, DraftState } from '../admin/presaison/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

// Panneau admin rétractable (David, 2026-09-08, réorganisé en colonne de gauche le 2026-09-18)
// — porte l'ordre du repêchage, la phase de libération, la file d'attente et la Zone de test
// sur /repechage-agents-libres, pour que l'admin n'ait plus à jongler entre cette page et
// /admin/init?tab=presaison (qui reste fonctionnelle, inchangée, comme filet de sécurité).
// Le tour en cours (signature/Passer/chrono) a été extrait dans TourEnCoursPanel.tsx (David,
// 2026-09-18) pour rester visible en haut de page sans avoir à déplier ce panneau — ce
// panneau-ci ne garde que les réglages/actions moins fréquentes. Réutilise les mêmes Server
// Actions — aucune logique métier dupliquée, juste une seconde surface d'affichage. Recharge
// la page après chaque action mutante plutôt que de synchroniser un état local, même patron
// que le reste de cette page (self-service, AutoReload).
export default function AdminPanel({
  saisonId, poolers, initialDraftOrder, draftState, nhlMinimumSalary, onSelectionChange,
}: {
  saisonId: number
  poolers: PoolerCapInfo[]
  initialDraftOrder: string[]
  draftState: DraftState
  nhlMinimumSalary: number
  onSelectionChange?: (active: boolean) => void
}) {
  // Replié par défaut, sauf si un tour est déjà en cours au chargement (David, 2026-09-08) —
  // sinon l'admin ne voit pas où entrer la signature d'un agent libre pour le pooler courant.
  // Persisté via localStorage (David, 2026-09-10) — AutoReload fait un rechargement complet à
  // intervalle régulier, qui remettait "expanded" à draftState.is_active à chaque fois, rouvrant
  // le panneau même après une fermeture manuelle. Une fois un choix explicite fait, il prime sur
  // le défaut automatique ; sans choix stocké (première visite), le défaut d'origine s'applique.
  const expandedKey = `al-admin-panel-expanded-${saisonId}`
  const [expanded, setExpandedState] = useState(() => {
    if (typeof window === 'undefined') return draftState.is_active
    try {
      const stored = localStorage.getItem(expandedKey)
      return stored === null ? draftState.is_active : stored === '1'
    } catch { return draftState.is_active }
  })
  const setExpanded = (next: boolean | ((v: boolean) => boolean)) => {
    setExpandedState(prev => {
      const value = typeof next === 'function' ? next(prev) : next
      try { localStorage.setItem(expandedKey, value ? '1' : '0') } catch { /* stockage indisponible — pas grave */ }
      return value
    })
  }
  const [draftOrder, setDraftOrder] = useState(initialDraftOrder)
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderMsg, setOrderMsg] = useState<string | null>(null)
  const [initializingOrder, setInitializingOrder] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startErr, setStartErr] = useState<string | null>(null)
  const [togglingReleasePhase, setTogglingReleasePhase] = useState(false)
  const [resettingDraft, setResettingDraft] = useState(false)
  const [resetDraftMsg, setResetDraftMsg] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removeErr, setRemoveErr] = useState<string | null>(null)
  const [togglingPassMode, setTogglingPassMode] = useState(false)

  // Signale au parent (AgentsLibresDashboard) qu'un ordre de repêchage réordonné localement pas
  // encore sauvegardé devrait mettre AutoReload en pause (David, 2026-09-10) — un rechargement
  // en plein milieu perdrait le travail non soumis, sans message d'erreur. La sélection d'un
  // agent libre pas encore signé a sa propre pause, gérée par TourEnCoursPanel.tsx depuis le
  // 2026-09-18 (extrait de ce panneau).
  const orderDirty = JSON.stringify(draftOrder) !== JSON.stringify(initialDraftOrder)
  useEffect(() => {
    onSelectionChange?.(orderDirty)
    return () => onSelectionChange?.(false)
  }, [orderDirty, onSelectionChange])

  const isDraftActive = draftState.is_active
  const isDraftDone = !isDraftActive && draftState.ended_at != null
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

  // Comportement de "Passer" (David, 2026-09-08) — choisi avant de démarrer le repêchage,
  // voir advancePresaisonQueueAction (TourEnCoursPanel.tsx) pour l'effet réel.
  const handleSetPassMode = async (skipOne: boolean) => {
    setTogglingPassMode(true)
    try {
      await setPassModeAction(saisonId, skipOne)
      window.location.reload()
    } catch {
      setTogglingPassMode(false)
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

  // Retirer un pooler de la file pour de bon (David, 2026-09-18) — distinct de "Passer" : utile
  // quand un pooler a déjà un alignement complet (12A/6D/2G + min. 2 rés.) et n'a pas besoin de
  // dépenser plus de cap, ou n'est pas connecté pour se retirer lui-même (voir
  // leaveDraftQueueAction côté pooler, même mécanique).
  const handleRemoveFromQueue = async (poolerId: string, poolerName: string) => {
    if (!window.confirm(`Retirer ${poolerName} de la file du repêchage ? Il ne sera plus rappelé pour signer, même s'il reste de l'espace cap.`)) return
    setRemovingId(poolerId); setRemoveErr(null)
    try {
      const result = await removePoolerFromQueueAction(saisonId, poolerId)
      if (result.error) { setRemovingId(null); setRemoveErr(result.error) } else { window.location.reload() }
    } catch {
      setRemovingId(null); setRemoveErr('Erreur inattendue — réessaie.')
    }
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
    <div className="bg-blue-50 border border-blue-200 rounded-lg mb-6">
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
          <div className={`rounded-lg p-4 flex flex-col gap-3 ${draftState.release_phase_open ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-gray-200'}`}>
            <div>
              <p className="text-sm font-semibold text-gray-800">Phase de libération de joueurs</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {draftState.release_phase_open
                  ? 'Ouverte — les poolers peuvent libérer n’importe quel joueur signé. Ferme-la une fois tout le monde ajusté.'
                  : 'Fermée — seules les recrues de banque restent activables/libérables. Le repêchage peut démarrer.'}
              </p>
            </div>
            <button
              onClick={() => handleSetReleasePhase(!draftState.release_phase_open)}
              disabled={togglingReleasePhase}
              className={`text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-40 ${draftState.release_phase_open ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
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

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
                <p className="text-xs font-semibold text-gray-700 mb-1.5">Comportement de &laquo; Passer &raquo;</p>
                <div className="space-y-1.5">
                  <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="radio"
                      checked={!draftState.pass_skip_one}
                      disabled={togglingPassMode}
                      onChange={() => handleSetPassMode(false)}
                      className="mt-0.5"
                    />
                    <span><strong>Retour en fin de file</strong> (défaut) — le pooler attend que tout le monde ait joué avant de rejouer.</span>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="radio"
                      checked={draftState.pass_skip_one}
                      disabled={togglingPassMode}
                      onChange={() => handleSetPassMode(true)}
                      className="mt-0.5"
                    />
                    <span><strong>Repasse juste après le suivant</strong> — sans attendre tout le monde. Ne s&apos;applique jamais à une signature réussie.</span>
                  </label>
                </div>
              </div>

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

          {isDraftActive && draftState.queue.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                File d&apos;attente — retirer un pooler qui n&apos;a plus besoin de jouer
              </p>
              <div className="space-y-1">
                {draftState.queue.map((id, idx) => {
                  const p = poolers.find(pp => pp.id === id)
                  return (
                    <div key={id} className="flex items-center justify-between text-xs text-gray-600 py-0.5">
                      <span>{idx === 0 ? <strong className="text-blue-700">{p?.name ?? id}</strong> : p?.name ?? id}</span>
                      <button
                        onClick={() => handleRemoveFromQueue(id, p?.name ?? id)}
                        disabled={removingId === id}
                        className="text-[10px] px-1.5 py-0.5 border rounded text-gray-400 hover:text-red-600 hover:border-red-300 disabled:opacity-40"
                      >
                        {removingId === id ? '...' : 'Retirer'}
                      </button>
                    </div>
                  )
                })}
              </div>
              {removeErr && <p className="text-xs text-red-600 mt-1.5">{removeErr}</p>}
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
