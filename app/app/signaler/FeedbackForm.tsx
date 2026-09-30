'use client'

import { useState } from 'react'
import { submitFeedbackAction } from './actions'

const TYPES = [
  { value: 'bug', label: 'Problème / bug' },
  { value: 'suggestion', label: "Suggestion d'amélioration" },
  { value: 'autre', label: 'Autre' },
]

export default function FeedbackForm() {
  const [type, setType] = useState('bug')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await submitFeedbackAction(type, description)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setDescription('')
    }
  }

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <p className="text-green-700 font-medium text-lg mb-1">Merci pour ton retour !</p>
        <p className="text-green-600 text-sm mb-4">Il sera pris en compte pour améliorer l&apos;application.</p>
        <button
          onClick={() => setSuccess(false)}
          className="text-sm text-green-700 underline hover:no-underline"
        >
          Envoyer un autre retour
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 flex flex-col gap-5 max-w-xl">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Type de retour</label>
        <div className="flex flex-col gap-2">
          {TYPES.map(t => (
            <label key={t.value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="type"
                value={t.value}
                checked={type === t.value}
                onChange={() => setType(t.value)}
                className="accent-pool-navy w-4 h-4"
              />
              <span className="text-sm text-gray-700">{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          required
          rows={5}
          placeholder={
            type === 'bug'
              ? 'Décris le problème rencontré, la page concernée et ce que tu attendais...'
              : type === 'suggestion'
              ? 'Décris ton idée et pourquoi elle serait utile...'
              : 'Ton message...'
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pool-navy resize-none"
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading || !description.trim()}
        className="bg-pool-navy text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-pool-navy-light transition-colors disabled:opacity-40 self-start"
      >
        {loading ? 'Envoi...' : 'Envoyer'}
      </button>
    </form>
  )
}
