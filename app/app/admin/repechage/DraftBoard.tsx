'use client'

import { useMemo, useState } from 'react'
import { submitDraftAction, rollbackPickAction, saveDraftProgressAction } from './actions'
import RookieSelect from './RookieSelect'

const DASH = '\u2014'

type Pooler = { id: string; name: string }
type Pick = {
  id: number
  round: number
  draft_order: number | null
  pending_player_id?: number | null
  current_owner: Pooler
  original_owner: Pooler
}
type Rookie = {
  id: number
  first_name: string
  last_name: string
  position: string | null
  teams: { code: string } | null
  draft_year: number | null
  draft_round: number | null
  draft_overall: number | null
  status: string | null
}

export default function DraftBoard({
  picks,
  usedPicks,
  rookies,
  playerByPickId,
  saisonId,
  poolDraftYear,
  readOnly = false,
}: {
  picks: Pick[]
  usedPicks: Pick[]
  rookies: Rookie[]
  playerByPickId: Record<number, any>
  saisonId: number
  poolDraftYear: number
  readOnly?: boolean
}) {
  const [selections, setSelections] = useState<Record<number, number | null>>(() =>
    Object.fromEntries(picks.map(p => [p.id, p.pending_player_id ?? null]))
  )
  const rookieById = useMemo(() => new Map(rookies.map(r => [r.id, r])), [rookies])
  const [submitting, setSubmitting] = useState(false)
  const [savingProgress, setSavingProgress] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [submittedPickIds, setSubmittedPickIds] = useState<Set<number>>(new Set())
  const [rollingBack, setRollingBack] = useState<number | null>(null)
  const [rolledBackPickIds, setRolledBackPickIds] = useState<Set<number>>(new Set())
  const [savingPickIds, setSavingPickIds] = useState<Set<number>>(new Set())

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage(text)
    setMessageType(type)
    setTimeout(() => setMessage(''), 5000)
  }

  // Sauvegarde immédiate à chaque sélection — les poolers suivent le repêchage en direct
  // (vue lecture seule) sans attendre le clic sur "Sauvegarder", qui reste un filet de
  // sécurité en cas d'échec réseau ponctuel.
  const handlePickChange = async (pickId: number, playerId: number | null) => {
    setSelections(prev => ({ ...prev, [pickId]: playerId }))
    setSavingPickIds(prev => new Set([...prev, pickId]))
    const result = await saveDraftProgressAction(saisonId, [{ pickId, playerId }])
    setSavingPickIds(prev => {
      const next = new Set(prev)
      next.delete(pickId)
      return next
    })
    if (result.error) showMessage(result.error, 'error')
  }

  const handleRollback = async (pickId: number) => {
    if (!window.confirm('Annuler ce choix ? La recrue sera retirée de la banque et le pick redeviendra disponible.')) return
    setRollingBack(pickId)
    const result = await rollbackPickAction(pickId)
    if (result.error) {
      showMessage(result.error, 'error')
    } else {
      setRolledBackPickIds(prev => new Set([...prev, pickId]))
      showMessage('Choix annulé.', 'success')
    }
    setRollingBack(null)
  }

  const allPicks = useMemo(() => [...picks, ...usedPicks], [picks, usedPicks])

  const sortByOrder = (a: Pick, b: Pick) => {
    const oa = a.draft_order ?? 999
    const ob = b.draft_order ?? 999
    return oa - ob
  }

  const rounds = useMemo(() => {
    const roundNums = Array.from(new Set(allPicks.map(p => p.round))).sort((a, b) => a - b)
    return roundNums.map(r => ({
      round: r,
      pending: picks.filter(p => p.round === r).sort(sortByOrder),
      used: usedPicks.filter(p => p.round === r).sort(sortByOrder),
    }))
  }, [allPicks, picks, usedPicks])

  const selectedPlayerIds = useMemo(() =>
    new Set(Object.values(selections).filter((id): id is number => id !== null)),
  [selections])

  const pendingSelections = useMemo(() =>
    Object.entries(selections)
      .filter(([pickId, playerId]) => playerId !== null && !submittedPickIds.has(Number(pickId)))
      .map(([pickId, playerId]) => ({ pick_id: Number(pickId), player_id: playerId as number })),
  [selections, submittedPickIds])

  const handleSubmit = async () => {
    if (pendingSelections.length === 0) {
      showMessage('Aucun choix rempli.', 'error')
      return
    }
    setSubmitting(true)
    const result = await submitDraftAction(saisonId, poolDraftYear, pendingSelections)
    if (result.error) {
      showMessage(result.error, 'error')
    } else {
      const submitted = new Set([...submittedPickIds, ...pendingSelections.map(s => s.pick_id)])
      setSubmittedPickIds(submitted)
      showMessage(`${pendingSelections.length} choix soumis avec succès.`, 'success')
    }
    setSubmitting(false)
  }

  const handleSaveProgress = async () => {
    setSavingProgress(true)
    const entries = picks
      .filter(p => !submittedPickIds.has(p.id))
      .map(p => ({ pickId: p.id, playerId: selections[p.id] ?? null }))
    const result = await saveDraftProgressAction(saisonId, entries)
    if (result.error) {
      showMessage(result.error, 'error')
    } else {
      showMessage('Choix sauvegardés.', 'success')
    }
    setSavingProgress(false)
  }

  const totalPicks = picks.length + usedPicks.length
  const doneCount = usedPicks.length + submittedPickIds.size

  const poolerSummary = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; done: number; order: number }>()
    for (const pick of allPicks) {
      const owner = pick.current_owner
      const entry = map.get(owner.id) ?? { id: owner.id, name: owner.name, total: 0, done: 0, order: pick.draft_order ?? 999 }
      entry.total += 1
      const isDone = usedPicks.includes(pick) || submittedPickIds.has(pick.id)
      if (isDone) entry.done += 1
      entry.order = Math.min(entry.order, pick.draft_order ?? 999)
      map.set(owner.id, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fr-CA'))
  }, [allPicks, usedPicks, submittedPickIds])

  return (
    <div className="space-y-6">
      {/* Barre de progression */}
      <div className="bg-white rounded-lg shadow px-5 py-4 flex items-center gap-6">
        <div className="flex-1">
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium text-gray-700">Progression du repêchage {poolDraftYear}</span>
            <span className="text-gray-500">{doneCount} / {totalPicks} choix effectués</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-green-500 transition-all"
              style={{ width: totalPicks > 0 ? `${(doneCount / totalPicks) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>

      {/* Résumé par pooler */}
      <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b text-left">
              <th className="px-4 py-2 font-medium text-gray-600">Pooler</th>
              <th className="px-4 py-2 font-medium text-gray-600 text-center">Faits</th>
              <th className="px-4 py-2 font-medium text-gray-600 text-center">Restants</th>
              <th className="px-4 py-2 font-medium text-gray-600 text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {poolerSummary.map(p => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-2 font-medium text-gray-800">{p.name}</td>
                <td className="px-4 py-2 text-center text-gray-700">{p.done}</td>
                <td className="px-4 py-2 text-center text-gray-700">{p.total - p.done}</td>
                <td className="px-4 py-2 text-center text-gray-500">{p.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rounds.map(({ round, pending, used }) => {
        const activePending = pending.filter(p => !submittedPickIds.has(p.id))
        const justSubmitted = pending.filter(p => submittedPickIds.has(p.id))
        const allUsed = [...used, ...justSubmitted]

        return (
          <div key={round} className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-slate-700 px-5 py-3 flex items-center justify-between">
              <h2 className="text-white font-semibold">Ronde {round}</h2>
              <span className="text-slate-300 text-xs">
                {allUsed.length} / {pending.length + used.length} effectués
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-left">
                  <th className="px-4 py-2 font-medium text-gray-600 w-8 text-center">#</th>
                  <th className="px-4 py-2 font-medium text-gray-600 w-48">Pooler</th>
                  <th className="px-4 py-2 font-medium text-gray-600 w-44">Choix d'origine</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Recrue sélectionnée</th>
                </tr>
              </thead>
              <tbody>
                {/* Picks déjà soumis en lecture seule */}
                {allUsed.map(pick => {
                  const isOwn = pick.current_owner.id === pick.original_owner.id
                  const chosen = playerByPickId[pick.id]
                  return (
                    <tr key={pick.id} className="border-b last:border-0 bg-green-50">
                      <td className="px-4 py-3 text-center text-xs text-gray-400">{pick.draft_order ?? DASH}</td>
                      <td className="px-4 py-3 font-medium text-gray-700">{pick.current_owner.name}</td>
                      <td className="px-4 py-3">
                        {isOwn
                          ? <span className="text-xs text-gray-400">Propre</span>
                          : <span className="text-xs text-amber-600">De: {pick.original_owner.name}</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <span className="flex items-center gap-2">
                          <span className="text-green-600 font-bold text-xs">✓</span>
                          {chosen
                            ? <>
                                {chosen.last_name}, {chosen.first_name}
                                <span className="text-gray-400 text-xs">{chosen.position} {chosen.teams?.code ?? ''}</span>
                              </>
                            : <span className="text-gray-400 text-xs">Soumis</span>
                          }
                          {!readOnly && !rolledBackPickIds.has(pick.id) && (
                            <button
                              onClick={() => handleRollback(pick.id)}
                              disabled={rollingBack === pick.id}
                              className="ml-2 text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
                              title="Annuler ce choix"
                            >
                              {rollingBack === pick.id ? '...' : 'Annuler'}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}

                {/* Picks en attente */}
                {activePending.map(pick => {
                  const isOwn = pick.current_owner.id === pick.original_owner.id
                  const selectedId = selections[pick.id] ?? null

                  return (
                    <tr key={pick.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-center text-xs text-gray-400">{pick.draft_order ?? DASH}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{pick.current_owner.name}</td>
                      <td className="px-4 py-3">
                        {isOwn
                          ? <span className="text-xs text-gray-400">Propre</span>
                          : <span className="text-xs text-amber-600">De: {pick.original_owner.name}</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {readOnly
                          ? (selectedId != null
                              ? <span className="text-xs text-amber-600 italic flex items-center gap-1.5">
                                  <span className="text-amber-500">●</span>
                                  {(() => {
                                    const p = rookieById.get(selectedId)
                                    return p ? `${p.last_name}, ${p.first_name} ${p.position ?? ''}` : 'Choix en cours'
                                  })()}
                                  <span className="text-gray-400">(non confirmé)</span>
                                </span>
                              : <span className="text-xs text-gray-400 italic">En attente</span>)
                          : <span className="flex items-center gap-2">
                              <RookieSelect
                                rookies={rookies}
                                value={selectedId}
                                excludeIds={selectedPlayerIds}
                                onChange={playerId => handlePickChange(pick.id, playerId)}
                              />
                              {savingPickIds.has(pick.id) && (
                                <span className="text-xs text-gray-400 shrink-0">Sauvegarde...</span>
                              )}
                            </span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      {/* Barre de soumission — admin seulement */}
      {!readOnly && <div className="flex items-center justify-between bg-white rounded-lg shadow px-5 py-4">
        <div className="text-sm text-gray-500">
          {picks.filter(p => !submittedPickIds.has(p.id)).length > 0
            ? `${pendingSelections.length} / ${picks.filter(p => !submittedPickIds.has(p.id)).length} choix restants remplis`
            : <span className="text-green-600 font-medium">Tous les choix ont été soumis ✓</span>
          }
        </div>
        <div className="flex items-center gap-4">
          {message && (
            <span className={`text-sm font-medium ${messageType === 'error' ? 'text-red-600' : 'text-green-600'}`}>
              {message}
            </span>
          )}
          {picks.filter(p => !submittedPickIds.has(p.id)).length > 0 && (
            <>
              <button
                onClick={handleSaveProgress}
                disabled={savingProgress}
                className="px-5 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Chaque choix se sauvegarde déjà automatiquement — ce bouton relance une sauvegarde groupée en cas d'échec réseau ponctuel"
              >
                {savingProgress ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || pendingSelections.length === 0}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Soumission...' : `Soumettre${pendingSelections.length > 0 ? ` (${pendingSelections.length})` : ''}`}
              </button>
            </>
          )}
        </div>
      </div>}
    </div>
  )
}
