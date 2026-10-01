import { createClient } from '@/lib/supabase/server'
import AnalyseTool, { type AnalyseRow } from './AnalyseTool'

export const metadata = { title: 'Analyse' }
export const dynamic = 'force-dynamic'

/**
 * Outil d'analyse croisée (David, 2026-10-01) — ouvert à tous (menu Analytique). Croise les
 * stats MoneyPuck d'une saison (`player_advanced_stats`, toutes situations, patineurs) avec les
 * données du pool (salaire de la saison active, âge, statut, propriétaire) : deux mesures au
 * choix sur un nuage de points, une ligne de tendance et l'écart de chaque joueur à cette
 * tendance. Aide à la décision, pas un verdict. Gardiens non couverts (v1).
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

export default async function AnalysePage({ searchParams }: { searchParams: Promise<{ saison?: string }> }) {
  const supabase = await createClient()
  const params = await searchParams

  // Saisons disponibles — même règle de saison par défaut que /analytique/stats-avancees.
  const { data: seasonRows } = await supabase
    .from('player_advanced_stats').select('season, games_played').eq('kind', 'goalie').eq('situation', 'all')
  const maxGp = new Map<number, number>()
  for (const r of seasonRows ?? []) maxGp.set(r.season, Math.max(maxGp.get(r.season) ?? 0, r.games_played ?? 0))
  const seasons = [...maxGp.keys()].sort((a, b) => b - a)
  const defaultSeason = seasons.find(s => (maxGp.get(s) ?? 0) >= MIN_GP_FOR_DEFAULT) ?? seasons[0] ?? null
  const requested = Number(params.saison)
  const season = seasons.includes(requested) ? requested : defaultSeason

  const [stats, pool] = await Promise.all([
    season === null
      ? Promise.resolve([] as StatRow[])
      : fetchAll<StatRow>((from, to) =>
          supabase
            .from('player_advanced_stats')
            .select('nhl_id, name, team, position, games_played, icetime, stats')
            .eq('season', season).eq('situation', 'all').eq('kind', 'skater')
            .order('nhl_id').range(from, to)),
    fetchPoolData(supabase),
  ])

  const div = (a: number, b: number) => (b ? a / b : null)
  const rows: AnalyseRow[] = stats.map(r => {
    const s = (k: string) => r.stats[k] ?? 0
    const info = pool.byNhlId.get(r.nhl_id)
    const capM = info?.cap != null ? info.cap / 1_000_000 : null
    const hours = r.icetime / 3600
    const onSh = div(s('gf'), s('sf'))
    const onSvA = div(s('ga'), s('sa'))
    return {
      nhlId: r.nhl_id,
      name: r.name,
      team: r.team,
      position: r.position,
      status: info?.status ?? null,
      owner: info?.owner ?? null,
      m: {
        cap: capM,
        age: info?.age ?? null,
        gp: r.games_played,
        toi: div(r.icetime / 60, r.games_played),
        pts: s('points'),
        goals: s('goals'),
        ptsGp: div(s('points'), r.games_played),
        pts60: div(s('points'), hours),
        ptsPerM: capM ? s('points') / capM : null,
        xg: s('xg'),
        gax: s('goals') - s('xg'),
        shPct: div(s('goals') * 100, s('shots')),
        xg60: div(s('xg'), hours),
        xgPct: r.stats.xg_pct != null ? r.stats.xg_pct * 100 : null,
        xgRel: r.stats.xg_pct != null && r.stats.xg_pct_off != null ? (r.stats.xg_pct - r.stats.xg_pct_off) * 100 : null,
        cfPct: r.stats.cf_pct != null ? r.stats.cf_pct * 100 : null,
        pdo: onSh === null || onSvA === null ? null : (onSh + 1 - onSvA) * 100,
        gsGp: div(s('game_score'), r.games_played),
        hits: s('hits'),
        blocks: s('blocks'),
      },
    }
  })

  return (
    <div className="px-2 sm:px-4 py-8">
      <AnalyseTool key={season ?? 'none'} rows={rows} seasons={seasons} season={season} poolSeason={pool.poolSeason} />
    </div>
  )
}
