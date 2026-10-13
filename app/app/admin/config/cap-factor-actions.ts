'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeCapFactor, type CapFactorResult } from '@/lib/capFactor'

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  return !!me?.is_admin
}

// Calcul du facteur de plafond (David, 2026-10-13) — lecture seule, rien n'est enregistré.
export async function computeCapFactorAction(
  saisonId: number,
  pressure: number,
): Promise<{ error?: string; result?: CapFactorResult }> {
  if (!(await isAdmin())) return { error: 'Accès refusé.' }
  if (!(pressure > 0 && pressure <= 1.5)) return { error: 'Taux de pression invalide.' }
  try {
    return { result: await computeCapFactor(createAdminClient(), saisonId, pressure) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Calcul impossible.' }
  }
}

// Adopte un facteur pour la saison : le plafond du pool (colonne générée) suit tout seul.
export async function applyCapFactorAction(saisonId: number, factor: number): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Accès refusé.' }
  if (!(factor > 0.5 && factor < 3)) return { error: 'Facteur invalide.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('pool_seasons')
    .update({ cap_multiplier: Math.round(factor * 100) / 100 })
    .eq('id', saisonId)
    .eq('is_playoff', false)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}
