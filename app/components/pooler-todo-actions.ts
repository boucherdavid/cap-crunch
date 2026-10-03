'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Ce qui attend une action du pooler connecté (David, 2026-10-03) — alimente l'indicateur de la
 * barre du haut, les pastilles du menu et des onglets de Gestion d'effectifs.
 *
 * Échanges : proposition reçue sans réponse, ou échange approuvé que le pooler n'a pas encore
 * confirmé. Une proposition envoyée qui attend l'autre pooler ne compte pas.
 * Ballotage : joueur remporté à ajouter à l'alignement (toujours compté), et joueurs au ballotage
 * ni réclamés ni refusés **libérés depuis la dernière visite de l'onglet Ballotage** (`seenSince`,
 * gardé dans le navigateur) — comme un « non lu », pour que la pastille ne reste pas allumée
 * toute la saison sur des joueurs sans intérêt (choix de David).
 */
export type PoolerTodo = { trades: number; waivers: number }

export async function getPoolerTodoAction(seenSince: string | null): Promise<PoolerTodo> {
  const empty = { trades: 0, waivers: 0 }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  const db = createAdminClient()
  const { data: season } = await db
    .from('pool_seasons').select('id').eq('is_active', true).eq('is_playoff', false).maybeSingle()
  if (!season) return empty
  const me = user.id

  const [{ data: offers }, { data: claims }, { data: myRequests }] = await Promise.all([
    db.from('trade_offers')
      .select('status, proposer_pooler_id, target_pooler_id, proposer_ready_at, target_ready_at')
      .eq('pool_season_id', season.id)
      .in('status', ['pending_target', 'pending_completion'])
      .or(`proposer_pooler_id.eq.${me},target_pooler_id.eq.${me}`),
    db.from('waiver_claims')
      .select('id, status, released_by_pooler_id, released_at, awarded_to_pooler_id')
      .eq('pool_season_id', season.id)
      .in('status', ['open', 'awarded']),
    db.from('waiver_claim_requests').select('waiver_claim_id').eq('pooler_id', me),
  ])

  const trades = (offers ?? []).filter(o =>
    (o.status === 'pending_target' && o.target_pooler_id === me)
    || (o.status === 'pending_completion' && (
      (o.proposer_pooler_id === me && !o.proposer_ready_at) || (o.target_pooler_id === me && !o.target_ready_at)
    )),
  ).length

  const answered = new Set((myRequests ?? []).map(r => r.waiver_claim_id as number))
  const since = seenSince ? new Date(seenSince).getTime() : null
  const waivers = (claims ?? []).filter(c =>
    (c.status === 'awarded' && c.awarded_to_pooler_id === me)
    || (c.status === 'open' && c.released_by_pooler_id !== me && !answered.has(c.id)
      && (since === null || new Date(c.released_at).getTime() > since)),
  ).length

  return { trades, waivers }
}
