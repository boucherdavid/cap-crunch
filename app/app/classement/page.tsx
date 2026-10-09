import { createClient } from '@/lib/supabase/server'
import { buildStandings } from '@/lib/standings'
import ClassementTable from './ClassementTable'
import PeriodSelector from './PeriodSelector'

export const metadata = { title: 'Classement' }
export const dynamic = 'force-dynamic'

export default async function ClassementPage() {
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

  const standings = await buildStandings(supabase, season.id)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <p className="text-sm text-gray-500">
            Saison {season.season}{' '}&middot; Joueurs actifs, réservistes et LTIR
          </p>
        </div>
        <PeriodSelector active="saison" />
      </div>
      <ClassementTable standings={standings} />
    </div>
  )
}
