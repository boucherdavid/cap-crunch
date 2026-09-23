import { createClient } from '@/lib/supabase/server'
import CalendrierClient from './CalendrierClient'
import { todayET, fetchWeek, type Game, type DaySchedule } from '@/lib/nhlWeeklySchedule'

export const metadata = { title: 'Calendrier LNH' }
export const dynamic = 'force-dynamic'

export type { Game, DaySchedule }

export default async function CalendrierPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string }>
}) {
  const { jour } = await searchParams
  const today = todayET()
  const selectedDay = jour ?? today

  const week = await fetchWeek(selectedDay)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let myRoster: { name: string; position: string; teamCode: string }[] = []
  let mySeriesRoster: { name: string; position: string; teamCode: string }[] = []
  let hasPlayoffSeason = false

  if (user) {
    const [{ data: activeSeason }, { data: playoffSeason }] = await Promise.all([
      supabase.from('pool_seasons').select('id').eq('is_active', true).eq('is_playoff', false).single(),
      supabase.from('pool_seasons').select('id').eq('is_active', true).eq('is_playoff', true).maybeSingle(),
    ])

    hasPlayoffSeason = !!playoffSeason

    const [orgRows, seriesRows] = await Promise.all([
      activeSeason
        ? supabase
            .from('pooler_rosters')
            .select('player_type, players (first_name, last_name, position, teams (code))')
            .eq('pooler_id', user.id)
            .eq('pool_season_id', activeSeason.id)
            .eq('player_type', 'actif')
            .eq('is_active', true)
        : Promise.resolve({ data: null }),
      playoffSeason
        ? supabase
            .from('playoff_pool_rosters')
            .select('players (first_name, last_name, position, teams (code))')
            .eq('pooler_id', user.id)
            .eq('pool_season_id', playoffSeason.id)
            .eq('is_active', true)
        : Promise.resolve({ data: null }),
    ])

    myRoster = ((orgRows as { data: unknown[] | null })?.data ?? []).flatMap((r: unknown) => {
      const p = (r as { players: unknown }).players as {
        first_name: string; last_name: string; position: string | null
        teams: { code: string } | null
      } | null
      if (!p?.teams?.code) return []
      return [{ name: `${p.last_name}, ${p.first_name}`, position: p.position ?? '', teamCode: p.teams.code }]
    })

    mySeriesRoster = ((seriesRows as { data: unknown[] | null })?.data ?? []).flatMap((r: unknown) => {
      const p = (r as { players: unknown }).players as {
        first_name: string; last_name: string; position: string | null
        teams: { code: string } | null
      } | null
      if (!p?.teams?.code) return []
      return [{ name: `${p.last_name}, ${p.first_name}`, position: p.position ?? '', teamCode: p.teams.code }]
    })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <CalendrierClient
        week={week}
        today={today}
        selectedDay={selectedDay}
        myRoster={myRoster}
        mySeriesRoster={mySeriesRoster}
        hasPlayoffSeason={hasPlayoffSeason}
      />
    </div>
  )
}
