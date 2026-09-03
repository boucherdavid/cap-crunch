import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loadPresaisonDataAction, loadPresaisonDraftStateAction } from '../admin/presaison/actions'
import AgentsLibresDashboard from './AgentsLibresDashboard'

export const metadata = { title: 'Repêchage — Agents libres' }
export const dynamic = 'force-dynamic'

export default async function AgentsLibresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('poolers').select('id, name, is_admin').eq('id', user.id).single()
  if (!me) redirect('/')

  const { data: saison } = await supabase
    .from('pool_seasons')
    .select('id, season')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .maybeSingle()

  if (!saison) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Repêchage — Agents libres</h1>
        <p className="text-gray-400">Aucune saison régulière active.</p>
      </div>
    )
  }

  const [dataResult, stateResult, recentResult] = await Promise.all([
    loadPresaisonDataAction(saison.id),
    loadPresaisonDraftStateAction(saison.id),
    supabase
      .from('transaction_items')
      .select(`
        id, player_id, to_pooler_id,
        players (first_name, last_name, position),
        poolers!transaction_items_to_pooler_id_fkey (name),
        transactions!inner (created_at, pool_season_id, notes)
      `)
      .eq('action_type', 'sign')
      .eq('transactions.pool_season_id', saison.id)
      .eq('transactions.notes', 'Repêchage pré-saison')
      .order('created_at', { referencedTable: 'transactions', ascending: false })
      .limit(15),
  ])

  if (dataResult.error || !dataResult.poolers) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Repêchage — Agents libres</h1>
        <p className="text-red-500 text-sm">{dataResult.error ?? 'Erreur de chargement.'}</p>
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentPicks = ((recentResult.data ?? []) as any[]).map(item => ({
    id: item.id as number,
    poolerName: (item.poolers?.name as string | undefined) ?? '?',
    playerName: item.players ? `${item.players.last_name}, ${item.players.first_name}` : '?',
    position: (item.players?.position as string | null) ?? null,
    at: (item.transactions?.created_at as string | undefined) ?? new Date().toISOString(),
  }))

  return (
    <AgentsLibresDashboard
      me={{ id: me.id, name: me.name, isAdmin: me.is_admin }}
      poolers={dataResult.poolers}
      poolCap={dataResult.poolCap ?? 0}
      draftState={stateResult.state ?? {
        is_active: false, queue: [],
        turn_started_at: null, turn_duration_seconds: 90, ended_at: null,
      }}
      recentPicks={recentPicks}
      saisonId={saison.id}
      season={saison.season}
    />
  )
}
