'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPendingLtirRequestsForAdminAction,
  getPendingTradeOffersForAdminAction,
  type AdminTradeOfferView,
} from '@/app/admin/effectifs/cap-watch-actions'
import type { LtirRequestView } from '@/lib/ltirRequests'

/**
 * Tout ce qui attend une décision de l'admin (David, 2026-10-01) — alimente le bouton
 * « Approbations » de la barre du haut et son panneau (`AdminApprovalsPanel`), pour approuver
 * sans quitter la page en cours (ex : pendant le repêchage). Mêmes données que l'onglet
 * /admin/effectifs?tab=approbation, plus les ballotages bloqués (gagnant qui n'a pas complété
 * sa réclamation dans le délai — à traiter à la main dans /admin/transactions).
 */

export type BlockedWaiverView = {
  id: number
  playerName: string
  awardedToName: string | null
  awardedAt: string | null
  errorMessage: string | null
}

export type AdminApprovals = {
  offers: AdminTradeOfferView[]
  ltir: LtirRequestView[]
  blockedWaivers: BlockedWaiverView[]
}

/** `null` si l'utilisateur n'est pas admin ou s'il n'y a pas de saison régulière active. */
export async function getAdminApprovalsAction(): Promise<AdminApprovals | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return null

  const { data: season } = await supabase
    .from('pool_seasons').select('id').eq('is_active', true).eq('is_playoff', false).maybeSingle()
  if (!season) return { offers: [], ltir: [], blockedWaivers: [] }

  const db = createAdminClient()
  const [offers, ltir, { data: waivers }] = await Promise.all([
    getPendingTradeOffersForAdminAction(season.id),
    getPendingLtirRequestsForAdminAction(season.id),
    db
      .from('waiver_claims')
      .select('id, awarded_at, error_message, players (first_name, last_name), awarded:poolers!awarded_to_pooler_id (name)')
      .eq('pool_season_id', season.id)
      .eq('status', 'blocked')
      .order('awarded_at', { ascending: false }),
  ])

  type WaiverRow = {
    id: number
    awarded_at: string | null
    error_message: string | null
    players: { first_name: string; last_name: string } | null
    awarded: { name: string } | null
  }
  return {
    offers: offers.offers ?? [],
    ltir,
    blockedWaivers: ((waivers ?? []) as unknown as WaiverRow[]).map(w => ({
      id: w.id,
      playerName: w.players ? `${w.players.first_name} ${w.players.last_name}` : 'Joueur inconnu',
      awardedToName: w.awarded?.name ?? null,
      awardedAt: w.awarded_at,
      errorMessage: w.error_message,
    })),
  }
}
