'use client'

import { useMemo, useState } from 'react'
import {
  createPollAction,
  addCandidateDateAction,
  removeCandidateDateAction,
  resetPollAction,
  submitAvailabilityAction,
  setNavPlanificationOnlyAction,
} from './actions'

type Me = { id: string; name: string; isAdmin: boolean }
type Pooler = { id: string; name: string }
type Poll = { id: number; title: string } | null
type CandidateDate = { id: number; candidate_date: string }
type Response = { pooler_id: string; candidate_date: string }

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-CA', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

function currentSeasonMeetingTitle() {
  const year = new Date().getFullYear()
  return `Rencontre annuelle ${year}`
}

export default function PlanificationManager({
  me, poolers, poll, dates, responses, navPlanificationOnly,
}: {
  me: Me
  poolers: Pooler[]
  poll: Poll
  dates: CandidateDate[]
  responses: Response[]
  navPlanificationOnly: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [newTitle, setNewTitle] = useState(currentSeasonMeetingTitle())
  const [newDate, setNewDate] = useState('')
  const [navOnly, setNavOnly] = useState(navPlanificationOnly)

  const myInitialDates = useMemo(
    () => new Set(responses.filter(r => r.pooler_id === me.id).map(r => r.candidate_date)),
    [responses, me.id],
  )
  const [selected, setSelected] = useState<Set<string>>(myInitialDates)

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const toggleDate = (date: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const result = await createPollAction(newTitle.trim())
    setLoading(false)
    if (result.error) showMsg('error', result.error)
  }

  const handleAddDate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!poll || !newDate) return
    setLoading(true)
    const result = await addCandidateDateAction(poll.id, newDate)
    setLoading(false)
    if (result.error) showMsg('error', result.error)
    else setNewDate('')
  }

  const handleRemoveDate = async (d: CandidateDate) => {
    if (!poll) return
    setLoading(true)
    const result = await removeCandidateDateAction(d.id, poll.id, d.candidate_date)
    setLoading(false)
    if (result.error) showMsg('error', result.error)
  }

  const handleReset = async () => {
    if (!poll) return
    if (!window.confirm(`Réinitialiser « ${poll.title} » ? Les dates et réponses de tous les poolers seront supprimées.`)) return
    setLoading(true)
    const result = await resetPollAction(poll.id)
    setLoading(false)
    if (result.error) showMsg('error', result.error)
  }

  const handleToggleNavOnly = async () => {
    const next = !navOnly
    setNavOnly(next)
    const result = await setNavPlanificationOnlyAction(next)
    if (result.error) {
      setNavOnly(!next)
      showMsg('error', result.error)
    }
  }

  const handleSubmit = async () => {
    if (!poll) return
    setLoading(true)
    const result = await submitAvailabilityAction(poll.id, Array.from(selected))
    setLoading(false)
    if (result.error) showMsg('error', result.error)
    else showMsg('success', 'Tes disponibilités ont été enregistrées.')
  }

  // Compte par date, pour repérer la ou les meilleures dates dans le résumé
  const countByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of responses) m.set(r.candidate_date, (m.get(r.candidate_date) ?? 0) + 1)
    return m
  }, [responses])
  const maxCount = dates.length > 0 ? Math.max(0, ...dates.map(d => countByDate.get(d.candidate_date) ?? 0)) : 0

  const respondedPoolerIds = useMemo(() => new Set(responses.map(r => r.pooler_id)), [responses])

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Planification</h1>
        <p className="text-gray-500 text-sm">
          {poll ? poll.title : 'Trouver une date pour la rencontre annuelle du pool.'}
        </p>
      </div>

      {me.isAdmin && (
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Mode avant-première</p>
            <p className="text-xs text-gray-400">
              Masque le reste de la navbar pour tous les poolers — ils ne voient que
              « Planification ». À désactiver une fois la rencontre planifiée.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleNavOnly}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${navOnly ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${navOnly ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      )}

      {message && (
        <p className={`text-sm font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {!poll && !me.isAdmin && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400 text-sm">
          Aucun sondage actif pour le moment.
        </div>
      )}

      {!poll && me.isAdmin && (
        <form onSubmit={handleCreatePoll} className="bg-white rounded-lg shadow p-5 space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm">Créer un sondage</h2>
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Titre (ex: Rencontre annuelle 2026)"
            required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            Créer
          </button>
        </form>
      )}

      {poll && me.isAdmin && (
        <div className="bg-white rounded-lg shadow p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 text-sm">Gérer les dates proposées</h2>
            <button
              onClick={handleReset}
              disabled={loading}
              className="text-xs text-red-400 hover:text-red-600 font-medium disabled:opacity-40"
            >
              Réinitialiser le sondage
            </button>
          </div>

          <form onSubmit={handleAddDate} className="flex gap-2">
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              required
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40"
            >
              Ajouter
            </button>
          </form>

          {dates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {dates.map(d => (
                <span key={d.id} className="inline-flex items-center gap-1.5 bg-gray-50 border rounded-lg px-2.5 py-1 text-xs text-gray-700">
                  {fmtDate(d.candidate_date)}
                  <button
                    onClick={() => handleRemoveDate(d)}
                    disabled={loading}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-40"
                    title="Retirer cette date"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {poll && dates.length === 0 && !me.isAdmin && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400 text-sm">
          L&apos;admin n&apos;a pas encore proposé de dates.
        </div>
      )}

      {poll && dates.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5 space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm">Mes disponibilités</h2>
          <div className="space-y-1.5">
            {dates.map(d => (
              <label key={d.id} className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(d.candidate_date)}
                  onChange={() => toggleDate(d.candidate_date)}
                  className="w-4 h-4"
                />
                {fmtDate(d.candidate_date)}
              </label>
            ))}
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-40"
          >
            Enregistrer mes disponibilités
          </button>
        </div>
      )}

      {poll && dates.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="font-semibold text-gray-700 text-sm mb-3">Résumé</h2>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left pr-4 pb-2 text-gray-400 font-medium">Pooler</th>
                  {dates.map(d => (
                    <th
                      key={d.id}
                      className={`px-2 pb-2 text-center font-medium whitespace-nowrap ${
                        (countByDate.get(d.candidate_date) ?? 0) === maxCount && maxCount > 0 ? 'text-emerald-600' : 'text-gray-400'
                      }`}
                    >
                      {fmtDate(d.candidate_date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {poolers.map(p => (
                  <tr key={p.id} className="border-t">
                    <td className="pr-4 py-1.5 text-gray-700 whitespace-nowrap">
                      {p.name}
                      {!respondedPoolerIds.has(p.id) && (
                        <span className="ml-1.5 text-xs text-gray-300">(en attente)</span>
                      )}
                    </td>
                    {dates.map(d => {
                      const avail = responses.some(r => r.pooler_id === p.id && r.candidate_date === d.candidate_date)
                      return (
                        <td key={d.id} className="px-2 py-1.5 text-center">
                          {avail ? <span className="text-emerald-600">✓</span> : <span className="text-gray-200">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="pr-4 py-1.5 text-gray-500">Total</td>
                  {dates.map(d => {
                    const count = countByDate.get(d.candidate_date) ?? 0
                    return (
                      <td key={d.id} className={`px-2 py-1.5 text-center ${count === maxCount && maxCount > 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                        {count}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
