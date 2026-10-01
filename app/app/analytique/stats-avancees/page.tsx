import { createClient } from '@/lib/supabase/server'
import StatsAvanceesTable, { type AdvancedRow, type Kind, type Situation } from './StatsAvanceesTable'

export const metadata = { title: 'Stats avancées' }
export const dynamic = 'force-dynamic'

/**
 * Statistiques avancées MoneyPuck (David, 2026-10-01) — d'abord admin seulement, ouvertes à
 * tous le même jour (menu Analytique). Données importées chaque jour par python_script/import_advanced_stats.py dans
 * `player_advanced_stats` (saison = année de début, convention MoneyPuck).
 */

const SITUATIONS: Situation[] = ['all', '5on5', '5on4', '4on5']
// Une saison MoneyPuck qui n'a encore que des matchs préparatoires (ou quelques matchs) n'est
// pas affichée par défaut : on retombe sur la précédente tant que personne n'a 10 matchs.
const MIN_GP_FOR_DEFAULT = 10

type Owner = { poolerName: string; playerType: string }

async function fetchOwnersByNhlId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Map<number, Owner>> {
  const { data: season } = await supabase
    .from('pool_seasons').select('id').eq('is_active', true).eq('is_playoff', false).maybeSingle()
  if (!season) return new Map()
  const { data } = await supabase
    .from('pooler_rosters')
    .select('player_type, players (nhl_id), poolers (name)')
    .eq('pool_season_id', season.id)
    .eq('is_active', true)
  const map = new Map<number, Owner>()
  for (const r of (data ?? []) as unknown as { player_type: string; players: { nhl_id: number | null } | null; poolers: { name: string } | null }[]) {
    if (r.players?.nhl_id && r.poolers) map.set(r.players.nhl_id, { poolerName: r.poolers.name, playerType: r.player_type })
  }
  return map
}

export default async function StatsAvanceesPage({
  searchParams,
}: {
  searchParams: Promise<{ saison?: string; situation?: string; type?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams
  const kind: Kind = params.type === 'gardiens' ? 'goalie' : 'skater'
  const situation: Situation = SITUATIONS.includes(params.situation as Situation) ? params.situation as Situation : 'all'

  // Saisons disponibles (les gardiens suffisent : ~100 lignes par saison) + max de matchs joués.
  // Paginé : ~100 gardiens par saison, la limite de 1000 lignes serait atteinte vers 10 saisons.
  const seasonRows: { season: number; games_played: number }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('player_advanced_stats')
      .select('season, games_played, nhl_id')
      .eq('kind', 'goalie')
      .eq('situation', 'all')
      .order('season')
      .order('nhl_id')
      .range(from, from + 999)
    seasonRows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const maxGp = new Map<number, number>()
  for (const r of seasonRows) maxGp.set(r.season, Math.max(maxGp.get(r.season) ?? 0, r.games_played ?? 0))
  const seasons = [...maxGp.keys()].sort((a, b) => b - a)
  const defaultSeason = seasons.find(s => (maxGp.get(s) ?? 0) >= MIN_GP_FOR_DEFAULT) ?? seasons[0] ?? null
  const requested = Number(params.saison)
  const season = seasons.includes(requested) ? requested : defaultSeason

  let rows: AdvancedRow[] = []
  if (season !== null) {
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data } = await supabase
        .from('player_advanced_stats')
        .select('nhl_id, name, team, position, games_played, icetime, stats')
        .eq('season', season)
        .eq('situation', situation)
        .eq('kind', kind)
        .order('nhl_id')
        .range(from, from + pageSize - 1)
      rows = rows.concat((data ?? []) as AdvancedRow[])
      if (!data || data.length < pageSize) break
    }
  }

  const owners = await fetchOwnersByNhlId(supabase)
  const rowsWithOwner = rows.map(r => ({ ...r, owner: owners.get(r.nhl_id) ?? null }))

  return (
    <div className="px-2 sm:px-4 py-8">
      <StatsAvanceesTable
        key={`${kind}-${season}-${situation}`}
        rows={rowsWithOwner}
        seasons={seasons}
        season={season}
        situation={situation}
        kind={kind}
      />
    </div>
  )
}
