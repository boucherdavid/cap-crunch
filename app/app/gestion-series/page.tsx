import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GestionSeriesManager from './GestionSeriesManager'
import { getPlayoffPoolSaisonAction } from './playoff-pool-actions'

export const metadata = { title: 'Gestion d\'effectifs — Séries' }
export const dynamic = 'force-dynamic'

export default async function GestionSeriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pooler } = await supabase
    .from('poolers').select('id, name, is_admin').eq('id', user.id).single()
  if (!pooler) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-gray-500">Ton compte n&apos;est pas lié à un pooler.</p>
      </div>
    )
  }

  const saison = await getPlayoffPoolSaisonAction()
  if (!saison) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Pool des séries</h1>
        <p className="text-gray-500">Aucune saison de séries active.</p>
      </div>
    )
  }

  const isAdmin = pooler.is_admin ?? false

  if (!isAdmin && !saison.gestionOuverte) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Pool des séries</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5 text-sm text-yellow-800">
          L&apos;outil de gestion des séries est temporairement indisponible.
        </div>
      </div>
    )
  }

  const poolersData = isAdmin
    ? await supabase.from('poolers').select('id, name').order('name')
    : { data: null }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Pool des séries — {saison.season}</h1>
      <p className="text-sm text-gray-500 mb-6">Composition requise : {saison.maxF}F / {saison.maxD}D / {saison.maxG}G</p>
      <GestionSeriesManager
        isAdmin={isAdmin}
        poolers={isAdmin ? (poolersData.data ?? []) : undefined}
        selfPoolerId={pooler.id}
        selfPoolerName={pooler.name}
        saison={saison}
      />
    </div>
  )
}
