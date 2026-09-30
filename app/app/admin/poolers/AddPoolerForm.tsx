'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPoolerAction } from './actions'

export default function AddPoolerForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await createPoolerAction(name, email, password)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setName('')
      setEmail('')
      setPassword('')
      setOpen(false)
      router.refresh()
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
      >
        + Ajouter un pooler
      </button>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-5 mb-6">
      <h2 className="font-semibold text-gray-700 mb-4">Nouveau pooler</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-md">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Nom</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ex. : Martin Tremblay"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Courriel</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="pooler@exemple.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Mot de passe temporaire</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="6 caractères minimum"
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2 mt-1">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            {loading ? 'Création...' : 'Créer'}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setError('') }}
            className="px-4 py-2 border text-sm text-gray-600 rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  )
}
