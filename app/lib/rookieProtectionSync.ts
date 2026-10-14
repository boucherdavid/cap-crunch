import { createAdminClient } from '@/lib/supabase/admin'
import { isRookieProtected, hasSignedContract, type RookieTag } from '@/lib/rookieProtection'
import { applyTransactionItems, type TxItemPayload } from '@/app/admin/transactions/actions'

/**
 * Applique l'expiration de la protection recrue (règle unique isRookieProtected, David,
 * 2026-10-14 ; mécanique du 2026-09-07) — la perte du statut recrue est automatique et
 * permanente :
 * - encore en banque : activé automatiquement en Actif (même chemin que « Activer », action
 *   'promote' d'applyTransactionItems — added_at, conflits, effacement des champs recrue) ;
 * - déjà actif/réserviste : reste où il est, seule l'étiquette de protection devenue caduque
 *   est effacée.
 * Appelée au chargement de la pré-saison (/repechage-agents-libres, /admin/init?tab=presaison)
 * et après une correction d'étiquette par l'admin (updateRookieTypeAction). Client admin : tourne
 * aussi depuis une page pooler, sans droit d'écriture sur ces tables.
 * `poolerId` limite la vérification à un pooler (correction d'étiquette). `notes` : garder
 * 'Ajustement pré-saison' en pré-saison, lu par l'activité récente de /repechage-agents-libres.
 */
export async function syncExpiredRookieProtection(
  saisonId: number,
  season: string,
  { poolerId, notes = 'Protection recrue expirée' }: { poolerId?: string; notes?: string } = {},
): Promise<void> {
  const admin = createAdminClient()
  let query = admin
    .from('pooler_rosters')
    .select('id, player_type, pooler_id, player_id, rookie_type, pool_draft_year, players(player_contracts(season, is_elc, cap_number))')
    .eq('pool_season_id', saisonId)
    .eq('is_active', true)
    .in('player_type', ['actif', 'reserviste', 'recrue'])
  if (poolerId) query = query.eq('pooler_id', poolerId)
  const { data: rows } = await query

  const promoteItems: TxItemPayload[] = []
  const clearIds: number[] = []
  for (const row of (rows ?? []) as unknown as {
    id: number; player_type: string; pooler_id: string; player_id: number
    rookie_type: RookieTag; pool_draft_year: number | null
    players: { player_contracts: { season: string; is_elc: boolean | null; cap_number: number | null }[] | null } | null
  }[]) {
    // Actif/réserviste sans étiquette : rien à retirer.
    if (row.player_type !== 'recrue' && !row.rookie_type) continue
    if (isRookieProtected(row.rookie_type, row.pool_draft_year, row.players?.player_contracts, season)) continue

    if (row.player_type === 'recrue') {
      // Sans contrat LNH signé, elle ne peut pas être activée : elle reste en banque (« Activation
      // obligatoire » de la Banque de recrues) jusqu'à sa signature (David, 2026-10-14).
      if (!hasSignedContract(row.players?.player_contracts, season)) continue
      promoteItems.push({
        action_type: 'promote',
        from_pooler_id: row.pooler_id,
        to_pooler_id: row.pooler_id,
        player_id: row.player_id,
        old_player_type: 'recrue',
        new_player_type: 'actif',
      })
    } else {
      clearIds.push(row.id)
    }
  }

  if (clearIds.length > 0) {
    await admin.from('pooler_rosters').update({ rookie_type: null, pool_draft_year: null }).in('id', clearIds)
  }
  if (promoteItems.length > 0) {
    const result = await applyTransactionItems(admin, null, saisonId, notes, promoteItems)
    // Ne bloque jamais la page appelante ; l'admin garde « Activer » (Banque de recrues) en filet.
    if (result.error) console.error('syncExpiredRookieProtection : échec de l\'activation auto —', result.error)
  }
}
