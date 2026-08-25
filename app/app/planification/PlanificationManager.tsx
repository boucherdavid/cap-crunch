'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  submitAvailabilityAction,
  addCommentAction,
  deleteCommentAction,
} from './actions'

type Me = { id: string; name: string; isAdmin: boolean }
type Pooler = { id: string; name: string }
type Poll = { id: number; title: string } | null
type CandidateDate = { id: number; candidate_date: string }
type Response = { pooler_id: string; candidate_date: string }
type Comment = { id: number; pooler_id: string; body: string; created_at: string }

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-CA', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-CA', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Toronto',
  })
}

export default function PlanificationManager({
  me, poolers, poll, dates, responses, comments,
}: {
  me: Me
  poolers: Pooler[]
  poll: Poll
  dates: CandidateDate[]
  responses: Response[]
  comments: Comment[]
}) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const poolerName = useMemo(
    () => new Map(poolers.map(p => [p.id, p.name])),
    [poolers],
  )

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

  const handleSubmit = async () => {
    if (!poll) return
    setLoading(true)
    const result = await submitAvailabilityAction(poll.id, Array.from(selected))
    setLoading(false)
    if (result.error) showMsg('error', result.error)
    else showMsg('success', 'Tes disponibilités ont été enregistrées.')
  }

  const handlePostComment = async () => {
    if (!poll || !newComment.trim()) return
    setPostingComment(true)
    const result = await addCommentAction(poll.id, newComment)
    setPostingComment(false)
    if (result.error) showMsg('error', result.error)
    else setNewComment('')
  }

  const handleDeleteComment = async (commentId: number) => {
    const result = await deleteCommentAction(commentId)
    if (result.error) showMsg('error', result.error)
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
      <div className="text-center">
        <Image
          src="/branding/logo-app.png"
          alt="Cap Crunch — Pool entre amis"
          width={1536}
          height={1024}
          className="w-full max-w-sm mx-auto rounded-xl shadow-sm"
          priority
        />
        <h1 className="text-2xl font-bold text-gray-800 mt-3 mb-1">Planification</h1>
        <p className="text-gray-500 text-sm">
          {poll ? poll.title : 'Trouver une date pour la rencontre annuelle du pool.'}
        </p>
      </div>

      {message && (
        <p className={`text-sm font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {!poll && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400 text-sm">
          Aucun sondage actif pour le moment.
          {me.isAdmin && (
            <>
              {' '}
              <Link href="/admin/planification" className="text-blue-600 hover:text-blue-800">
                Créer un sondage →
              </Link>
            </>
          )}
        </div>
      )}

      {poll && dates.length === 0 && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400 text-sm">
          Aucune date proposée pour l&apos;instant.
          {me.isAdmin && (
            <>
              {' '}
              <Link href="/admin/planification" className="text-blue-600 hover:text-blue-800">
                Gérer les dates →
              </Link>
            </>
          )}
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

      {poll && (
        <div className="bg-white rounded-lg shadow p-5 space-y-4">
          <h2 className="font-semibold text-gray-700 text-sm">Babillard</h2>

          {comments.length === 0 ? (
            <p className="text-gray-400 text-sm">Aucun commentaire pour l&apos;instant.</p>
          ) : (
            <ul className="space-y-3">
              {comments.map(c => (
                <li key={c.id} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700">
                        {poolerName.get(c.pooler_id) ?? 'Un pooler'}
                        <span className="ml-2 text-xs text-gray-400 font-normal">{fmtDateTime(c.created_at)}</span>
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                    </div>
                    {(c.pooler_id === me.id || me.isAdmin) && (
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        className="shrink-0 text-gray-300 hover:text-red-500 text-xs"
                        title="Supprimer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Écrire un commentaire..."
              rows={2}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <button
              onClick={handlePostComment}
              disabled={postingComment || !newComment.trim()}
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 self-end"
            >
              Publier
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
