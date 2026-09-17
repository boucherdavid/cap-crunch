import { fetchAhlRegularSeasons, fetchAhlSkaters, fetchAhlGoalies, type AhlSeasonInfo, type AhlSkater } from '@/lib/ahl-stats'
import AhlStatsTable from './AhlStatsTable'

export const metadata = { title: 'Statistiques AHL' }
export const dynamic = 'force-dynamic'

/** Saison choisie : celle demandée en query, sinon la plus récente ayant des matchs joués
 * (la saison à venir peut ne pas encore avoir démarré). */
async function resolveSeason(
  seasons: AhlSeasonInfo[],
  requestedId?: string,
): Promise<{ season?: AhlSeasonInfo; skaters: AhlSkater[] }> {
  if (requestedId) {
    const requested = seasons.find(s => s.id === requestedId)
    if (requested) return { season: requested, skaters: await fetchAhlSkaters(requested.id) }
  }
  for (const season of seasons) {
    const skaters = await fetchAhlSkaters(season.id)
    if (skaters.some(s => s.gamesPlayed > 0)) return { season, skaters }
  }
  return { season: seasons[0], skaters: [] }
}

export default async function StatistiquesAhlPage({
  searchParams,
}: {
  searchParams: Promise<{ saison?: string }>
}) {
  const { saison } = await searchParams
  const seasons = await fetchAhlRegularSeasons()
  const { season, skaters } = await resolveSeason(seasons, saison)
  const goalies = season ? await fetchAhlGoalies(season.id) : []

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <AhlStatsTable
        skaters={skaters}
        goalies={goalies}
        seasons={seasons}
        selectedSeasonId={season?.id ?? ''}
      />
    </div>
  )
}
