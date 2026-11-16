'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// Sans repère enregistré (première utilisation, ou migration pas encore roulée).
const DEFAULT_LOOKBACK_DAYS = 7

export type MarqueurJournal = {
  /** Transactions à saisir sur Marqueur, de la plus ancienne à la plus récente. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactions: any[]
  syncedAt: string | null
  syncedTxId: number | null
  /** false : colonnes absentes (migration marqueur_synced.sql pas encore roulée). */
  available: boolean
  lookbackDays: number
}

/**
 * Journal des activités depuis la dernière mise à jour de Marqueur (David, 2026-11-16). Lecture
 * bornée : saison active + id de transaction (clé primaire) au-dessus du repère, sinon 7 jours.
 */
export async function loadMarqueurJournal(): Promise<MarqueurJournal> {
  const admin = createAdminClient()
  const [{ data: settings, error: settingsError }, { data: season }] = await Promise.all([
    admin.from('app_settings').select('marqueur_synced_tx_id, marqueur_synced_at').eq('id', 1).maybeSingle(),
    admin.from('pool_seasons').select('id').eq('is_active', true).eq('is_playoff', false).maybeSingle(),
  ])
  const available = !settingsError
  const syncedTxId = (settings?.marqueur_synced_tx_id as number | null | undefined) ?? null
  const syncedAt = (settings?.marqueur_synced_at as string | null | undefined) ?? null
  const empty = { transactions: [], syncedAt, syncedTxId, available, lookbackDays: DEFAULT_LOOKBACK_DAYS }
  if (!season) return empty

  let query = admin
    .from('transactions')
    .select(`
      id, notes, created_at, override_note,
      transaction_items (
        id, action_type, old_player_type, new_player_type,
        from_pooler:poolers!from_pooler_id (name),
        to_pooler:poolers!to_pooler_id (name),
        players (id, nhl_id, first_name, last_name, position, teams (code)),
        pick:pool_draft_picks!pick_id (round, pool_seasons (season), original_owner:poolers!original_owner_id (name))
      )
    `)
    .eq('pool_season_id', season.id)
  query = syncedTxId != null
    ? query.gt('id', syncedTxId)
    : query.gte('created_at', new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000).toISOString())
  const { data } = await query.order('created_at').order('id')
  return { ...empty, transactions: data ?? [] }
}

/** « Marqueur est à jour » : repère = dernière transaction affichée, pas l'heure du clic — un
 * panier soumis pendant la saisie reste ainsi dans la liste. */
export async function markMarqueurSyncedAction(lastTxId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }
  if (!Number.isInteger(lastTxId) || lastTxId <= 0) return { error: 'Repère invalide.' }

  const admin = createAdminClient()
  const { data: current, error: readError } = await admin.from('app_settings').select('marqueur_synced_tx_id').eq('id', 1).maybeSingle()
  if (readError) return { error: 'La migration marqueur_synced.sql n’est pas encore roulée sur cette base.' }
  // Jamais reculer le repère (deux onglets ouverts, ancienne page).
  const next = Math.max(lastTxId, (current?.marqueur_synced_tx_id as number | null) ?? 0)
  const { error } = await admin.from('app_settings')
    .update({ marqueur_synced_tx_id: next, marqueur_synced_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { error: error.message }
  revalidatePath('/admin/effectifs')
  return {}
}
