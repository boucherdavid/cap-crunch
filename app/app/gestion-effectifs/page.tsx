import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GestionEffectifsManager from './GestionEffectifsManager'

export const metadata = { title: 'Gestion d\'effectifs' }
export const dynamic = 'force-dynamic'

export default async function GestionEffectifsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: pooler }, { data: saison }] = await Promise.all([
    supabase.from('poolers').select('id, name, is_admin').eq('id', user.id).single(),
    supabase.from('pool_seasons')
      .select('id, season, pool_cap, delai_reactivation_jours, max_signatures_al, max_signatures_ltir, gestion_effectifs_ouvert, is_playoff')
      .eq('is_active', true).eq('is_playoff', false).single(),
  ])

  if (!pooler) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-gray-500">Votre compte n&apos;est pas lié à un pooler.</p>
      </div>
    )
  }

  if (!saison) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Gestion d&apos;effectifs</h1>
        <p className="text-gray-500">Aucune saison active.</p>
      </div>
    )
  }

  const isAdmin = pooler.is_admin ?? false
  const toolOuvert = saison.gestion_effectifs_ouvert ?? true

  if (!isAdmin && !toolOuvert) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Gestion d&apos;effectifs</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5 text-sm text-yellow-800">
          L&apos;outil de gestion d&apos;effectifs est temporairement indisponible. Contactez l&apos;administrateur pour plus d&apos;informations.
        </div>
      </div>
    )
  }

  return (
    <div className={`${isAdmin ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 py-8`}>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Gestion d&apos;effectifs</h1>
      <p className="text-sm text-gray-500 mb-6">
        Ajoutez une ou plusieurs actions, vérifiez l&apos;état projeté, puis soumettez en une seule opération.
      </p>
      <GestionEffectifsManager
        isAdmin={isAdmin}
        selfPoolerId={pooler.id}
        selfPoolerName={pooler.name}
        saisonId={saison.id}
        season={saison.season}
        poolCap={Number(saison.pool_cap)}
        delaiReactivationJours={saison.delai_reactivation_jours ?? 7}
        maxSignaturesAl={saison.max_signatures_al ?? 10}
        maxSignaturesLtir={saison.max_signatures_ltir ?? 2}
      />
    </div>
  )
}
