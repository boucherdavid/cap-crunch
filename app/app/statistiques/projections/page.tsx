import { createClient } from '@/lib/supabase/server'
import { fetchActiveNhlSeasonId } from '@/lib/nhl-active-season'
import { fetchNhlSkatersByNhlId, fetchNhlGoaliesByNhlId, type NhlSkaterStat, type NhlGoalieStat } from '@/lib/nhl-stats'
import ProjectionsTable from './ProjectionsTable'

export const metadata = { title: 'Projections LNH' }
export const dynamic = 'force-dynamic'

export type ProjectionRow = {
  nhlId: number | null
  firstName: string
  lastName: string
  team: string | null
  position: string
  isGoalie: boolean
  available: boolean
  nhlCom: number | null
  cbs: number | null
  trend: number | null
  trendSeasons: number
}

type RawProjection = {
  player_id: number
  source: string
  projected_points: number | null
  projected_wins: number | null
  players: {
    nhl_id: number | null
    first_name: string
    last_name: string
    position: string
    teams: { code: string } | null
  } | null
}

function normName(s: string) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/-/g, ' ').trim()
}

/** Noms normalisés des joueurs dans un roster actif (même portée que /statistiques). */
async function fetchTakenNames(): Promise<Set<string>> {
  const supabase = await createClient()
  const { data: season } = await supabase
    .from('pool_seasons')
    .select('id')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .single()
  if (!season) return new Set()

  const { data: rosters } = await supabase
    .from('pooler_rosters')
    .select('players(first_name, last_name)')
    .eq('pool_season_id', season.id)
  if (!rosters) return new Set()

  return new Set(
    rosters
      .map(r => r.players as unknown as { first_name: string; last_name: string } | null)
      .filter((p): p is { first_name: string; last_name: string } => !!p)
      .map(p => normName(`${p.first_name} ${p.last_name}`)),
  )
}

/** ["20262027", "20252026", "20242025"] à partir de la saison NHL courante */
function recentSeasonIds(nhlSeasonId: string, count: number): string[] {
  const startYear = parseInt(nhlSeasonId.slice(0, 4), 10)
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i
    return `${y}${y + 1}`
  })
}

// Même logique de tendance que PlayerSlideOver (poids 3/2/1, la plus récente comptant le
// plus, projetée sur 82 matchs) — mais à partir des stats bulk par saison (lib/nhl-stats),
// pas d'un fetch par joueur (fetchPlayerLanding), pour rester rapide sur ~400 joueurs.
const WEIGHTS = [3, 2, 1]

function computeSkaterTrend(nhlId: number | null, maps: Map<number, NhlSkaterStat>[]) {
  if (!nhlId) return null
  let weightedSum = 0, weightTotal = 0, seasonsUsed = 0
  maps.forEach((map, i) => {
    const s = map.get(nhlId)
    if (!s || s.gamesPlayed <= 0) return
    weightedSum += ((s.goals + s.assists) / s.gamesPlayed) * WEIGHTS[i]
    weightTotal += WEIGHTS[i]
    seasonsUsed++
  })
  if (weightTotal === 0) return null
  return { projected: Math.round((weightedSum / weightTotal) * 82), seasonsUsed }
}

function computeGoalieTrend(nhlId: number | null, maps: Map<number, NhlGoalieStat>[]) {
  if (!nhlId) return null
  let weightedSum = 0, weightTotal = 0, seasonsUsed = 0
  maps.forEach((map, i) => {
    const s = map.get(nhlId)
    if (!s || s.gamesStarted <= 0) return
    weightedSum += (s.wins / s.gamesStarted) * WEIGHTS[i]
    weightTotal += WEIGHTS[i]
    seasonsUsed++
  })
  if (weightTotal === 0) return null
  return { projected: Math.round((weightedSum / weightTotal) * 82), seasonsUsed }
}

export default async function ProjectionsPage() {
  const supabase = await createClient()

  const { data: activeSeason } = await supabase
    .from('pool_seasons')
    .select('season')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .single()

  const poolSeason = activeSeason?.season ?? null

  const { data: rows } = poolSeason
    ? await supabase
        .from('player_projections')
        .select('player_id, source, projected_points, projected_wins, players(nhl_id, first_name, last_name, position, teams(code))')
        .eq('season', poolSeason)
        .in('source', ['nhl_com', 'cbs'])
    : { data: null }

  const byPlayer = new Map<number, Omit<ProjectionRow, 'trend' | 'trendSeasons' | 'available'>>()
  for (const r of (rows as unknown as RawProjection[] | null) ?? []) {
    const p = r.players
    if (!p) continue
    const isGoalie = p.position === 'G'
    const entry = byPlayer.get(r.player_id) ?? {
      nhlId: p.nhl_id, firstName: p.first_name, lastName: p.last_name,
      position: p.position, team: p.teams?.code ?? null, isGoalie,
      nhlCom: null, cbs: null,
    }
    const value = isGoalie ? r.projected_wins : r.projected_points
    if (r.source === 'nhl_com') entry.nhlCom = value
    if (r.source === 'cbs') entry.cbs = value
    byPlayer.set(r.player_id, entry)
  }

  const nhlSeasonId = await fetchActiveNhlSeasonId(false)
  const seasonIds = recentSeasonIds(nhlSeasonId, 3)
  const [skaterMaps, goalieMaps, takenNames] = await Promise.all([
    Promise.all(seasonIds.map(id => fetchNhlSkatersByNhlId(2, id))),
    Promise.all(seasonIds.map(id => fetchNhlGoaliesByNhlId(2, id))),
    fetchTakenNames(),
  ])

  const players: ProjectionRow[] = Array.from(byPlayer.values()).map(p => {
    const trend = p.isGoalie ? computeGoalieTrend(p.nhlId, goalieMaps) : computeSkaterTrend(p.nhlId, skaterMaps)
    const available = !takenNames.has(normName(`${p.firstName} ${p.lastName}`))
    return { ...p, available, trend: trend?.projected ?? null, trendSeasons: trend?.seasonsUsed ?? 0 }
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ProjectionsTable players={players} season={poolSeason} />
    </div>
  )
}
