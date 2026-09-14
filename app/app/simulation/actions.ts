'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getEffectiveCap } from '@/lib/capUtils'

export type SimRosterEntry = {
  roster_id: number
  player_id: number
  player_type: string
  playerName: string
  position: string | null
  cap_number: number
  isEstimatedCap: boolean
}

// Version allégée de loadPresaisonDataAction (admin/presaison/actions.ts) — seulement
// l'alignement et le cap du pooler courant, sans la mécanique de file d'attente/tour de
// repêchage qui ne s'applique pas ici. Utilisable à l'année, contrairement à celle-là (voir
// /simulation, David, 2026-09-14 : un pooler veut pouvoir tester des ajouts/retraits en cours
// de saison, pas seulement en pré-saison).
export async function loadMyRosterForSimulationAction(saisonId: number): Promise<{
  error?: string
  roster?: SimRosterEntry[]
  capUsed?: number
  poolCap?: number
  season?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { data: saison } = await supabase.from('pool_seasons').select('pool_cap, season').eq('id', saisonId).single()
  if (!saison) return { error: 'Saison introuvable.' }

  const { data: settings } = await supabase.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle()
  const unsignedMultiplier = settings?.unsigned_player_cap_multiplier ?? 1.20

  const { data: rows } = await supabase
    .from('pooler_rosters')
    .select('id, player_id, player_type, players (first_name, last_name, position, player_contracts (season, cap_number, is_elc))')
    .eq('pooler_id', user.id)
    .eq('pool_season_id', saisonId)
    .eq('is_active', true)
    .in('player_type', ['actif', 'reserviste'])

  let capUsed = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roster: SimRosterEntry[] = ((rows ?? []) as any[]).map(r => {
    const contracts = r.players?.player_contracts ?? []
    const { cap, isEstimated } = getEffectiveCap(contracts, saison.season, unsignedMultiplier)
    capUsed += cap
    return {
      roster_id: r.id,
      player_id: r.player_id,
      player_type: r.player_type,
      playerName: `${r.players?.last_name}, ${r.players?.first_name}`,
      position: r.players?.position ?? null,
      cap_number: cap,
      isEstimatedCap: isEstimated,
    }
  })

  return { roster, capUsed, poolCap: saison.pool_cap, season: saison.season }
}

// ── Scénarios sauvegardés (simulation_scenarios) ────────────────────────────
// RLS admin-only sur la table (même patron que push_subscriptions/transactions) — tout accès
// passe par le client service role ici, après vérification que pooler_id correspond bien à
// l'utilisateur authentifié.

export type ScenarioData = {
  removed: number[]
  added: { id: number; first_name: string; last_name: string; position: string | null; cap_number: number }[]
  addedRecrueIds: number[]
}

export async function listScenariosAction(saisonId: number): Promise<{ scenarios: { id: number; name: string; updated_at: string }[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { scenarios: [] }

  const admin = createAdminClient()
  const { data } = await admin
    .from('simulation_scenarios')
    .select('id, name, updated_at')
    .eq('pooler_id', user.id)
    .eq('pool_season_id', saisonId)
    .order('updated_at', { ascending: false })

  return { scenarios: data ?? [] }
}

export async function loadScenarioAction(scenarioId: number): Promise<{ error?: string; data?: ScenarioData }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const admin = createAdminClient()
  const { data: row } = await admin.from('simulation_scenarios').select('pooler_id, data').eq('id', scenarioId).maybeSingle()
  if (!row || row.pooler_id !== user.id) return { error: 'Scénario introuvable.' }

  return { data: row.data as ScenarioData }
}

export async function saveScenarioAction(saisonId: number, name: string, data: ScenarioData): Promise<{ error?: string; id?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Donne un nom au scénario.' }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('simulation_scenarios')
    .upsert(
      { pooler_id: user.id, pool_season_id: saisonId, name: trimmed, data, updated_at: new Date().toISOString() },
      { onConflict: 'pooler_id,pool_season_id,name' },
    )
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/simulation')
  return { id: row.id }
}

export async function deleteScenarioAction(scenarioId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const admin = createAdminClient()
  const { data: row } = await admin.from('simulation_scenarios').select('pooler_id').eq('id', scenarioId).maybeSingle()
  if (!row || row.pooler_id !== user.id) return { error: 'Scénario introuvable.' }

  const { error } = await admin.from('simulation_scenarios').delete().eq('id', scenarioId)
  if (error) return { error: error.message }

  revalidatePath('/simulation')
  return {}
}
