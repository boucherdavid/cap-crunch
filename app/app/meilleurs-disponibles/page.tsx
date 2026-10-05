import { createClient } from '@/lib/supabase/server'
import { fetchActiveNhlSeasonId } from '@/lib/nhl-active-season'
import { fetchNhlGoaliesByNhlId, fetchNhlSkatersByNhlId, nhlSeasonLabel } from '@/lib/nhl-stats'
import { fetchTakenPlayers, isTakenPlayer } from '@/lib/takenPlayers'
import { fetchInjuriesByNhlId, type InjuryInfo } from '@/lib/injuries'
import MeilleursDisponibles from './MeilleursDisponibles'

export const metadata = { title: 'Meilleurs joueurs disponibles' }
export const dynamic = 'force-dynamic'

export type AvailableRow = {
  nhlId: number
  firstName: string
  lastName: string
  teamAbbrev: string
  gamesPlayed: number
  /** Patineurs : buts/passes. Gardiens : buts/passes aussi (rares, mais comptés par le pool). */
  goals: number
  assists: number
  wins: number
  otLosses: number
  shutouts: number
  poolPoints: number
  capNumber: number
  injury: InjuryInfo | null
}

export type AvailableGroups = { forwards: AvailableRow[]; defense: AvailableRow[]; goalies: AvailableRow[] }

type Scoring = { goal: number; assist: number; goalie_win: number; goalie_otl: number; goalie_shutout: number }

/** Contrat réel de la saison active, par nhl_id — un joueur sans contrat n'est pas proposé
 * (David, 2026-10-05 : pas pertinent une fois la saison avancée). */
async function fetchCapByNhlId(supabase: Awaited<ReturnType<typeof createClient>>, season: string): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('player_contracts')
      .select('cap_number, players!inner(nhl_id)')
      .eq('season', season)
      .gt('cap_number', 0)
      .not('players.nhl_id', 'is', null)
      .order('id')
      .range(offset, offset + PAGE - 1)
    for (const r of data ?? []) {
      const nhlId = (r.players as unknown as { nhl_id: number | null } | null)?.nhl_id
      if (nhlId) map.set(nhlId, Number(r.cap_number))
    }
    if (!data || data.length < PAGE) break
  }
  return map
}

export default async function MeilleursDisponiblesPage({
  searchParams,
}: {
  searchParams: Promise<{ saison?: string }>
}) {
  const { saison } = await searchParams
  const supabase = await createClient()

  const [activeNhlSeason, { data: poolSeason }, { data: scoringRows }] = await Promise.all([
    fetchActiveNhlSeasonId(false),
    supabase.from('pool_seasons').select('season').eq('is_active', true).eq('is_playoff', false).maybeSingle(),
    supabase.from('scoring_config').select('stat_key, points').in('scope', ['regular', 'both']),
  ])

  const previousNhlSeason = String(Number(activeNhlSeason.slice(0, 4)) - 1) + activeNhlSeason.slice(0, 4)
  const usePrevious = saison === 'precedente'
  const nhlSeason = usePrevious ? previousNhlSeason : activeNhlSeason

  // Même pointage que buildStandings() (app/lib/standings.ts), mêmes valeurs par défaut.
  const sc: Record<string, number> = {}
  for (const r of scoringRows ?? []) sc[r.stat_key] = Number(r.points)
  const pts: Scoring = {
    goal: sc.goal ?? 1,
    assist: sc.assist ?? 1,
    goalie_win: sc.goalie_win ?? 2,
    goalie_otl: sc.goalie_otl ?? 1,
    goalie_shutout: sc.goalie_shutout ?? 2,
  }

  const [skaters, goalies, taken, capByNhlId, injuries] = await Promise.all([
    fetchNhlSkatersByNhlId(2, nhlSeason),
    fetchNhlGoaliesByNhlId(2, nhlSeason),
    fetchTakenPlayers(),
    poolSeason ? fetchCapByNhlId(supabase, poolSeason.season) : Promise.resolve(new Map<number, number>()),
    fetchInjuriesByNhlId(supabase),
  ])

  const takenIds = new Set(taken.nhlIds)
  const takenNames = new Set(taken.namesWithoutNhlId)
  const isCandidate = (nhlId: number, firstName: string, lastName: string) =>
    capByNhlId.has(nhlId) && !isTakenPlayer(takenIds, takenNames, nhlId, firstName, lastName)

  const groups: AvailableGroups = { forwards: [], defense: [], goalies: [] }
  for (const s of skaters.values()) {
    if (!isCandidate(s.playerId, s.firstName, s.lastName)) continue
    const row: AvailableRow = {
      nhlId: s.playerId,
      firstName: s.firstName,
      lastName: s.lastName,
      teamAbbrev: s.teamAbbrev,
      gamesPlayed: s.gamesPlayed,
      goals: s.goals,
      assists: s.assists,
      wins: 0,
      otLosses: 0,
      shutouts: 0,
      poolPoints: s.goals * pts.goal + s.assists * pts.assist,
      capNumber: capByNhlId.get(s.playerId) ?? 0,
      injury: injuries.get(s.playerId) ?? null,
    }
    if (s.position === 'D') groups.defense.push(row)
    else groups.forwards.push(row)
  }
  for (const g of goalies.values()) {
    if (!isCandidate(g.playerId, g.firstName, g.lastName)) continue
    groups.goalies.push({
      nhlId: g.playerId,
      firstName: g.firstName,
      lastName: g.lastName,
      teamAbbrev: g.teamAbbrev,
      gamesPlayed: g.gamesPlayed,
      goals: g.goals,
      assists: g.assists,
      wins: g.wins,
      otLosses: g.otLosses,
      shutouts: g.shutouts,
      poolPoints: g.goals * pts.goal + g.assists * pts.assist
        + g.wins * pts.goalie_win + g.otLosses * pts.goalie_otl + g.shutouts * pts.goalie_shutout,
      capNumber: capByNhlId.get(g.playerId) ?? 0,
      injury: injuries.get(g.playerId) ?? null,
    })
  }

  // Seuil du tri « par match » : 25 % des matchs du patineur qui en a joué le plus — évite qu'un
  // joueur à 1 match et 2 points passe devant tout le monde.
  const maxGames = Math.max(0, ...Array.from(skaters.values(), s => s.gamesPlayed))
  const minGamesPerGame = Math.max(1, Math.round(maxGames * 0.25))

  return (
    <MeilleursDisponibles
      groups={groups}
      seasonLabel={nhlSeasonLabel(nhlSeason)}
      activeSeasonLabel={nhlSeasonLabel(activeNhlSeason)}
      previousSeasonLabel={nhlSeasonLabel(previousNhlSeason)}
      usePrevious={usePrevious}
      contractSeason={poolSeason?.season ?? null}
      minGamesPerGame={minGamesPerGame}
      scoring={pts}
    />
  )
}
