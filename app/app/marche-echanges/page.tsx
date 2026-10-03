import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadTradeMarket } from '@/lib/tradeMarket'
import { todayET } from '@/lib/nhlWeeklySchedule'
import MarcheEchangesClient from './MarcheEchangesClient'

export const metadata = { title: 'Marché des échanges' }
export const dynamic = 'force-dynamic'

export default async function MarcheEchangesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: saison } = await supabase
    .from('pool_seasons').select('id, season')
    .eq('is_active', true).eq('is_playoff', false).single()

  if (!saison) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Marché des échanges</h1>
        <p className="text-gray-500">Aucune saison active.</p>
      </div>
    )
  }

  const { listings, requests } = await loadTradeMarket(saison.id)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Marché des échanges</h1>
      <p className="text-sm text-gray-500 mb-6">
        Mets sur le marché les joueurs et les choix de repêchage que tu es prêt à échanger, ou publie ce que tu cherches.
        Les autres poolers sont avertis par notification et peuvent te faire une offre en un clic.
      </p>
      <MarcheEchangesClient
        saisonId={saison.id}
        selfPoolerId={user.id}
        today={todayET()}
        listings={listings}
        requests={requests}
      />
    </div>
  )
}
