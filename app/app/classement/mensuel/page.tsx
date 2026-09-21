import { createClient } from '@/lib/supabase/server'
import { buildStandings } from '@/lib/standings'
import { currentMonthET, monthRange } from '@/lib/dateRanges'
import ClassementTable from '../ClassementTable'
import MonthNav from './MonthNav'

export const metadata = { title: 'Classement mensuel' }
export const dynamic = 'force-dynamic'

export default async function ClassementMensuelPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>
}) {
  const { mois } = await searchParams
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
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Classement mensuel</h1>
        <p className="text-gray-500">Aucune saison active.</p>
      </div>
    )
  }

  const month = mois && /^\d{4}-\d{2}$/.test(mois) ? mois : currentMonthET()
  const standings = await buildStandings(supabase, season.id, monthRange(month))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Classement mensuel</h1>
      <p className="text-sm text-gray-500 mb-4">
        Saison {season.season} &middot; Joueurs actifs, réservistes et LTIR
      </p>
      <MonthNav month={month} />
      <div className="mt-4">
        <ClassementTable standings={standings} />
      </div>
    </div>
  )
}
