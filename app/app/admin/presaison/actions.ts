'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { computeReverseStandingsOrder } from '@/lib/draftOrder'
import { getEffectiveCap } from '@/lib/capUtils'
import type { PoolerCapInfo, ElcDecisionEntry } from './types'

function getPlayerBucket(position: string | null): 'forward' | 'defense' | 'goalie' {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

export async function loadPresaisonDataAction(saisonId: number): Promise<{
  error?: string
  poolers?: PoolerCapInfo[]
  draftOrder?: string[]
  poolCap?: number
  season?: string
  elcDecisions?: ElcDecisionEntry[]
}> {
  const supabase = await createClient()

  const [{ data: saison }, { data: poolers }, { data: rosters }, { data: settings }] = await Promise.all([
    supabase
      .from('pool_seasons')
      .select('season, pool_cap, presaison_draft_order')
      .eq('id', saisonId)
      .single(),
    supabase.from('poolers').select('id, name').order('name'),
    supabase
      .from('pooler_rosters')
      .select(`id, pooler_id, player_id, player_type, rookie_type, pool_draft_year,
        players (first_name, last_name, position,
          player_contracts (season, cap_number, is_elc))`)
      .eq('pool_season_id', saisonId)
      .eq('is_active', true),
    supabase.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle(),
  ])

  if (!saison) return { error: 'Saison introuvable.' }
  const unsignedMultiplier = settings?.unsigned_player_cap_multiplier ?? 1.20

  const poolerMap = new Map<string, PoolerCapInfo>()
  for (const p of (poolers ?? [])) {
    poolerMap.set(p.id, {
      id: p.id,
      name: p.name,
      capUsed: 0,
      capSpace: saison.pool_cap,
      isCompliant: false,
      counts: { forward: 0, defense: 0, goalie: 0, reserviste: 0 },
      roster: [],
    })
  }

  // Année de début de la saison courante (ex: "2025-26" → 2025)
  const seasonStartYear = parseInt(saison.season.split('-')[0], 10)

  const elcDecisions: ElcDecisionEntry[] = []

  for (const entry of (rosters ?? []) as any[]) {
    const info = poolerMap.get(entry.pooler_id)
    if (!info) continue

    const contracts: any[] = entry.players?.player_contracts ?? []
    const currentContract = contracts.find((c: any) => c.season === saison.season)
    const { cap: capNum, isEstimated: capIsEstimated } = getEffectiveCap(contracts, saison.season, unsignedMultiplier)
    const pos: string | null = entry.players?.position ?? null
    let type: string = entry.player_type

    // Détection : recrue repêchée dans actif/réserviste avec ELC échu → décision requise
    if (
      (type === 'actif' || type === 'reserviste') &&
      entry.rookie_type === 'repeche' &&
      !currentContract?.is_elc
    ) {
      const draftYear: number = entry.pool_draft_year ?? 0
      elcDecisions.push({
        roster_id: entry.id,
        pooler_id: entry.pooler_id,
        poolerName: poolers?.find((p: any) => p.id === entry.pooler_id)?.name ?? '',
        player_id: entry.player_id,
        playerName: `${entry.players?.last_name}, ${entry.players?.first_name}`,
        position: pos,
        draft_year: draftYear,
        cap_number: capNum,
        player_type: type,
      })
      // Ces joueurs restent dans le roster normal — la décision ne bloque pas l'affichage
    }

    // Gestion des recrues en banque : protégées vs expirées
    if (type === 'recrue') {
      const rookieType: string | null = entry.rookie_type ?? null
      const draftYear: number | null = entry.pool_draft_year ?? null

      let isExpired = false
      if (rookieType === 'repeche' && draftYear !== null) {
        // Protection : 5 saisons à partir de l'année de repêchage
        isExpired = (seasonStartYear - draftYear) >= 5
      } else if (rookieType === 'agent_libre') {
        // Protection : tant qu'il y a un contrat ELC actif cette saison
        isExpired = !currentContract?.is_elc
      } else {
        // Cas indéfini : on exclut par sécurité (traitement manuel)
        continue
      }

      if (!isExpired) {
        // Recrue encore protégée → hors du repêchage pré-saison
        continue
      }
      // Recrue dont la protection est expirée → traiter comme actif
      type = 'actif'
    }

    info.roster.push({
      roster_id: entry.id,
      player_id: entry.player_id,
      player_type: type,
      playerName: `${entry.players?.last_name}, ${entry.players?.first_name}`,
      position: pos,
      cap_number: capNum,
      isEstimatedCap: capIsEstimated,
    })

    if (type === 'actif' || type === 'reserviste') info.capUsed += capNum
    if (type === 'actif') info.counts[getPlayerBucket(pos)]++
    if (type === 'reserviste') info.counts.reserviste++
  }

  for (const info of poolerMap.values()) {
    info.capSpace = saison.pool_cap - info.capUsed
    info.isCompliant =
      info.counts.forward <= 12 &&
      info.counts.defense <= 6 &&
      info.counts.goalie <= 2 &&
      info.counts.reserviste >= 2 &&
      info.capSpace >= 0
  }

  const draftOrder = (saison.presaison_draft_order as string[] | null) ?? []

  return {
    poolers: Array.from(poolerMap.values()),
    draftOrder,
    poolCap: saison.pool_cap,
    season: saison.season,
    elcDecisions,
  }
}

export async function resetLtirToActifAction(
  saisonId: number,
): Promise<{ error?: string; updated?: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { data, error } = await supabase
    .from('pooler_rosters')
    .update({ player_type: 'actif' })
    .eq('pool_season_id', saisonId)
    .eq('player_type', 'ltir')
    .eq('is_active', true)
    .select('id')
  if (error) return { error: error.message }

  revalidatePath('/admin/presaison')
  return { updated: (data ?? []).length }
}

export async function resetPresaisonDraftAction(
  saisonId: number,
): Promise<{ error?: string; reversed?: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  // 1. Find all pre-season draft transactions for this season
  const { data: txs, error: txErr } = await supabase
    .from('transactions')
    .select('id')
    .eq('pool_season_id', saisonId)
    .eq('notes', 'Repêchage pré-saison')
  if (txErr) return { error: txErr.message }
  if (!txs || txs.length === 0) return { reversed: 0 }

  const txIds = txs.map(t => t.id)

  // 2. Get the sign items to know which players to deactivate
  const { data: items, error: itemErr } = await supabase
    .from('transaction_items')
    .select('player_id, to_pooler_id')
    .in('transaction_id', txIds)
    .eq('action', 'sign')
  if (itemErr) return { error: itemErr.message }

  // 3. Deactivate those pooler_roster entries
  if (items && items.length > 0) {
    const playerIds = items.map((i: any) => i.player_id)
    const { error: rosterErr } = await supabase
      .from('pooler_rosters')
      .update({ is_active: false, removed_at: new Date().toISOString() })
      .eq('pool_season_id', saisonId)
      .in('player_id', playerIds)
      .eq('is_active', true)
    if (rosterErr) return { error: rosterErr.message }
  }

  // 4. Delete transaction_items then transactions
  const { error: delItemErr } = await supabase
    .from('transaction_items')
    .delete()
    .in('transaction_id', txIds)
  if (delItemErr) return { error: delItemErr.message }

  const { error: delTxErr } = await supabase
    .from('transactions')
    .delete()
    .in('id', txIds)
  if (delTxErr) return { error: delTxErr.message }

  revalidatePath('/admin/presaison')
  return { reversed: txIds.length }
}

// Résolution d'une décision ELC :
// - keep_active  : rookie_type = null → joueur actif permanent, ne peut plus retourner en banque
// - move_to_banque : player_type = 'recrue' → retour en banque pour le début de saison
export async function resolveElcDecisionAction(
  rosterId: number,
  decision: 'keep_active' | 'move_to_banque',
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  if (decision === 'keep_active') {
    // Efface le statut recrue : ce joueur ne pourra plus retourner en banque
    const { error } = await supabase
      .from('pooler_rosters')
      .update({ rookie_type: null, pool_draft_year: null })
      .eq('id', rosterId)
    if (error) return { error: error.message }
  } else {
    // Retour en banque de recrues pour le début de saison
    const { error } = await supabase
      .from('pooler_rosters')
      .update({ player_type: 'recrue' })
      .eq('id', rosterId)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/presaison')
  return {}
}

export async function saveDraftOrderAction(
  saisonId: number,
  poolerIds: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { error } = await supabase
    .from('pool_seasons')
    .update({ presaison_draft_order: poolerIds })
    .eq('id', saisonId)
  if (error) return { error: error.message }

  revalidatePath('/admin/presaison')
  return {}
}

// Initialise l'ordre du repêchage (agents libres ET recrues) à partir de
// l'ordre inverse du classement final de la saison régulière précédente.
export async function initDraftOrderFromStandingsAction(
  saisonId: number,
): Promise<{ error?: string; order?: string[]; previousSeason?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { poolerIds, previousSeason, error: orderErr } = await computeReverseStandingsOrder(supabase, saisonId)
  if (orderErr || !poolerIds) return { error: orderErr ?? 'Impossible de calculer l\'ordre.' }

  const { error: presaisonErr } = await supabase
    .from('pool_seasons')
    .update({ presaison_draft_order: poolerIds })
    .eq('id', saisonId)
  if (presaisonErr) return { error: presaisonErr.message }

  for (let i = 0; i < poolerIds.length; i++) {
    const { error } = await supabase
      .from('pool_draft_picks')
      .update({ draft_order: i + 1 })
      .eq('pool_season_id', saisonId)
      .eq('original_owner_id', poolerIds[i])
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/presaison')
  revalidatePath('/admin/repechage')
  return { order: poolerIds, previousSeason }
}
