import { createClient } from '@/lib/supabase/server'
import AnalyseTool, { type AnalyseRow } from './AnalyseTool'
import { computeMetrics, type AdvancedKind } from '@/lib/advancedMetrics'

export const metadata = { title: "Outil d'analyse" }
export const dynamic = 'force-dynamic'

/**
 * Outil d'analyse croisée (David, 2026-10-01) — ouvert à tous (menu Analytique). Croise les
 * stats MoneyPuck d'une saison (`player_advanced_stats`, toutes situations, patineurs ou
 * gardiens) avec les données du pool (salaire de la saison active, âge, statut, propriétaire) :
 * deux mesures au choix sur un nuage de points, une ligne de tendance et l'écart de chaque
 * joueur à cette tendance. La saison précédente est aussi chargée pour la vue « Évolution »
 * (même mesure, d'une saison à l'autre). Aide à la décision, pas un verdict.
 */

const MIN_GP_FOR_DEFAULT = 10

type StatRow = {
  nhl_id: number
  name: string
  team: string | null
  position: string | null
  games_played: number
  icetime: number
  stats: Record<string, number | null>
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await build(from, from + 999)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

async function fetchPoolData(supabase: SupabaseLike) {
  const { data: season } = await supabase
    .from('pool_seasons').select('id, season').eq('is_active', true).eq('is_playoff', false).maybeSingle()

  const players = await fetchAll<{ id: number; nhl_id: number; age: number | null; status: string | null }>((from, to) =>
    supabase.from('players').select('id, nhl_id, age, status').not('nhl_id', 'is', null).order('id').range(from, to))

  const contracts = season
    ? await fetchAll<{ player_id: number; cap_number: number | null }>((from, to) =>
        supabase.from('player_contracts').select('id, player_id, cap_number').eq('season', season.season).order('id').range(from, to))
    : []

  const { data: rosters } = season
    ? await supabase
        .from('pooler_rosters')
        .select('player_id, player_type, poolers (name)')
        .eq('pool_season_id', season.id)
        .eq('is_active', true)
    : { data: [] }

  const capByPlayer = new Map(contracts.map(c => [c.player_id, c.cap_number != null ? Number(c.cap_number) : null]))
  const ownerByPlayer = new Map<number, { poolerName: string; playerType: string }>()
  for (const r of (rosters ?? []) as unknown as { player_id: number; player_type: string; poolers: { name: string } | null }[]) {
    if (r.poolers) ownerByPlayer.set(r.player_id, { poolerName: r.poolers.name, playerType: r.player_type })
  }

  const byNhlId = new Map<number, { cap: number | null; age: number | null; status: string | null; owner: { poolerName: string; playerType: string } | null }>()
  for (const p of players) {
    byNhlId.set(p.nhl_id, {
      cap: capByPlayer.get(p.id) ?? null,
      age: p.age != null ? Number(p.age) : null,
      status: p.status,
      owner: ownerByPlayer.get(p.id) ?? null,
    })
  }
  return { poolSeason: season?.season ?? null, byNhlId }
}

function fetchSeasonStats(supabase: SupabaseLike, season: number, kind: AdvancedKind) {
  return fetchAll<StatRow>((from, to) =>
    supabase
      .from('player_advanced_stats')
      .select('nhl_id, name, team, position, games_played, icetime, stats')
      .eq('season', season).eq('situation', 'all').eq('kind', kind)
      .order('nhl_id').range(from, to))
}

export default async function AnalysePage({ searchParams }: { searchParams: Promise<{ saison?: string; type?: string }> }) {
  const supabase = await createClient()
  const params = await searchParams
  const kind: AdvancedKind = params.type === 'gardiens' ? 'goalie' : 'skater'

  // Saisons disponibles — même règle de saison par défaut que /analytique/stats-avancees.
  const seasonRows = await fetchAll<{ season: number; games_played: number }>((from, to) =>
    supabase.from('player_advanced_stats').select('season, games_played, nhl_id')
      .eq('kind', 'goalie').eq('situation', 'all').order('season').order('nhl_id').range(from, to))
  const maxGp = new Map<number, number>()
  for (const r of seasonRows) maxGp.set(r.season, Math.max(maxGp.get(r.season) ?? 0, r.games_played ?? 0))
  const seasons = [...maxGp.keys()].sort((a, b) => b - a)
  const defaultSeason = seasons.find(s => (maxGp.get(s) ?? 0) >= MIN_GP_FOR_DEFAULT) ?? seasons[0] ?? null
  const requested = Number(params.saison)
  const season = seasons.includes(requested) ? requested : defaultSeason
  const prevSeason = season !== null && seasons.includes(season - 1) ? season - 1 : null

  const [stats, prevStats, pool] = await Promise.all([
    season === null ? Promise.resolve([] as StatRow[]) : fetchSeasonStats(supabase, season, kind),
    prevSeason === null ? Promise.resolve([] as StatRow[]) : fetchSeasonStats(supabase, prevSeason, kind),
    fetchPoolData(supabase),
  ])

  const prevByNhlId = new Map(prevStats.map(r => [r.nhl_id, r]))
  const rows: AnalyseRow[] = stats.map(r => {
    const info = pool.byNhlId.get(r.nhl_id)
    const capM = info?.cap != null ? info.cap / 1_000_000 : null
    const prev = prevByNhlId.get(r.nhl_id)
    return {
      nhlId: r.nhl_id,
      name: r.name,
      team: r.team,
      position: r.position,
      status: info?.status ?? null,
      owner: info?.owner ?? null,
      m: computeMetrics(kind, r, capM, info?.age ?? null),
      // Saison précédente : ni salaire ni âge (ceux du pool sont ceux d'aujourd'hui).
      prev: prev ? computeMetrics(kind, prev, null, null) : null,
    }
  })

  return (
    <div className="px-2 sm:px-4 py-8">
      <AnalyseTool
        key={`${kind}-${season ?? 'none'}`}
        rows={rows}
        seasons={seasons}
        season={season}
        prevSeason={prevSeason}
        poolSeason={pool.poolSeason}
        kind={kind}
      />
    </div>
  )
}
