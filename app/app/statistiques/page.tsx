import StatsTable from './StatsTable'
import { createClient } from '@/lib/supabase/server'
import { fetchStreaks, DEFAULT_INDICATOR_CONFIG, type StreakInfo } from '@/lib/streaks'

export const metadata = { title: 'Statistiques LNH' }
export const dynamic = 'force-dynamic'

import { NHL_SEASON, fetchActiveNhlSeasonId } from '@/lib/nhl-stats'
const REST = 'https://api.nhle.com/stats/rest/en'

export type SkaterStat = {
  id: number
  firstName: string
  lastName: string
  teamAbbrev: string   // "MTL", "2 TM", etc.
  position: string
  gamesPlayed: number
  goals: number
  assists: number
  points: number
  toi: number          // secondes par match
}

export type GoalieStat = {
  id: number
  firstName: string
  lastName: string
  teamAbbrev: string
  gamesStarted: number
  wins: number
  losses: number
  otLosses: number
  shutouts: number
  goals: number
  assists: number
  savePct: number      // ex: 0.920
  gaa: number          // buts alloués par match
}

/** "20:45" ou "20:45.123" → secondes */
function parseTOI(val: unknown): number {
  if (!val) return 0
  if (typeof val === 'number') return val
  const parts = String(val).split(':')
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1])
  return 0
}


/** "Connor McDavid" → { firstName: "Connor", lastName: "McDavid" } */
function splitName(full: string): { firstName: string; lastName: string } {
  const i = full.indexOf(' ')
  if (i < 0) return { firstName: full, lastName: '' }
  return { firstName: full.slice(0, i), lastName: full.slice(i + 1) }
}

// isAggregate=false → une ligne par joueur par équipe → on garde le code équipe
// puis on agrège manuellement pour les joueurs échangés en cours de saison
function buildUrl(type: 'skater' | 'goalie', gameType: number, nhlSeason = NHL_SEASON): string {
  const cayenne = `gameTypeId=${gameType} and seasonId<=${nhlSeason} and seasonId>=${nhlSeason}`
  return (
    `${REST}/${type}/summary` +
    `?isAggregate=false&isGame=false` +
    `&start=0&limit=-1` +
    `&factCayenneExp=${encodeURIComponent('gamesPlayed>=1')}` +
    `&cayenneExp=${encodeURIComponent(cayenne)}`
  )
}

type Row = Record<string, unknown>

async function fetchSkaters(gameType: number, nhlSeason = NHL_SEASON): Promise<SkaterStat[]> {
  try {
    const res = await fetch(buildUrl('skater', gameType, nhlSeason), { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const rows = ((await res.json()).data as Row[]) ?? []

    // Grouper par playerId pour agréger les joueurs échangés
    const byPlayer = new Map<number, Row[]>()
    for (const p of rows) {
      const id = Number(p.playerId)
      if (!byPlayer.has(id)) byPlayer.set(id, [])
      byPlayer.get(id)!.push(p)
    }

    return Array.from(byPlayer.values())
      .map(entries => {
        // Entrée principale = celle avec le plus de matchs joués
        entries.sort((a, b) => Number(b.gamesPlayed ?? 0) - Number(a.gamesPlayed ?? 0))
        const main = entries[0]!
        const { firstName, lastName } = splitName(String(main.skaterFullName ?? ''))

        const totalGP    = entries.reduce((s, e) => s + Number(e.gamesPlayed ?? 0), 0)
        const totalGoals = entries.reduce((s, e) => s + Number(e.goals ?? 0), 0)
        const totalAst   = entries.reduce((s, e) => s + Number(e.assists ?? 0), 0)
        const totalPts   = entries.reduce((s, e) => s + Number(e.points ?? 0), 0)
        // TOI pondéré par matchs joués
        const totalTOI   = entries.reduce(
          (s, e) => s + parseTOI(e.timeOnIcePerGame) * Number(e.gamesPlayed ?? 0), 0,
        )

        const teamAbbrev = entries.length > 1
          ? `${entries.length} TM`
          : String(main.teamAbbrevs ?? '')

        return {
          id: Number(main.playerId),
          firstName,
          lastName,
          teamAbbrev,
          position: String(main.positionCode ?? ''),
          gamesPlayed: totalGP,
          goals: totalGoals,
          assists: totalAst,
          points: totalPts,
          toi: totalGP > 0 ? totalTOI / totalGP : 0,
        }
      })
      .sort((a, b) => b.points - a.points || b.goals - a.goals || a.lastName.localeCompare(b.lastName))
  } catch {
    return []
  }
}

async function fetchGoalies(gameType: number, nhlSeason = NHL_SEASON): Promise<GoalieStat[]> {
  try {
    const res = await fetch(buildUrl('goalie', gameType, nhlSeason), { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const rows = ((await res.json()).data as Row[]) ?? []

    const byPlayer = new Map<number, Row[]>()
    for (const p of rows) {
      const id = Number(p.playerId)
      if (!byPlayer.has(id)) byPlayer.set(id, [])
      byPlayer.get(id)!.push(p)
    }

    return Array.from(byPlayer.values())
      .map(entries => {
        entries.sort((a, b) => Number(b.gamesStarted ?? 0) - Number(a.gamesStarted ?? 0))
        const main = entries[0]!
        const { firstName, lastName } = splitName(String(main.goalieFullName ?? ''))
        const teamAbbrev = entries.length > 1
          ? `${entries.length} TM`
          : String(main.teamAbbrevs ?? '')

        return {
          id: Number(main.playerId),
          firstName,
          lastName,
          teamAbbrev,
          gamesStarted: entries.reduce((s, e) => s + Number(e.gamesStarted ?? 0), 0),
          wins:         entries.reduce((s, e) => s + Number(e.wins ?? 0), 0),
          losses:       entries.reduce((s, e) => s + Number(e.losses ?? 0), 0),
          otLosses:     entries.reduce((s, e) => s + Number(e.otLosses ?? 0), 0),
          shutouts:     entries.reduce((s, e) => s + Number(e.shutouts ?? 0), 0),
          goals:        entries.reduce((s, e) => s + Number(e.goals ?? 0), 0),
          assists:      entries.reduce((s, e) => s + Number(e.assists ?? 0), 0),
          savePct:      Number(main.savePct ?? 0),
          gaa:          Number(main.goalsAgainstAverage ?? 0),
        }
      })
      .sort((a, b) => b.wins - a.wins || b.shutouts - a.shutouts || a.lastName.localeCompare(b.lastName))
  } catch {
    return []
  }
}

/** Noms normalisés */
function normName(s: string) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/-/g, ' ').trim()
}

/** Map nom normalisé → code équipe actuel (DB) */
async function fetchCurrentTeamMap(): Promise<Map<string, string>> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('players')
      .select('first_name, last_name, teams(code)')
      .not('team_id', 'is', null)
    const map = new Map<string, string>()
    for (const p of data ?? []) {
      const t = p.teams as unknown as { code: string } | null
      if (t?.code) map.set(normName(`${p.first_name} ${p.last_name}`), t.code)
    }
    return map
  } catch {
    return new Map()
  }
}

