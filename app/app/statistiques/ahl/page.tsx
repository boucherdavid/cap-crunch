import { fetchAhlRegularSeasons, fetchAhlSkaters, fetchAhlGoalies, type AhlSeasonInfo, type AhlSkater } from '@/lib/ahl-stats'
import { createClient } from '@/lib/supabase/server'
import { normName } from '@/lib/nhl-stats'
import AhlStatsTable from './AhlStatsTable'

export const metadata = { title: 'Statistiques AHL' }
export const dynamic = 'force-dynamic'

/** Noms normalisés des joueurs déjà dans l'alignement d'un pooler (actif, réserviste, LTIR
 * ou en banque de recrues) — un prospect AHL repêché par le pool y apparaît via sa ligne
 * `recrue`, même s'il ne joue pas encore dans la LNH. Même logique que /statistiques. */
async function fetchTakenNames(): Promise<string[]> {
  try {
    const supabase = await createClient()
    const { data: season } = await supabase
      .from('pool_seasons')
      .select('id')
      .eq('is_active', true)
      .eq('is_playoff', false)
      .single()
    if (!season) return []

    const { data: rosters } = await supabase
      .from('pooler_rosters')
      .select('players(first_name, last_name)')
      .eq('pool_season_id', season.id)
    if (!rosters) return []

    return rosters
      .map(r => r.players as unknown as { first_name: string; last_name: string } | null)
      .filter(Boolean)
      .map(p => normName(`${p!.first_name} ${p!.last_name}`))
  } catch {
    return []
  }
}

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
  const [seasons, takenNames] = await Promise.all([fetchAhlRegularSeasons(), fetchTakenNames()])
  const { season, skaters } = await resolveSeason(seasons, saison)
  const goalies = season ? await fetchAhlGoalies(season.id) : []

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <AhlStatsTable
        skaters={skaters}
        goalies={goalies}
        seasons={seasons}
        selectedSeasonId={season?.id ?? ''}
        takenNames={takenNames}
      />
    </div>
  )
}
