'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createProspectAction } from './actions'

export default function AddProspectForm({ draftYear }: { draftYear: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [position, setPosition] = useState('')
  const [team, setTeam] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await createProspectAction({ draftYear, firstName, lastName, position, team })
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setFirstName(''); setLastName(''); setPosition(''); setTeam('')
      setOpen(false)
      router.refresh()
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
      >
        + Ajouter un prospect
      </button>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-5 mb-6">
      <h2 className="font-semibold text-gray-700 mb-4">Nouveau prospect ({draftYear})</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3 max-w-3xl">
        <input value={firstName} onChange={e => setFirstName(e.target.value)} required placeholder="Prénom"
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={lastName} onChange={e => setLastName(e.target.value)} required placeholder="Nom"
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={position} onChange={e => setPosition(e.target.value)} placeholder="Position (ex. : LW)"
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={team} onChange={e => setTeam(e.target.value)} placeholder="Équipe, ligue"
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {error && <p className="text-red-600 text-sm sm:col-span-4">{error}</p>}
        <div className="flex gap-2 sm:col-span-4">
          <button type="submit" disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {loading ? 'Création...' : 'Créer'}
          </button>
          <button type="button" onClick={() => { setOpen(false); setError('') }}
            className="px-4 py-2 border text-sm text-gray-600 rounded-lg hover:bg-gray-50">
            Annuler
          </button>
        </div>
      </form>
    </div>
  )
}
