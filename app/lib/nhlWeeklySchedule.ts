/**
 * Utilitaire partagé — calendrier LNH glissant sur 7 jours + alignement d'un pooler pour
 * cette fenêtre. Utilisé par `/calendrier` (onglet Matchs) et par l'onglet "Prochains matchs"
 * de `/poolers/[id]` (David, 2026-09-23 — ex-onglet "Analyse" de /calendrier, déplacé sur la
 * page d'alignement puisque c'est une analyse propre à un alignement, pas au calendrier LNH
 * général).
 */

import { createClient } from '@/lib/supabase/server'

export type Game = {
  id: number
  date: string
  awayAbbrev: string
  homeAbbrev: string
  awayScore: number | null
  homeScore: number | null
  startTimeUTC: string
  gameState: string
  gameType: number
}

export type DaySchedule = { date: string; games: Game[] }

export type OrgPlayer = {
  name: string
  position: string
  teamCode: string
  playerType: 'actif' | 'reserviste' | 'recrue'
}

export function todayET(): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export async function fetchWeek(date: string): Promise<DaySchedule[]> {
  try {
    const res = await fetch(
      `https://api-web.nhle.com/v1/schedule/${date}`,
      { next: { revalidate: 300 } },
    )
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.gameWeek ?? []).map((day: any) => ({
      date: day.date as string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      games: (day.games ?? []).map((g: any) => ({
        id: g.id,
        date: day.date as string,
        awayAbbrev: g.awayTeam?.abbrev ?? '',
        homeAbbrev: g.homeTeam?.abbrev ?? '',
        awayScore: g.awayTeam?.score ?? null,
        homeScore: g.homeTeam?.score ?? null,
        startTimeUTC: g.startTimeUTC ?? '',
        gameState: g.gameState ?? 'FUT',
        gameType: g.gameType ?? 2,
      })),
    }))
  } catch {
    return []
  }
}

/** Les 7 prochains jours calendaires (à partir d'aujourd'hui, heure de l'Est), toutes équipes. */
export async function fetchSchedule7(today: string): Promise<DaySchedule[]> {
  const [weekToday, weekNext] = await Promise.all([
    fetchWeek(today),
    fetchWeek(addDays(today, 7)),
  ])

  const todayDate = new Date(today + 'T12:00:00')
  const limitDate = new Date(todayDate)
  limitDate.setDate(limitDate.getDate() + 7)

  const seen = new Set<string>()
  const schedule7: DaySchedule[] = []
  for (const day of [...weekToday, ...weekNext]) {
    const d = new Date(day.date + 'T12:00:00')
    if (d >= todayDate && d < limitDate && !seen.has(day.date)) {
      seen.add(day.date)
      schedule7.push(day)
    }
  }
  schedule7.sort((a, b) => a.date.localeCompare(b.date))
  return schedule7
}

/** Actifs/réservistes/recrues d'un pooler pour une saison — utilisé pour l'analyse
 * "combien de matchs pour mes joueurs" (pas les LTIR, qui ne jouent pas). */
export async function fetchOrgPlayersForPooler(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolerId: string,
  activeSeasonId: number,
): Promise<OrgPlayer[]> {
  const { data } = await supabase
    .from('pooler_rosters')
    .select('player_type, players (first_name, last_name, position, teams (code))')
    .eq('pooler_id', poolerId)
    .eq('pool_season_id', activeSeasonId)
    .in('player_type', ['actif', 'reserviste', 'recrue'])
    .eq('is_active', true)

  return (data ?? []).flatMap(r => {
    const p = r.players as unknown as {
      first_name: string; last_name: string; position: string | null
      teams: { code: string } | null
    } | null
    if (!p?.teams?.code) return []
    return [{
      name: `${p.last_name}, ${p.first_name}`,
      position: p.position ?? '',
      teamCode: p.teams.code,
      playerType: r.player_type as 'actif' | 'reserviste' | 'recrue',
    }]
  })
}
