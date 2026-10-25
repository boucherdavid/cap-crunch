'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveExpiredWaiverClaims, resolveExpiredAwardedClaims, checkGuaranteedWaiverWinner, notifyAdminsOfWaiverClaim, notifyAdminsOfPendingClaims } from '@/lib/waiverClaims'

export type WaiverClaimView = {
  id: number
  playerId: number
  playerName: string
  position: string | null
  teamCode: string | null
  releasedByName: string
  expiresAt: string
  // 'claimed'/'refused' une fois que ce pooler a agi sur ce claim, sinon null (David,
  // 2026-09-21) — remplace l'ancien booléen alreadyClaimed, insuffisant pour distinguer les
  // deux réponses possibles.
  myStatus: 'claimed' | 'refused' | null
  canClaim: boolean
  canRefuse: boolean
  /** Admin seulement, et seulement après son propre refus ou s'il a libéré le joueur. */
  responses?: WaiverResponse[]
}

/** Réponse d'un pooler à un ballotage, dans l'ordre de priorité (David, 2026-10-16). */
export type WaiverResponse = { poolerName: string; status: 'claimed' | 'refused' | null }

export type WaiverHistoryEntry = {
  id: number
  playerName: string
  releasedByName: string
  status: string
  awardedToName: string | null
  resolvedAt: string | null
  /** Admin seulement. */
  responses?: WaiverResponse[]
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
  await resolveExpiredAwardedClaims(saisonId)

  const [{ data: openClaims }, { data: history }, { data: me }] = await Promise.all([
    supabase
      .from('waiver_claims')
      .select('id, player_id, released_by_pooler_id, expires_at, priority_snapshot, players (first_name, last_name, position, teams (code)), poolers!released_by_pooler_id (name)')
      .eq('pool_season_id', saisonId)
      .eq('status', 'open')
      .order('expires_at'),
    supabase
      .from('waiver_claims')
      .select('id, status, resolved_at, awarded_at, released_by_pooler_id, priority_snapshot, players (first_name, last_name), releaser:poolers!released_by_pooler_id (name), winner:poolers!awarded_to_pooler_id (name)')
      .eq('pool_season_id', saisonId)
      .in('status', ['resolved_claimed', 'resolved_unclaimed', 'blocked', 'awarded'])
      .order('id', { ascending: false })
      .limit(10),
    supabase.from('poolers').select('is_admin').eq('id', user.id).single(),
  ])
  const isAdmin = !!me?.is_admin

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claimIds = (openClaims ?? []).map((c: any) => c.id)
  // Ni le compte de réclamations ni de refus ne sont exposés aux poolers tant qu'un claim est
  // 'open' (David, 2026-09-21) — ça révélerait qui est intéressé/pas intéressé avant que tout
  // soit décidé, une info stratégique que personne ne devrait voir avant la résolution. Seul le
  // statut du pooler courant (`myStatus`) est nécessaire pour canClaim/canRefuse.
  const myStatusByClaimId = new Map<number, 'claimed' | 'refused'>()
  if (claimIds.length > 0) {
    const { data: requests } = await supabase
      .from('waiver_claim_requests')
      .select('waiver_claim_id, pooler_id, status')
      .eq('pooler_id', user.id)
      .in('waiver_claim_id', claimIds)
    for (const r of requests ?? []) {
      myStatusByClaimId.set(r.waiver_claim_id, r.status as 'claimed' | 'refused')
    }
  }

  // Réponses de tous les poolers, pour l'admin seulement (David, 2026-10-16) : sur un ballotage
  // ouvert, une fois qu'il a lui-même refusé (définitif, il ne peut plus en tirer d'avantage) ou
  // s'il a libéré le joueur ; dans l'historique, toujours.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const revealOpen = (c: any) => isAdmin && (myStatusByClaimId.get(c.id) === 'refused' || c.released_by_pooler_id === user.id)
  const responsesByClaimId = isAdmin
    ? await loadWaiverResponses([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(openClaims ?? []).filter(revealOpen) as any[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(history ?? []) as any[],
      ])
    : new Map<number, WaiverResponse[]>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claims: WaiverClaimView[] = (openClaims ?? []).map((c: any) => {
    const myStatus = myStatusByClaimId.get(c.id) ?? null
    const isReleaser = c.released_by_pooler_id === user.id
    return {
      responses: responsesByClaimId.get(c.id),
      id: c.id,
      playerId: c.player_id,
      playerName: `${c.players?.last_name ?? ''}, ${c.players?.first_name ?? ''}`,
      position: c.players?.position ?? null,
      teamCode: c.players?.teams?.code ?? null,
      releasedByName: c.poolers?.name ?? '—',
      expiresAt: c.expires_at,
      myStatus,
      canClaim: !isReleaser && myStatus !== 'claimed' && myStatus !== 'refused',
      // Refuser reste permis après avoir réclamé (change d'avis) — jamais l'inverse, voir
      // refuseWaiverClaimAction/submitWaiverClaimAction.
      canRefuse: !isReleaser && myStatus !== 'refused',
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const historyView: WaiverHistoryEntry[] = (history ?? []).map((h: any) => ({
    id: h.id,
    playerName: `${h.players?.last_name ?? ''}, ${h.players?.first_name ?? ''}`,
    releasedByName: h.releaser?.name ?? '—',
    status: h.status,
    awardedToName: h.winner?.name ?? null,
    resolvedAt: h.resolved_at,
    responses: responsesByClaimId.get(h.id),
  }))

  return { claims, history: historyView }
}

async function loadWaiverResponses(
  claims: { id: number; released_by_pooler_id: string; priority_snapshot: string[] | null }[],
): Promise<Map<number, WaiverResponse[]>> {
  const out = new Map<number, WaiverResponse[]>()
  if (claims.length === 0) return out
  const admin = createAdminClient()
  const [{ data: requests }, { data: poolers }] = await Promise.all([
    admin.from('waiver_claim_requests').select('waiver_claim_id, pooler_id, status').in('waiver_claim_id', claims.map(c => c.id)),
    admin.from('poolers').select('id, name'),
  ])
  const names = new Map((poolers ?? []).map(p => [p.id as string, p.name as string]))
  const statusOf = new Map((requests ?? []).map(r => [`${r.waiver_claim_id}|${r.pooler_id}`, r.status as 'claimed' | 'refused']))
  for (const c of claims) {
    // Ordre de priorité figé à la libération ; poolers absents du snapshot ajoutés à la fin.
    const order = [...(c.priority_snapshot ?? [])]
    for (const id of names.keys()) if (!order.includes(id)) order.push(id)
    out.set(c.id, order
      .filter(id => id !== c.released_by_pooler_id && names.has(id))
      .map(id => ({ poolerName: names.get(id)!, status: statusOf.get(`${c.id}|${id}`) ?? null })))
  }
  return out
}

// Valide la réclamation/le refus et renvoie la ligne existante de ce pooler pour ce claim, le
// cas échéant — factorisé (David, 2026-09-21) puisque submitWaiverClaimAction et
// refuseWaiverClaimAction partagent exactement les mêmes garde-fous de base.
async function validateWaiverAction(
  admin: ReturnType<typeof createAdminClient>,
  saisonId: number,
  waiverClaimId: number,
  userId: string,
): Promise<{ error?: string; existingStatus?: 'claimed' | 'refused' }> {
  const { data: claim } = await admin
    .from('waiver_claims')
    .select('id, status, expires_at, released_by_pooler_id, pool_season_id')
    .eq('id', waiverClaimId)
    .single()
  if (!claim || claim.pool_season_id !== saisonId) return { error: 'Réclamation introuvable.' }
  if (claim.status !== 'open') return { error: 'Cette réclamation est déjà résolue.' }
  if (new Date(claim.expires_at) <= new Date()) return { error: 'Le délai de réclamation est expiré.' }
  if (claim.released_by_pooler_id === userId) return { error: 'Tu ne peux pas agir sur un joueur que tu viens de libérer.' }

  const { data: existing } = await admin
    .from('waiver_claim_requests')
    .select('status')
    .eq('waiver_claim_id', waiverClaimId)
    .eq('pooler_id', userId)
    .maybeSingle()
  return { existingStatus: existing?.status }
}

export async function submitWaiverClaimAction(saisonId: number, waiverClaimId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const admin = createAdminClient()
  const { error: validationError, existingStatus } = await validateWaiverAction(admin, saisonId, waiverClaimId, user.id)
  if (validationError) return { error: validationError }
  if (existingStatus === 'claimed') return { error: 'Tu as déjà réclamé ce joueur.' }
  // Une fois refusé, c'est final (David, 2026-09-21) — sinon un réclamant plus bas dans la
  // priorité qui aurait déjà reçu la notification "garanti" se retrouverait avec une garantie
  // fausse si quelqu'un plus prioritaire revenait sur son refus.
  if (existingStatus === 'refused') return { error: 'Tu as refusé ce joueur — impossible de revenir en arrière.' }

  const { error } = await admin.from('waiver_claim_requests').upsert(
    { waiver_claim_id: waiverClaimId, pooler_id: user.id, status: 'claimed' },
    { onConflict: 'waiver_claim_id,pooler_id' },
  )
  if (error) return { error: error.message }

  await checkGuaranteedWaiverWinner(waiverClaimId)
  // Avis aux admins qui ont le droit de le savoir (David, 2026-10-25, voir lib/waiverClaims.ts).
  after(() => notifyAdminsOfWaiverClaim(waiverClaimId, user.id).catch(() => {}))
  return {}
}

// "Refuser" (David, 2026-09-21) — permet de renoncer explicitement à un joueur au ballotage.
// Toujours permis (même après avoir réclamé, pour changer d'avis), jamais l'inverse. Chaque
// refus peut compléter la chaîne de priorité d'un réclamant existant et le rendre "garanti" —
// voir checkGuaranteedWaiverWinner.
export async function refuseWaiverClaimAction(saisonId: number, waiverClaimId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const admin = createAdminClient()
  const { error: validationError, existingStatus } = await validateWaiverAction(admin, saisonId, waiverClaimId, user.id)
  if (validationError) return { error: validationError }
  if (existingStatus === 'refused') return { error: 'Tu as déjà refusé ce joueur.' }

  const { error } = await admin.from('waiver_claim_requests').upsert(
    { waiver_claim_id: waiverClaimId, pooler_id: user.id, status: 'refused' },
    { onConflict: 'waiver_claim_id,pooler_id' },
  )
  if (error) return { error: error.message }

  await checkGuaranteedWaiverWinner(waiverClaimId)
  // Admin qui refuse : il reçoit maintenant les réclamations qu'il ne pouvait pas voir avant.
  after(() => notifyAdminsOfPendingClaims(waiverClaimId, user.id).catch(() => {}))
  return {}
}
