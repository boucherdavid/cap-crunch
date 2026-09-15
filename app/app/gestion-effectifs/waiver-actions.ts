'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveExpiredWaiverClaims } from '@/lib/waiverClaims'

export type WaiverClaimView = {
  id: number
  playerName: string
  position: string | null
  teamCode: string | null
  releasedByName: string
  expiresAt: string
  claimCount: number
  alreadyClaimed: boolean
  canClaim: boolean
}

export type WaiverHistoryEntry = {
  id: number
  playerName: string
  releasedByName: string
  status: string
  awardedToName: string | null
  resolvedAt: string | null
}

export async function getWaiverClaimsAction(saisonId: number): Promise<{
  error?: string
  claims?: WaiverClaimView[]
  history?: WaiverHistoryEntry[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  await resolveExpiredWaiverClaims(saisonId)

  const [{ data: openClaims }, { data: history }] = await Promise.all([
    supabase
      .from('waiver_claims')
      .select('id, player_id, released_by_pooler_id, expires_at, players (first_name, last_name, position, teams (code)), poolers!released_by_pooler_id (name)')
      .eq('pool_season_id', saisonId)
      .eq('status', 'open')
      .order('expires_at'),
    supabase
      .from('waiver_claims')
      .select('id, status, resolved_at, players (first_name, last_name), releaser:poolers!released_by_pooler_id (name), winner:poolers!awarded_to_pooler_id (name)')
      .eq('pool_season_id', saisonId)
      .in('status', ['resolved_claimed', 'resolved_unclaimed', 'blocked'])
      .order('resolved_at', { ascending: false })
      .limit(10),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claimIds = (openClaims ?? []).map((c: any) => c.id)
  const requestCounts = new Map<number, number>()
  const myRequests = new Set<number>()
  if (claimIds.length > 0) {
    const { data: requests } = await supabase
      .from('waiver_claim_requests')
      .select('waiver_claim_id, pooler_id')
      .in('waiver_claim_id', claimIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (requests ?? []) as any[]) {
      requestCounts.set(r.waiver_claim_id, (requestCounts.get(r.waiver_claim_id) ?? 0) + 1)
      if (r.pooler_id === user.id) myRequests.add(r.waiver_claim_id)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claims: WaiverClaimView[] = (openClaims ?? []).map((c: any) => ({
    id: c.id,
    playerName: `${c.players?.last_name ?? ''}, ${c.players?.first_name ?? ''}`,
    position: c.players?.position ?? null,
    teamCode: c.players?.teams?.code ?? null,
    releasedByName: c.poolers?.name ?? '—',
    expiresAt: c.expires_at,
    claimCount: requestCounts.get(c.id) ?? 0,
    alreadyClaimed: myRequests.has(c.id),
    canClaim: c.released_by_pooler_id !== user.id && !myRequests.has(c.id),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const historyView: WaiverHistoryEntry[] = (history ?? []).map((h: any) => ({
    id: h.id,
    playerName: `${h.players?.last_name ?? ''}, ${h.players?.first_name ?? ''}`,
    releasedByName: h.releaser?.name ?? '—',
    status: h.status,
    awardedToName: h.winner?.name ?? null,
    resolvedAt: h.resolved_at,
  }))

  return { claims, history: historyView }
}

export async function submitWaiverClaimAction(saisonId: number, waiverClaimId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const admin = createAdminClient()
  const { data: claim } = await admin
    .from('waiver_claims')
    .select('id, status, expires_at, released_by_pooler_id, pool_season_id')
    .eq('id', waiverClaimId)
    .single()
  if (!claim || claim.pool_season_id !== saisonId) return { error: 'Réclamation introuvable.' }
  if (claim.status !== 'open') return { error: 'Cette réclamation est déjà résolue.' }
  if (new Date(claim.expires_at) <= new Date()) return { error: 'Le délai de réclamation est expiré.' }
  if (claim.released_by_pooler_id === user.id) return { error: 'Tu ne peux pas réclamer un joueur que tu viens de libérer.' }

  const { error } = await admin.from('waiver_claim_requests').insert({ waiver_claim_id: waiverClaimId, pooler_id: user.id })
  if (error) {
    if (error.code === '23505') return { error: 'Tu as déjà réclamé ce joueur.' }
    return { error: error.message }
  }
  return {}
}
