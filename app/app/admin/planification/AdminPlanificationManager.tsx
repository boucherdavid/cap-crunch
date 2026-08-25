'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  createPollAction,
  addCandidateDatesAction,
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

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function toISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const startWeekday = (first.getDay() + 6) % 7 // lundi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  return cells
}

function CalendarPicker({
  savedDates, pendingDates, onToggle,
}: {
  savedDates: Set<string>
  pendingDates: Set<string>
  onToggle: (iso: string) => void
}) {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })

  const cells = useMemo(
    () => buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate],
  )
  const monthLabel = viewDate.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' })

  return (
    <div className="border rounded-lg p-3 w-72">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="text-gray-400 hover:text-gray-700 px-2"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-gray-700 capitalize">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          className="text-gray-400 hover:text-gray-700 px-2"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 mb-1">
        {WEEKDAYS.map((w, i) => <div key={i}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const iso = toISO(date)
          const isSaved = savedDates.has(iso)
          const isPending = pendingDates.has(iso)
          return (
            <button
              type="button"
              key={iso}
              onClick={() => onToggle(iso)}
              disabled={isSaved}
              title={isSaved ? 'Déjà proposée' : undefined}
              className={`h-8 rounded text-sm transition-colors ${
                isSaved
                  ? 'bg-emerald-50 text-emerald-600 cursor-default'
                  : isPending
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
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
  const [pendingDates, setPendingDates] = useState<string[]>([])
  const [navOnly, setNavOnly] = useState(navPlanificationOnly)

  const savedDatesSet = useMemo(() => new Set(dates.map(d => d.candidate_date)), [dates])
  const pendingDatesSet = useMemo(() => new Set(pendingDates), [pendingDates])

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

  const handleToggleDate = (iso: string) => {
    setPendingDates(prev =>
      prev.includes(iso) ? prev.filter(d => d !== iso) : [...prev, iso].sort(),
    )
  }

  const handleUnstageDate = (date: string) => {
    setPendingDates(prev => prev.filter(d => d !== date))
  }

  const handleSaveDates = async () => {
    if (!poll || pendingDates.length === 0) return
    setLoading(true)
    const result = await addCandidateDatesAction(poll.id, pendingDates)
    setLoading(false)
    if (result.error) {
      showMsg('error', result.error)
    } else {
      showMsg('success', `${pendingDates.length} date${pendingDates.length > 1 ? 's' : ''} ajoutée${pendingDates.length > 1 ? 's' : ''}.`)
      setPendingDates([])
    }
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

          <div>
            <p className="text-xs text-gray-400 mb-2">
              Clique sur une ou plusieurs dates pour les ajouter à la liste.
            </p>
            <CalendarPicker
              savedDates={savedDatesSet}
              pendingDates={pendingDatesSet}
              onToggle={handleToggleDate}
            />
          </div>

          {pendingDates.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs text-gray-400">À enregistrer :</p>
              <div className="flex flex-wrap gap-2">
                {pendingDates.map(date => (
                  <span key={date} className="inline-flex items-center gap-1.5 bg-blue-50 border border-dashed border-blue-300 rounded-lg px-2.5 py-1 text-xs text-blue-700">
                    {fmtDate(date)}
                    <button
                      onClick={() => handleUnstageDate(date)}
                      className="text-blue-400 hover:text-red-500"
                      title="Retirer de la liste"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <button
                onClick={handleSaveDates}
                disabled={loading}
                className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                Enregistrer {pendingDates.length} date{pendingDates.length > 1 ? 's' : ''}
              </button>
            </div>
          )}

          {dates.length > 0 ? (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs text-gray-400">Déjà proposées :</p>
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
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Aucune date proposée pour l&apos;instant.</p>
          )}
        </div>
      )}
    </div>
  )
}
