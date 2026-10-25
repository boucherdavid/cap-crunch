import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getStandings } from '@/lib/standings'
import { dayRange, yesterdayET } from '@/lib/dateRanges'
import { getTodayET } from '@/lib/daily-recap'
import ClassementTable from '../ClassementTable'
import PeriodSelector from '../PeriodSelector'
import DayNav from './DayNav'

export const metadata = { title: 'Classement quotidien' }
export const dynamic = 'force-dynamic'

// Classement d'une journée (David, 2026-10-25) — points officiels (player_game_logs, import de
// nuit vers 2 h ET) ; par défaut hier. Le pointage non officiel de la soirée reste sur /en-direct.
export default async function ClassementQuotidienPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string }>
}) {
  const { jour } = await searchParams
  const supabase = await createClient()

  const { data: season } = await supabase
    .from('pool_seasons')
    .select('id, season')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .single()

  if (!season) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Titre : bandeau de section du layout (SectionEyebrow, Navbar.tsx). */}
        <p className="text-gray-500">Aucune saison active.</p>
      </div>
    )
  }

  const today = getTodayET()
  const day = jour && /^\d{4}-\d{2}-\d{2}$/.test(jour) && jour <= today ? jour : yesterdayET()
  const standings = await getStandings(season.id, dayRange(day))
  const anyGame = standings.some(s => s.players.some(p => p.gamesPlayed > 0))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm text-gray-500">
            Saison {season.season}{' '}&middot; Points officiels des joueurs actifs
          </p>
        </div>
        <PeriodSelector active="quotidien" />
      </div>
      <DayNav day={day} />
      <div className="mt-4">
        {anyGame ? (
          <ClassementTable standings={standings} onlyPlayed />
        ) : (
          <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-500">
            {day >= yesterdayET() ? (
              <>
                Aucun point officiel pour cette journée pour le moment. Les points d&apos;une soirée sont
                importés pendant la nuit, vers 2 h (heure de l&apos;Est) ; en attendant, suis-la dans{' '}
                <Link href="/en-direct" className="text-blue-600 hover:underline">En direct</Link>.
              </>
            ) : (
              'Aucun joueur actif du pool n’a joué cette journée-là.'
            )}
          </div>
        )}
      </div>
    </div>
  )
}
