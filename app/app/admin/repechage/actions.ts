'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type PickSelection = {
  pick_id: number
  player_id: number
}

function revalidateDraftPages() {
  revalidatePath('/admin/repechage')
  revalidatePath('/repechage-recrues')
}

export async function submitDraftAction(
  saisonId: number,
  poolDraftYear: number,
  selections: PickSelection[],
): Promise<{ error?: string }> {
  const supabase = await createClient()

  if (selections.length === 0) return { error: 'Aucun choix à soumettre.' }

  const pickIds = selections.map(s => s.pick_id)
  const { data: picks } = await supabase
    .from('pool_draft_picks')
    .select('id, current_owner_id, round, is_used, pool_season_id')
    .in('id', pickIds)

  const pickMap = new Map((picks ?? []).map((p: any) => [p.id, p]))

  for (const sel of selections) {
    const pick = pickMap.get(sel.pick_id)
    if (!pick) return { error: `Choix introuvable (id: ${sel.pick_id}).` }
    if (pick.pool_season_id !== saisonId) return { error: `Choix hors saison (id: ${sel.pick_id}).` }
    if (pick.is_used) return { error: `Ce choix a déjà été utilisé (ronde ${pick.round}).` }
  }

  const playerIds = selections.map(s => s.player_id)
  const { data: players } = await supabase
    .from('players')
    .select('id, is_rookie, draft_year')
    .in('id', playerIds)

  const playerMap = new Map((players ?? []).map((p: any) => [p.id, p]))
  const draftYearCutoff = poolDraftYear - 4

  for (const sel of selections) {
    const player = playerMap.get(sel.player_id)
    const isEligible = player?.is_rookie || (player?.draft_year != null && player.draft_year >= draftYearCutoff)
    if (!isEligible) {
      return { error: `Le joueur sélectionné (id: ${sel.player_id}) n'est pas une recrue.` }
    }
  }

  for (const sel of selections) {
    const pick = pickMap.get(sel.pick_id)

    const { data: existing } = await supabase
      .from('pooler_rosters')
      .select('id')
      .eq('pooler_id', pick.current_owner_id)
      .eq('player_id', sel.player_id)
      .eq('pool_season_id', saisonId)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('pooler_rosters')
        .update({
          is_active: true,
          player_type: 'recrue',
          rookie_type: 'repeche',
          pool_draft_year: poolDraftYear,
          draft_pick_id: sel.pick_id,
          removed_at: null,
        })
        .eq('id', existing.id)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase.from('pooler_rosters').insert({
        pooler_id: pick.current_owner_id,
        player_id: sel.player_id,
        pool_season_id: saisonId,
        player_type: 'recrue',
        is_active: true,
        rookie_type: 'repeche',
        pool_draft_year: poolDraftYear,
        draft_pick_id: sel.pick_id,
      })
      if (error) return { error: error.message }
    }

    const { error } = await supabase
      .from('pool_draft_picks')
      .update({ is_used: true, pending_player_id: null })
      .eq('id', sel.pick_id)
    if (error) return { error: error.message }
  }

  revalidateDraftPages()
  return {}
}

export async function saveDraftProgressAction(
  saisonId: number,
  selections: { pickId: number; playerId: number | null }[],
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: pooler } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!pooler?.is_admin) return { error: 'Accès refusé.' }

  for (const { pickId, playerId } of selections) {
    const { error } = await supabase
      .from('pool_draft_picks')
      .update({ pending_player_id: playerId })
      .eq('id', pickId)
      .eq('pool_season_id', saisonId)
      .eq('is_used', false)
    if (error) return { error: error.message }
  }

  revalidateDraftPages()
  return {}
}

export async function saveDraftOrderAction(
  saisonId: number,
  entries: { poolerId: string; draftOrder: number }[],
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: pooler } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!pooler?.is_admin) return { error: 'Accès refusé.' }

  for (const { poolerId, draftOrder } of entries) {
    const { error } = await supabase
      .from('pool_draft_picks')
      .update({ draft_order: draftOrder })
      .eq('pool_season_id', saisonId)
      .eq('original_owner_id', poolerId)
    if (error) return { error: error.message }
  }

  revalidateDraftPages()
  return {}
}

export async function rollbackPickAction(pickId: number): Promise<{ error?: string }> {
  const supabase = await createClient()

  // Vérifier que l'appelant est admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: pooler } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!pooler?.is_admin) return { error: 'Accès refusé.' }

  // Trouver l'entrée roster liée à ce pick
  const { data: rosterEntry } = await supabase
    .from('pooler_rosters')
    .select('id')
    .eq('draft_pick_id', pickId)
    .eq('is_active', true)
    .maybeSingle()

  if (rosterEntry) {
    const { error } = await supabase
      .from('pooler_rosters')
      .update({ is_active: false, removed_at: new Date().toISOString() })
      .eq('id', rosterEntry.id)
    if (error) return { error: error.message }
  }

  // Remettre le pick comme disponible
  const { error } = await supabase
    .from('pool_draft_picks')
    .update({ is_used: false })
    .eq('id', pickId)
  if (error) return { error: error.message }

  revalidateDraftPages()
  return {}
}
