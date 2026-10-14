import { getStandings } from './standings'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeReverseStandingsOrder(supabase: any, currentSeasonId: number): Promise<{
  poolerIds?: string[]
  previousSeason?: string
  error?: string
}> {
  const { data: current } = await supabase
    .from('pool_seasons')
    .select('season')
    .eq('id', currentSeasonId)
    .single()
  if (!current) return { error: 'Saison introuvable.' }

  const { data: seasons } = await supabase
    .from('pool_seasons')
    .select('id, season')
    .eq('is_playoff', false)
    .order('season', { ascending: false })

  const all = (seasons ?? []) as { id: number; season: string }[]
  const idx = all.findIndex(s => s.season === current.season)
  const previous = idx >= 0 ? all[idx + 1] : undefined
  if (!previous) return { error: 'Aucune saison précédente trouvée.' }

  const standings = await getStandings(previous.id)
  if (standings.length === 0) return { error: 'Classement de la saison précédente indisponible.' }

  return {
    poolerIds: standings.map(s => s.poolerId).reverse(),
    previousSeason: previous.season,
  }
}
