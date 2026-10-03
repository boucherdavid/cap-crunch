'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePickOwnerAction } from './actions'

export type Pick = {
  id: number
  round: number
  original_owner_id: string
  original_owner_name: string
  current_owner_id: string
  current_owner_name: string
  is_used: boolean
}

export type Pooler = {
  id: string
  name: string
}

const ROUND_LABELS: Record<number, string> = {
  1: '1re ronde',
  2: '2e ronde',
  3: '3e ronde',
  4: '4e ronde',
}

export default function PicksEditor({
  picks,
  poolers,
  seasonLabel,
}: {
  picks: Pick[]
  poolers: Pooler[]
  seasonLabel: string
}) {
  const router = useRouter()
  const [localPicks, setLocalPicks] = useState<Pick[]>(picks)
  // Resynchronise avec la base à chaque nouveau rendu serveur (après router.refresh(), ou un
  // changement fait ailleurs : transaction, échange) — avant, la liste initiale restait figée.
  const [syncedPicks, setSyncedPicks] = useState<Pick[]>(picks)
  if (picks !== syncedPicks) {
    setSyncedPicks(picks)
    setLocalPicks(picks)
  }
  const [saving, setSaving] = useState<number | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleChange = async (pickId: number, newOwnerId: string) => {
    setSaving(pickId)
    setMessage(null)
    const result = await updatePickOwnerAction(pickId, newOwnerId)
    setSaving(null)
    if (result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      const newOwner = poolers.find(p => p.id === newOwnerId)
      setLocalPicks(prev =>
        prev.map(p =>
          p.id === pickId
            ? { ...p, current_owner_id: newOwnerId, current_owner_name: newOwner?.name ?? '?' }
            : p,
        ),
      )
      router.refresh()
    }
  }

  const rounds = [...new Set(localPicks.map(p => p.round))].sort((a, b) => a - b)

  const roundLabel = (r: number) => r === 1 ? '1re ronde' : `${r}e ronde`

  const summaryRows = poolers.map(pooler => {
    const counts = rounds.map(round =>
      localPicks.filter(p => p.round === round && p.current_owner_id === pooler.id).length,
    )
    return { pooler, counts, total: counts.reduce((sum, c) => sum + c, 0) }
  })
  const summaryTotals = {
    counts: rounds.map((_, i) => summaryRows.reduce((sum, row) => sum + row.counts[i], 0)),
    total: summaryRows.reduce((sum, row) => sum + row.total, 0),
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-bold text-lg text-gray-800">Choix de repêchage</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Saison {seasonLabel} — ajuster le propriétaire actuel pour les échanges effectués hors-application.
        </p>
      </div>

      {message && (
        <p className={`mb-3 text-sm font-medium ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      <div className="mb-6">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Résumé — choix par pooler
        </h3>
        <div className="border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-2 font-medium text-gray-600">Pooler</th>
                {rounds.map(round => (
                  <th key={round} className="text-center px-4 py-2 font-medium text-gray-600">
                    {ROUND_LABELS[round] ?? roundLabel(round)}
                  </th>
                ))}
                <th className="text-center px-4 py-2 font-medium text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map(({ pooler, counts, total }) => (
                <tr key={pooler.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 text-gray-700">{pooler.name}</td>
                  {counts.map((count, i) => (
                    <td key={rounds[i]} className="px-4 py-2.5 text-center text-gray-700">{count}</td>
                  ))}
                  <td className="px-4 py-2.5 text-center font-medium text-gray-800">{total}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-medium">
                <td className="px-4 py-2.5 text-gray-700">Total</td>
                {summaryTotals.counts.map((count, i) => (
                  <td key={rounds[i]} className="px-4 py-2.5 text-center text-gray-700">{count}</td>
                ))}
                <td className="px-4 py-2.5 text-center text-gray-800">{summaryTotals.total}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-6">
        {rounds.map(round => {
          const roundPicks = localPicks
            .filter(p => p.round === round)
            .sort((a, b) => a.original_owner_name.localeCompare(b.original_owner_name, 'fr-CA'))

          if (roundPicks.length === 0) return null

          return (
            <div key={round}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {ROUND_LABELS[round] ?? roundLabel(round)}
              </h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Propriétaire original</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Propriétaire actuel</th>
                      <th className="text-center px-4 py-2 font-medium text-gray-600 w-24">Utilisé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roundPicks.map(pick => {
                      const changed = pick.current_owner_id !== pick.original_owner_id
                      return (
                        <tr key={pick.id} className={`border-b last:border-0 ${changed ? 'bg-amber-50' : ''}`}>
                          <td className="px-4 py-2.5 text-gray-700">{pick.original_owner_name}</td>
                          <td className="px-4 py-2.5">
                            <select
                              value={pick.current_owner_id}
                              onChange={e => handleChange(pick.id, e.target.value)}
                              disabled={pick.is_used || saving === pick.id}
                              className={`border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white disabled:opacity-50 ${
                                changed ? 'border-amber-400 font-medium text-amber-800' : 'border-gray-300'
                              }`}
                            >
                              {poolers.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                            {saving === pick.id && (
                              <span className="ml-2 text-xs text-gray-400">Sauvegarde...</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {pick.is_used ? (
                              <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">Utilisé</span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

        {localPicks.length === 0 && (
          <p className="text-gray-400 text-sm">Aucun choix trouvé pour cette saison.</p>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Les choix en surbrillance ambre ont été réassignés. Les choix marqués « Utilisé » ne peuvent plus être modifiés.
      </p>
    </div>
  )
}
