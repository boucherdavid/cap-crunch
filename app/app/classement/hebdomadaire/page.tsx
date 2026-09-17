import { createClient } from '@/lib/supabase/server'
import { buildStandings } from '@/lib/standings'
import { currentMondayET, mondayOfWeek, weekRange } from '@/lib/dateRanges'
import ClassementTable from '../ClassementTable'
import WeekNav from './WeekNav'

export const metadata = { title: 'Classement hebdomadaire' }
export const dynamic = 'force-dynamic'

export default async function ClassementHebdoPage({
  searchParams,
}: {
  searchParams: Promise<{ semaine?: string }>
}) {
  const { semaine } = await searchParams
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
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Classement hebdomadaire</h1>
        <p className="text-gray-500">Aucune saison active.</p>
      </div>
    )
  }

  const monday = semaine && /^\d{4}-\d{2}-\d{2}$/.test(semaine) ? mondayOfWeek(semaine) : currentMondayET()
  const standings = await buildStandings(supabase, season.id, weekRange(monday))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Classement hebdomadaire</h1>
      <p className="text-sm text-gray-500 mb-4">
        Saison {season.season} &middot; Joueurs actifs, réservistes et LTIR
      </p>
      <WeekNav monday={monday} />
      <div className="mt-4">
        <ClassementTable standings={standings} />
      </div>
    </div>
  )
}
