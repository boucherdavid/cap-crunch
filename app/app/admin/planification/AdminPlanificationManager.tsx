'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  createPollAction,
  addCandidateDateAction,
  removeCandidateDateAction,
  resetPollAction,
  setNavPlanificationOnlyAction,
} from '@/app/planification/actions'

type Poll = { id: number; title: string } | null
type CandidateDate = { id: number; candidate_date: string }

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-CA', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

function currentSeasonMeetingTitle() {
  const year = new Date().getFullYear()
  return `Rencontre annuelle ${year}`
}

export default function AdminPlanificationManager({
  poll, dates, navPlanificationOnly,
}: {
  poll: Poll
  dates: CandidateDate[]
  navPlanificationOnly: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [newTitle, setNewTitle] = useState(currentSeasonMeetingTitle())
  const [newDate, setNewDate] = useState('')
  const [navOnly, setNavOnly] = useState(navPlanificationOnly)

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
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

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Planification — Admin</h1>
        <Link href="/planification" className="text-sm text-blue-600 hover:text-blue-800">
          Voir la page publique →
        </Link>
      </div>

      {message && (
        <p className={`text-sm font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

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

      {!poll && (
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

      {poll && (
        <div className="bg-white rounded-lg shadow p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 text-sm">
              Gérer les dates proposées — <span className="font-normal text-gray-400">{poll.title}</span>
            </h2>
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

          {dates.length > 0 ? (
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
          ) : (
            <p className="text-gray-400 text-sm">Aucune date proposée pour l&apos;instant.</p>
          )}
        </div>
      )}
    </div>
  )
}
