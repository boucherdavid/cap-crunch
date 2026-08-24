import { createClient } from '@/lib/supabase/server'
import TransactionsClient from './TransactionsClient'

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ saison?: string }>
}) {
  const { saison: saisonParam } = await searchParams
  const supabase = await createClient()

  const { data: saisons } = await supabase
    .from('pool_seasons')
    .select('id, season, is_active')
    .eq('is_playoff', false)
    // Une saison peut être masquée aux poolers (is_public=false) une fois inactive si son
    // historique n'est pas jugé présentable (ex: transition 2025-26 → 2026-27) — toujours
    // inclure la saison active elle-même, sinon elle disparaîtrait de son propre sélecteur.
    .or('is_public.eq.true,is_active.eq.true')
    .order('season', { ascending: false })

  if (!saisons || saisons.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Transactions</h1>
        <p className="text-gray-400">Aucune saison disponible.</p>
      </div>
    )
  }

  const activeSaison = saisons.find(s => s.is_active) ?? saisons[0]
  const selectedSaison = saisonParam
    ? (saisons.find(s => s.season === saisonParam) ?? activeSaison)
    : activeSaison

  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id, notes, created_at,
      transaction_items (
        id, action_type, old_player_type, new_player_type,
        from_pooler:poolers!from_pooler_id (name),
        to_pooler:poolers!to_pooler_id (name),
        players (id, first_name, last_name, position, teams (code)),
        pick:pool_draft_picks!pick_id (round, pool_seasons (season), original_owner:poolers!original_owner_id (name))
      )
    `)
    .eq('pool_season_id', selectedSaison.id)
    .order('created_at', { ascending: false })

  return (
    <TransactionsClient
      transactions={(transactions ?? []) as any[]}
      saison={selectedSaison}
      saisons={saisons}
      activeSaisonId={activeSaison.id}
    />
  )
}
