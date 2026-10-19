'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { fetchWaiverClaimDays, MAX_WAIVER_CLAIM_DAYS, MIN_WAIVER_CLAIM_DAYS } from '@/lib/waiverSettings'

export async function getWaiverClaimDaysAction(): Promise<number> {
  const supabase = await createClient()
  return fetchWaiverClaimDays(supabase)
}

export async function updateWaiverClaimDaysAction(days: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }
  if (!Number.isInteger(days) || days < MIN_WAIVER_CLAIM_DAYS || days > MAX_WAIVER_CLAIM_DAYS) {
    return { error: `Le délai doit être un nombre entier de jours entre ${MIN_WAIVER_CLAIM_DAYS} et ${MAX_WAIVER_CLAIM_DAYS}.` }
  }
  const { error } = await supabase.from('app_settings').update({ waiver_claim_days: days }).eq('id', 1)
  if (error) return { error: error.message }
  revalidatePath('/aide')
  return {}
}
