'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PicksEditor, { type Pick, type Pooler } from '../config/PicksEditor'
import { initPicksAction } from '../config/actions'

type Saison = {
  id: number
  season: string
  is_active: boolean
  draft_rounds: number
}

type Props = {
  saisons: Saison[]
  poolers: Pooler[]
  picksBySaison: Record<number, Pick[]>
  initialSaisonId?: number
}

export default function PicksManager({ saisons, poolers, picksBySaison, initialSaisonId }: Props) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<number>(
    initialSaisonId ?? saisons.find(s => s.is_active)?.id ?? saisons[0]?.id ?? 0
  )
  const [initializing, setInitializing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const saison = saisons.find(s => s.id === selectedId)
  const picks = picksBySaison[selectedId] ?? []
  const haspicks = picks.length > 0

  const handleInit = async () => {
    if (!saison) return
    const rounds = saison.draft_rounds
    const nbPoolers = poolers.length
    if (!window.confirm(
      `Initialiser ${rounds} ronde(s) × ${nbPoolers} pooler(s) = ${rounds * nbPoolers} choix pour la saison ${saison.season} ?`
    )) return

    setInitializing(true)
    setMessage(null)
    const result = await initPicksAction(selectedId, rounds)
    setInitializing(false)

    if (result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: `${result.created} choix créés pour ${saison.season}.` })
      router.refresh()
    }
  }

  if (saisons.length === 0) {
    return <p className="text-gray-400 text-sm">Aucune saison disponible.</p>
  }

  return (
    <div>
      {/* Sélecteur de saison */}
      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm font-medium text-gray-700">Saison :</label>
        <select
          value={selectedId}
          onChange={e => { setSelectedId(Number(e.target.value)); setMessage(null) }}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {saisons.map(s => (
            <option key={s.id} value={s.id}>
              {s.season}{s.is_active ? ' (active)' : ''}
            </option>
          ))}
        </select>
        {saison && (
          <span className="text-xs text-gray-400">{saison.draft_rounds} ronde(s) configurées</span>
        )}
      </div>

      {message && (
        <p className={`mb-4 text-sm font-medium ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {haspicks ? (
        <PicksEditor key={selectedId} picks={picks} poolers={poolers} seasonLabel={saison?.season ?? ''} />
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-6 py-8 text-center">
          <p className="text-gray-500 text-sm mb-4">
            Aucun choix de repêchage pour la saison <strong>{saison?.season}</strong>.
          </p>
          {saison && (
            <button
              onClick={handleInit}
              disabled={initializing}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40"
            >
              {initializing
                ? 'Initialisation...'
                : `Initialiser — ${saison.draft_rounds} ronde(s) × ${poolers.length} poolers`}
            </button>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Crée les choix avec chaque pooler comme propriétaire original et actuel. Tu pourras ensuite ajuster les échanges.
          </p>
        </div>
      )}
    </div>
  )
}
