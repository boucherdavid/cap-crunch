import { createClient } from '@/lib/supabase/server'
import SimulationTool from './SimulationTool'

export const metadata = { title: 'Simulation' }
export const dynamic = 'force-dynamic'

export default async function SimulationPage({
  searchParams,
}: {
  searchParams: Promise<{ addPlayer?: string; onglet?: string; avec?: string; recoit?: string }>
}) {
  const { addPlayer, onglet, avec, recoit } = await searchParams
  const preloadPlayerId = addPlayer && /^\d+$/.test(addPlayer) ? Number(addPlayer) : undefined
  // Fiche joueur → « Simuler une transaction » (David, 2026-10-19) : onglet Transaction ouvert
  // avec ce pooler, et son joueur déjà envoyé chez moi.
  const preloadTrade = onglet === 'transaction' && avec && recoit && /^\d+$/.test(recoit)
    ? { otherId: avec, playerId: Number(recoit) }
    : undefined
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: me } = user
    ? await supabase.from('poolers').select('id, name, is_admin').eq('id', user.id).single()
    : { data: null }

  const { data: saison } = await supabase
    .from('pool_seasons')
    .select('id, season')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .single()

  if (!me || !saison) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-gray-400 text-sm">Aucune saison active pour le moment.</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <SimulationTool
        me={{ id: me.id, name: me.name }}
        isAdmin={!!me.is_admin}
        saisonId={saison.id}
        season={saison.season}
        preloadPlayerId={preloadPlayerId}
        preloadTrade={preloadTrade}
      />
    </div>
  )
}
