import { createClient } from '@/lib/supabase/server'
import SimulationTool from './SimulationTool'

export const metadata = { title: 'Simulation' }
export const dynamic = 'force-dynamic'

export default async function SimulationPage({
  searchParams,
}: {
  searchParams: Promise<{ addPlayer?: string }>
}) {
  const { addPlayer } = await searchParams
  const preloadPlayerId = addPlayer && /^\d+$/.test(addPlayer) ? Number(addPlayer) : undefined
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: me } = user
    ? await supabase.from('poolers').select('id, name').eq('id', user.id).single()
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <SimulationTool
        me={me}
        saisonId={saison.id}
        season={saison.season}
        preloadPlayerId={preloadPlayerId}
      />
    </div>
  )
}
