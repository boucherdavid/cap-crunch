'use server'

// Server Actions côté pooler pour les demandes de mise sur LTIR (David, 2026-09-23) — fichier
// séparé de actions.ts (même patron que waiver-actions.ts/trade-actions.ts) pour éviter un
// cycle d'import : la logique métier (lib/ltirRequests.ts) appelle submitBatchAction
// (actions.ts) à l'approbation, donc actions.ts ne peut pas importer dans l'autre sens.

import { createClient } from '@/lib/supabase/server'
import { listOpenLtirReturnWatches, syncLtirReturns, type LtirReturnWatchView } from '@/lib/ltirReturns'
import {
  createLtirRequest,
  cancelLtirRequest,
  listPendingLtirRequestsForPooler,
  type LtirRequestView,
} from '@/lib/ltirRequests'

async function requireSelfOrAdmin(poolerId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' } as const
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin && user.id !== poolerId) return { error: 'Non autorisé.' } as const
  return { userId: user.id } as const
}

export async function submitLtirRequestAction(
  poolSeasonId: number,
  poolerId: string,
  ltirPlayerId: number,
  newPlayerId?: number,
): Promise<{ error?: string }> {
  const check = await requireSelfOrAdmin(poolerId)
  if ('error' in check) return check
  return createLtirRequest(poolSeasonId, poolerId, ltirPlayerId, newPlayerId)
}

export async function cancelLtirRequestAction(requestId: number, poolerId: string): Promise<{ error?: string }> {
  const check = await requireSelfOrAdmin(poolerId)
  if ('error' in check) return check
  return cancelLtirRequest(requestId, poolerId)
}

export async function getPendingLtirRequestsAction(poolSeasonId: number, poolerId: string): Promise<LtirRequestView[]> {
  const check = await requireSelfOrAdmin(poolerId)
  if ('error' in check) return []
  return listPendingLtirRequestsForPooler(poolSeasonId, poolerId)
}

/** Joueurs sur LTIR du pooler qui ont recommencé à jouer (David, 2026-10-05) — relance d'abord
 * la détection, pour que le bandeau reflète les matchs de la veille. */
export async function getLtirReturnWatchesAction(poolSeasonId: number, poolerId: string): Promise<LtirReturnWatchView[]> {
  const check = await requireSelfOrAdmin(poolerId)
  if ('error' in check) return []
  await syncLtirReturns(true)
  return listOpenLtirReturnWatches(poolSeasonId, poolerId)
}
