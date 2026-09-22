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
  position: string | null
  isGoalie: boolean
  available: boolean
  nhlCom: number | null
  cbs: number | null
  poolPro: number | null
  lastSeasonValue: number | null
  trend: number | null
  trendSeasons: number
  trendPerGame: number | null
  trendGames: number
  trendDirection: 'up' | 'down' | 'stable' | null
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
    position: string | null
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

// Une saison à 1-2 matchs (rappel éclair, blessure) donne un rythme par match extrapolé sur
// 82 matchs complètement absurde (ex: 2 matchs à 2 pts = 164 pts projetés) — David a repéré le
// cas d'Oliver Bonk. Une saison sous ce seuil est ignorée par la tendance, exactement comme une
// saison à 0 match ; en dessous, aucune tendance n'est affichée plutôt qu'un chiffre trompeur.
const MIN_GAMES_FOR_TREND = 10

// Compare le rythme par match des 2 saisons qualifiées les plus récentes (déjà pondérées/ordrées
// dans `qualifying`) pour indiquer si le joueur progresse, régresse ou reste stable — une seule
// saison qualifiée ne donne rien à comparer. Bande de ±10% autour du rythme le plus ancien pour
// éviter qu'un minuscule écart s'affiche comme une vraie tendance.
function computeDirection(rate0: number, rate1: number): 'up' | 'down' | 'stable' {
  const base = rate1 > 0 ? rate1 : 0.3
  const relDiff = (rate0 - rate1) / base
  if (relDiff > 0.1) return 'up'
  if (relDiff < -0.1) return 'down'
  return 'stable'
}

// `maps` peut contenir plus de 3 saisons (voir appelant) — la saison la plus récente n'a pas
// encore commencé pendant une bonne partie de l'année (0 match partout) et ne doit pas "gaspiller"
// un rang sur les 3 pondérés : on prend les 3 premières saisons qui passent le seuil, peu importe
// leur position dans `maps`, plutôt que de figer le poids sur l'index brut.
function computeSkaterTrend(nhlId: number | null, maps: Map<number, NhlSkaterStat>[]) {
  if (!nhlId) return null
  const qualifying: NhlSkaterStat[] = []
  for (const map of maps) {
    const s = map.get(nhlId)
    if (s && s.gamesPlayed >= MIN_GAMES_FOR_TREND) qualifying.push(s)
    if (qualifying.length === WEIGHTS.length) break
  }
  if (qualifying.length === 0) return null
  const rates = qualifying.map(s => (s.goals + s.assists) / s.gamesPlayed)
  let weightedSum = 0, weightTotal = 0, gamesUsed = 0
  rates.forEach((rate, i) => {
    weightedSum += rate * WEIGHTS[i]
    weightTotal += WEIGHTS[i]
    gamesUsed += qualifying[i].gamesPlayed
  })
  const perGame = weightedSum / weightTotal
  const direction = rates.length >= 2 ? computeDirection(rates[0], rates[1]) : null
  return { projected: Math.round(perGame * 82), perGame, seasonsUsed: qualifying.length, gamesUsed, direction }
}

function computeGoalieTrend(nhlId: number | null, maps: Map<number, NhlGoalieStat>[]) {
  if (!nhlId) return null
  const qualifying: NhlGoalieStat[] = []
  for (const map of maps) {
    const s = map.get(nhlId)
    if (s && s.gamesStarted >= MIN_GAMES_FOR_TREND) qualifying.push(s)
    if (qualifying.length === WEIGHTS.length) break
  }
  if (qualifying.length === 0) return null
  const rates = qualifying.map(s => s.wins / s.gamesStarted)
  let weightedSum = 0, weightTotal = 0, gamesUsed = 0
  rates.forEach((rate, i) => {
    weightedSum += rate * WEIGHTS[i]
    weightTotal += WEIGHTS[i]
    gamesUsed += qualifying[i].gamesStarted
  })
  const perGame = weightedSum / weightTotal
  const direction = rates.length >= 2 ? computeDirection(rates[0], rates[1]) : null
  return { projected: Math.round(perGame * 82), perGame, seasonsUsed: qualifying.length, gamesUsed, direction }
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
        .in('source', ['nhl_com', 'cbs', 'pool_pro'])
    : { data: null }

  const byPlayer = new Map<number, Omit<ProjectionRow, 'trend' | 'trendSeasons' | 'trendPerGame' | 'trendGames' | 'trendDirection' | 'lastSeasonValue' | 'available'>>()
  for (const r of (rows as unknown as RawProjection[] | null) ?? []) {
    const p = r.players
    if (!p) continue
    const isGoalie = p.position === 'G'
    const entry = byPlayer.get(r.player_id) ?? {
      nhlId: p.nhl_id, firstName: p.first_name, lastName: p.last_name,
      position: p.position, team: p.teams?.code ?? null, isGoalie,
      nhlCom: null, cbs: null, poolPro: null,
    }
    const value = isGoalie ? r.projected_wins : r.projected_points
    if (r.source === 'nhl_com') entry.nhlCom = value
    if (r.source === 'cbs') entry.cbs = value
    if (r.source === 'pool_pro') entry.poolPro = value
    byPlayer.set(r.player_id, entry)
  }

  const nhlSeasonId = await fetchActiveNhlSeasonId(false)
  // +1 en réserve : la saison active n'a pas encore de matchs joués une bonne partie de l'année
  // (pré-saison/tout début) et ne doit pas "gaspiller" un rang parmi les 3 saisons pondérées —
  // voir computeSkaterTrend/computeGoalieTrend, qui prennent les 3 premières qualifiées.
  const seasonIds = recentSeasonIds(nhlSeasonId, WEIGHTS.length + 1)
  const [skaterMaps, goalieMaps, takenNames] = await Promise.all([
    Promise.all(seasonIds.map(id => fetchNhlSkatersByNhlId(2, id))),
    Promise.all(seasonIds.map(id => fetchNhlGoaliesByNhlId(2, id))),
    fetchTakenNames(),
  ])

  // Index 1 = saison précédant la saison active (ex: 2025-26) — la "saison dernière" au sens
  // usuel, peu importe où en est la saison courante (contrairement à la tendance, ce n'est pas
  // filtré par un seuil de matchs : c'est un vrai total, pas un rythme extrapolé).
  const players: ProjectionRow[] = Array.from(byPlayer.values()).map(p => {
    const trend = p.isGoalie ? computeGoalieTrend(p.nhlId, goalieMaps) : computeSkaterTrend(p.nhlId, skaterMaps)
    const available = !takenNames.has(normName(`${p.firstName} ${p.lastName}`))
    const lastSeason = p.nhlId == null ? undefined
      : p.isGoalie ? goalieMaps[1]?.get(p.nhlId)
      : skaterMaps[1]?.get(p.nhlId)
    const lastSeasonValue = lastSeason == null ? null
      : p.isGoalie ? (lastSeason as NhlGoalieStat).wins
      : (lastSeason as NhlSkaterStat).goals + (lastSeason as NhlSkaterStat).assists
    return {
      ...p, available, lastSeasonValue,
      trend: trend?.projected ?? null,
      trendSeasons: trend?.seasonsUsed ?? 0,
      trendPerGame: trend?.perGame ?? null,
      trendGames: trend?.gamesUsed ?? 0,
      trendDirection: trend?.direction ?? null,
    }
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ProjectionsTable players={players} season={poolSeason} />
    </div>
  )
}
