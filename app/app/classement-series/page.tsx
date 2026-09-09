import {
  getPlayoffPoolSaisonAction,
  getPlayoffPoolStandingsAction,
} from '@/app/gestion-series/playoff-pool-actions'
import { fetchStreaks } from '@/lib/streaks'
import { fetchActiveNhlSeasonId } from '@/lib/nhl-active-season'
import ClassementSeriesTable from './ClassementSeriesTable'
import type { StreakInfo } from '@/lib/streaks'

export const metadata = { title: 'Classement — Pool des séries' }
export const dynamic = 'force-dynamic'

export default async function ClassementSeriesPage() {
  const saison = await getPlayoffPoolSaisonAction()

  if (!saison) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Classement — Pool des séries</h1>
        <p className="text-gray-500">Aucune saison de séries active.</p>
      </div>
    )
  }

  const deadline = saison.submissionDeadline ? new Date(saison.submissionDeadline) : null
  const beforeDeadline = deadline ? new Date() < deadline : false

  if (beforeDeadline) {
    const fmt = deadline!.toLocaleString('fr-CA', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Toronto',
    })
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">Classement — Pool des séries {saison.season}</h1>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 text-sm text-blue-700">
          Le classement sera disponible après la date limite de soumission :<br />
          <strong>{fmt}</strong>
        </div>
      </div>
    )
  }

  const standings = await getPlayoffPoolStandingsAction(saison.id, true)

  // Streaks — fetch des game logs séries pour les joueurs actifs (fire-and-forget avec timeout)
  let streaks: Record<number, StreakInfo> = {}
  if (standings.length > 0) {
    const activePlayers = standings
      .flatMap(s => s.players)
      .filter(p => p.isActive && p.nhlId !== null)
    const unique = new Map<number, boolean>()
    for (const p of activePlayers) {
      if (p.nhlId && !unique.has(p.nhlId)) unique.set(p.nhlId, p.positionSlot === 'G')
    }
    const players = [...unique.entries()].map(([nhlId, isGoalie]) => ({ nhlId, isGoalie }))
    try {
      const nhlSeason = await fetchActiveNhlSeasonId(true)
      const map = await Promise.race([
        fetchStreaks(players, 3, undefined, 5, nhlSeason),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
      ])
      for (const [nhlId, info] of map) streaks[nhlId] = info
    } catch {
      // Timeout ou erreur NHL API — classement s'affiche quand même sans indicateurs
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Classement — Pool des séries {saison.season}</h1>
        <p className="text-xs text-gray-400 mt-1">Stats en direct — séries éliminatoires LNH</p>
      </div>

      {standings.length === 0 ? (
        <p className="text-gray-500 text-sm">
          Aucun alignement complet soumis pour l&apos;instant.
        </p>
      ) : (
        <ClassementSeriesTable standings={standings} streaks={streaks} />
      )}
    </div>
  )
}
