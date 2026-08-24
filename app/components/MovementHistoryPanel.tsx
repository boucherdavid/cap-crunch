'use client'

import { useEffect, useState } from 'react'
import { getMovementHistoryAction, type MovementEvent } from './movement-history-actions'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-CA', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Toronto',
  })
}

export default function MovementHistoryPanel({
  poolerId,
  poolerName,
  refreshKey,
}: {
  poolerId: string | null
  poolerName?: string
  refreshKey: number
}) {
  const [mode, setMode] = useState<'pooler' | 'all'>('pooler')
  const [events, setEvents] = useState<MovementEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getMovementHistoryAction(mode === 'pooler' ? poolerId : null, mode === 'pooler' ? 30 : 50)
      .then(data => { if (!cancelled) setEvents(data) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [poolerId, mode, refreshKey])

  return (
    <div className="w-80 shrink-0 sticky top-4 self-start bg-white rounded-lg shadow flex flex-col max-h-[calc(100vh-2rem)]">
      <div className="p-4 border-b space-y-2">
        <h2 className="font-semibold text-gray-700 text-sm">Historique des mouvements</h2>
        <div className="flex border-b -mb-2">
          <button
            onClick={() => setMode('pooler')}
            disabled={!poolerId}
            className={`px-2.5 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              mode === 'pooler' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {poolerName || 'Ce pooler'}
          </button>
          <button
            onClick={() => setMode('all')}
            className={`px-2.5 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              mode === 'all' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Tous
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {loading ? (
          <p className="text-gray-400 text-xs py-6 text-center">Chargement...</p>
        ) : events.length === 0 ? (
          <p className="text-gray-400 text-xs py-6 text-center px-4">
            {mode === 'pooler' && !poolerId ? 'Sélectionnez un pooler pour voir son historique.' : 'Aucun mouvement récent.'}
          </p>
        ) : (
          <ul className="divide-y">
            {events.map(e => (
              <li key={e.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${e.color}`}>{e.label}</span>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">{fmtDate(e.at)}</span>
                </div>
                {mode === 'all' && <p className="text-xs font-medium text-gray-700">{e.poolerName}</p>}
                <p className="text-xs text-gray-600 break-words">{e.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