/** Noms normalisés des joueurs sur un contrat ELC */
async function fetchRookieNames(): Promise<string[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('players')
      .select('first_name, last_name')
      .eq('status', 'ELC')
    return (data ?? []).map(p => normName(`${p.first_name} ${p.last_name}`))
  } catch {
    return []
  }
}

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

// Retourne nom normalisé → liste des poolers qui ont sélectionné ce joueur
// (plusieurs poolers peuvent choisir le même joueur dans le pool des séries)
async function fetchPlayoffPicksMap(): Promise<Record<string, string[]>> {
  try {
    const supabase = await createClient()
    const { data: season } = await supabase
      .from('pool_seasons')
      .select('id')
      .eq('is_active', true)
      .eq('is_playoff', true)
      .single()
    if (!season) return {}

    const { data: round } = await supabase
      .from('playoff_rounds')
      .select('id')
      .eq('pool_season_id', season.id)
      .eq('is_active', true)
      .single()
    if (!round) return {}

    const { data: picks } = await supabase
      .from('series_round_rosters')
      .select('players (first_name, last_name), poolers (name)')
      .eq('round_id', round.id)
      .eq('is_active', true)

    const map: Record<string, string[]> = {}
    for (const pick of picks ?? []) {
      const player = pick.players as unknown as { first_name: string; last_name: string } | null
      const pooler = pick.poolers as unknown as { name: string } | null
      if (player && pooler) {
        const key = normName(`${player.first_name} ${player.last_name}`)
        if (!map[key]) map[key] = []
        map[key].push(pooler.name)
      }
    }
    return map
  } catch {
    return {}
  }
}

type PlayerNhlRow = { nhl_id: number | null; position: string }

