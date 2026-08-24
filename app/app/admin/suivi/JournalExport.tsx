'use client'

import { useState, useTransition } from 'react'
import { exportJournalCsvAction } from './export-actions'

export default function JournalExport({
  seasons,
  defaultSeasonId,
}: {
  seasons: { id: number; label: string }[]
  defaultSeasonId: number | null
}) {
  const [seasonId, setSeasonId] = useState(defaultSeasonId ?? seasons[0]?.id ?? 0)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleExport() {
    setError(null)
    startTransition(async () => {
      const result = await exportJournalCsvAction(seasonId)
      if (result.error || !result.csv) {
        setError(result.error ?? 'Erreur inconnue')
        return
      }
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename ?? 'journal.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
  }

  if (seasons.length === 0) return null

  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-center gap-3">
      <div>
        <p className="text-sm font-medium text-gray-700">Journal complet d&apos;une saison</p>
        <p className="text-xs text-gray-400">
          Tous les mouvements (alignement et transactions), triés par date effective — pour archive ou récupération.
        </p>
      </div>
      <select
        value={seasonId}
        onChange={e => setSeasonId(Number(e.target.value))}
        className="ml-auto border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white"
      >
        {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <button
        onClick={handleExport}
        disabled={isPending}
        className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Export en cours...' : 'Exporter en CSV'}
      </button>
      {error && <span className="text-sm text-red-600 w-full">{error}</span>}
    </div>
  )
}
