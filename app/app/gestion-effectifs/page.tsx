import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GestionEffectifsManager from './GestionEffectifsManager'
import WatchlistPanel from '@/components/WatchlistPanel'

export const metadata = { title: 'Gestion d\'effectifs' }
export const dynamic = 'force-dynamic'

export default async function GestionEffectifsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; avec?: string; recoit?: string }>
}) {
  const { tab, avec, recoit } = await searchParams
  // « Faire une offre » depuis le marché des échanges : pooler visé et élément demandé.
  const tradePrefill = avec ? { targetId: avec, receiveKey: recoit } : undefined
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: pooler }, { data: saison }] = await Promise.all([
    supabase.from('poolers').select('id, name, is_admin').eq('id', user.id).single(),
    supabase.from('pool_seasons')
      .select('id, season, pool_cap, delai_reactivation_jours, max_signatures_al, max_signatures_ltir, gestion_effectifs_ouvert, season_started, is_playoff')
      .eq('is_active', true).eq('is_playoff', false).single(),
  ])

  if (!pooler) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-gray-500">Ton compte n&apos;est pas lié à un pooler.</p>
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
  const seasonStarted = saison.season_started ?? true
  const toolOuvert = saison.gestion_effectifs_ouvert ?? true

  // Pré-saison (David, 2026-10-03) : seul l'onglet Échanges est ouvert aux poolers — les autres
  // ajustements se font dans le hub des agents libres jusqu'au démarrage de la saison.
  if (!isAdmin && !seasonStarted) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Gestion d&apos;effectifs</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800 my-4">
          La saison n&apos;a pas encore démarré : seuls les échanges sont ouverts. Pour activer, mettre en réserve ou libérer
          un joueur, utilise <a href="/repechage-agents-libres" className="font-medium underline">Signatures des agents libres</a>.
          Un échange approuvé n&apos;exige pas encore un alignement conforme : ce sera le cas au démarrage de la saison.
        </div>
        <GestionEffectifsManager
          isAdmin={false}
          tradesOnly
          initialTab="echanges"
          tradePrefill={tradePrefill}
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

  if (!isAdmin && !toolOuvert) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Gestion d&apos;effectifs</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5 text-sm text-yellow-800">
          L&apos;outil de gestion d&apos;effectifs est temporairement fermé. Contacte l&apos;administrateur pour plus d&apos;informations.
        </div>
      </div>
    )
  }

  return (
    <div className={`${isAdmin ? '' : 'max-w-6xl'} mx-auto px-4 py-8`}>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Gestion d&apos;effectifs</h1>
      <p className="text-sm text-gray-500 mb-6">
        Ajoute une ou plusieurs actions, vérifie l&apos;état projeté, puis soumets le tout en une seule opération.
      </p>
      {/* Listes privées d'agents libres (David, 2026-09-27) — repliées par défaut ici. */}
      <WatchlistPanel kinds={['joueurs']} defaultOpen={false} />
      <GestionEffectifsManager
        isAdmin={isAdmin}
        initialTab={tab === 'ballotage' ? 'ballotage' : tab === 'echanges' ? 'echanges' : 'mouvements'}
        tradePrefill={tradePrefill}
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