async function fetchStreaksForStats(gameType: number, nhlSeason = NHL_SEASON): Promise<Record<number, StreakInfo>> {
  try {
    const supabase = await createClient()

    if (gameType === 2) {
      const { data: season } = await supabase
        .from('pool_seasons')
        .select('id, indicator_streak_chaud, indicator_streak_forme, indicator_streak_froid, indicator_streak_crise, indicator_fenetre_tendance, indicator_goalie_wins_streak, indicator_goalie_sv_pct, indicator_goalie_gaa, indicator_goalie_min_games')
        .eq('is_active', true)
        .eq('is_playoff', false)
        .single()
      if (!season) return {}

      const s = season as any
      const config = {
        streakChaud:          s.indicator_streak_chaud          ?? DEFAULT_INDICATOR_CONFIG.streakChaud,
        streakForme:          s.indicator_streak_forme          ?? DEFAULT_INDICATOR_CONFIG.streakForme,
        streakFroid:          s.indicator_streak_froid          ?? DEFAULT_INDICATOR_CONFIG.streakFroid,
        streakCrise:          s.indicator_streak_crise          ?? DEFAULT_INDICATOR_CONFIG.streakCrise,
        fenetreTendance:      s.indicator_fenetre_tendance      ?? DEFAULT_INDICATOR_CONFIG.fenetreTendance,
        goalieWinsStreak:     s.indicator_goalie_wins_streak    ?? DEFAULT_INDICATOR_CONFIG.goalieWinsStreak,
        goalieSvPctThreshold: s.indicator_goalie_sv_pct         ?? DEFAULT_INDICATOR_CONFIG.goalieSvPctThreshold,
        goalieGaaThreshold:   s.indicator_goalie_gaa            ?? DEFAULT_INDICATOR_CONFIG.goalieGaaThreshold,
        goalieMinGames:       s.indicator_goalie_min_games      ?? DEFAULT_INDICATOR_CONFIG.goalieMinGames,
      }

      const { data: rosters } = await supabase
        .from('pooler_rosters')
        .select('players(nhl_id, position)')
        .eq('pool_season_id', season.id)
        .in('player_type', ['actif', 'reserviste'])

      const players = (rosters ?? [])
        .map(r => r.players as unknown as PlayerNhlRow | null)
        .filter(Boolean)
        .map(p => ({ nhlId: p!.nhl_id, isGoalie: p!.position === 'G' }))

      const map = await fetchStreaks(players, 2, config, 5, nhlSeason)
      const result: Record<number, StreakInfo> = {}
      map.forEach((v, k) => { result[k] = v })
      return result
    } else {
      const { data: season } = await supabase
        .from('pool_seasons')
        .select('id')
        .eq('is_active', true)
        .eq('is_playoff', true)
        .single()
      if (!season) return {}

      const { data: round } = await supabase
        .from('playoff_rounds')
        .select('id')
        .eq('pool_season_id', season.id)
        .eq('is_active', true)
        .single()
      if (!round) return {}

      const { data: picks } = await supabase
        .from('series_round_rosters')
        .select('players(nhl_id, position)')
        .eq('round_id', round.id)
        .eq('is_active', true)

      const seen = new Map<number, { nhlId: number; isGoalie: boolean }>()
      for (const r of picks ?? []) {
        const p = r.players as unknown as PlayerNhlRow | null
        if (p?.nhl_id && !seen.has(p.nhl_id))
          seen.set(p.nhl_id, { nhlId: p.nhl_id, isGoalie: p.position === 'G' })
      }

      const map = await fetchStreaks([...seen.values()], 3, DEFAULT_INDICATOR_CONFIG, 5, nhlSeason)
      const result: Record<number, StreakInfo> = {}
      map.forEach((v, k) => { result[k] = v })
      return result
    }
  } catch {
    return {}
  }
}

export default async function StatistiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ saison?: string }>
}) {
  const { saison } = await searchParams
  const gameType = saison === 'series' ? 3 : 2

  // Saison NHL active (lue depuis pool_seasons — évite de hardcoder 20252026)
  const nhlSeason = await fetchActiveNhlSeasonId(gameType === 3)

  const [skaters, goalies, takenNames, rookieNames, currentTeamMap, playoffPicksMap, streaksMap] = await Promise.all([
    fetchSkaters(gameType, nhlSeason),
    fetchGoalies(gameType, nhlSeason),
    fetchTakenNames(),
    fetchRookieNames(),
    fetchCurrentTeamMap(),
    gameType === 3 ? fetchPlayoffPicksMap() : Promise.resolve({} as Record<string, string[]>),
    Promise.race([
      fetchStreaksForStats(gameType, nhlSeason),
      new Promise<Record<number, StreakInfo>>(resolve => setTimeout(() => resolve({}), 5000)),
    ]),
  ])

  // Replace multi-team abbrevs ("2 TM", "ANA,CGY", etc.) with the player's current team from DB
  const isMultiTeam = (abbrev: string) => /^\d TM$/.test(abbrev) || abbrev.includes(',')
  for (const s of skaters) {
    if (isMultiTeam(s.teamAbbrev)) {
      const key = normName(`${s.firstName} ${s.lastName}`)
      s.teamAbbrev = currentTeamMap.get(key) ?? s.teamAbbrev
    }
  }
  for (const g of goalies) {
    if (isMultiTeam(g.teamAbbrev)) {
      const key = normName(`${g.firstName} ${g.lastName}`)
      g.teamAbbrev = currentTeamMap.get(key) ?? g.teamAbbrev
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <StatsTable
        skaters={skaters}
        goalies={goalies}
        takenNames={takenNames}
        rookieNames={rookieNames}
        gameMode={saison === 'series' ? 'series' : 'regular'}
        playoffPicksMap={playoffPicksMap}
        streaksMap={streaksMap}
      />
    </div>
  )
}
