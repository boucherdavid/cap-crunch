'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Marque des alertes de salaire comme vues (toutes celles en attente si `ids` est absent). */
export async function markContractAlertsSeenAction(ids?: number[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Réservé à l’administrateur.' }

  let query = createAdminClient().from('contract_change_alerts')
    .update({ seen_at: new Date().toISOString() }).is('seen_at', null)
  if (ids) query = query.in('id', ids)
  const { error } = await query
  if (error) return { error: error.message }
  revalidatePath('/admin/donnees')
  return {}
}
