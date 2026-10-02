'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import {
  DEFAULT_TURN_SECONDS, MAX_TURN_SECONDS, MIN_TURN_SECONDS, fetchDraftTurnSeconds, remainingSeconds,
  type DraftTurnSeconds, type RookieTimer,
} from '@/lib/draftTimers'

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
    if (!pick) return { error: `Choix introuvable (id : ${sel.pick_id}).` }
    if (pick.pool_season_id !== saisonId) return { error: `Choix hors saison (id : ${sel.pick_id}).` }
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
      return { error: `Le joueur sélectionné (id : ${sel.player_id}) n'est pas une recrue.` }
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

  // Des choix viennent de devenir officiels : le tour passe au suivant (chrono, notification).
  await restartRookieTimerIfActive(supabase, saisonId)

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

  // Pas de revalidatePath ici (David, 2026-09-28) : dans une Server Action, toute revalidation
  // renvoie la page admin courante entièrement recalculée — à chaque sélection, en pleine
  // saisie, d'où des sauts d'écran et un tableau qui se redessine. DraftBoard garde déjà les
  // sélections en état local, et /repechage-recrues est force-dynamic (relue à chaque visite
  // et à chaque rechargement automatique) : rien à invalider.
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

/**
 * Réinitialise le repêchage des recrues d'une saison (David, 2026-10-02 — zone de test, pour
 * refaire le repêchage depuis le début) : chaque recrue repêchée est retirée de l'alignement où
 * elle se trouve, et tous les choix redeviennent disponibles (sélections en attente effacées).
 * L'ordre et les propriétaires des choix ne changent pas. Refusé dès que la saison est démarrée.
 */
export async function resetRookieDraftAction(saisonId: number): Promise<{ error?: string; reset?: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: pooler } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!pooler?.is_admin) return { error: 'Accès refusé.' }

  const { data: saison } = await supabase.from('pool_seasons').select('season_started').eq('id', saisonId).single()
  if (!saison) return { error: 'Saison introuvable.' }
  if (saison.season_started) return { error: 'La saison est démarrée : le repêchage ne peut plus être réinitialisé.' }

  const { data: picks, error: picksErr } = await supabase
    .from('pool_draft_picks')
    .select('id, is_used')
    .eq('pool_season_id', saisonId)
  if (picksErr) return { error: picksErr.message }
  const pickIds = (picks ?? []).map(p => p.id)
  if (pickIds.length === 0) return { reset: 0 }

  // `draft_pick_id` remis à null en même temps : l'historique choix → joueur du tableau lit toutes
  // les lignes qui portent un draft_pick_id, actives ou non — une ancienne ligne ferait
  // réapparaître l'ancien joueur sur un choix refait.
  const { error: rosterErr } = await supabase
    .from('pooler_rosters')
    .update({ is_active: false, removed_at: new Date().toISOString(), draft_pick_id: null })
    .eq('pool_season_id', saisonId)
    .in('draft_pick_id', pickIds)
  if (rosterErr) return { error: rosterErr.message }

  const { error } = await supabase
    .from('pool_draft_picks')
    .update({ is_used: false, pending_player_id: null })
    .eq('pool_season_id', saisonId)
  if (error) return { error: error.message }
  await supabase.from('pool_seasons').update({ rookie_draft_timer_active: false, rookie_draft_turn_started_at: null }).eq('id', saisonId)

  revalidateDraftPages()
  return { reset: (picks ?? []).filter(p => p.is_used).length }
}

// ─── Tour en cours et chrono du repêchage des recrues (David, 2026-10-02) ───────
// État du chrono sur pool_seasons (rookie_draft_timer_active / _turn_started_at / _turn_seconds),
// durée par défaut dans app_settings.rookie_draft_turn_seconds. Indicatif : rien ne se passe à
// 00:00. `turn_started_at=null` pendant que le chrono est actif = en pause, `_turn_seconds`
// tient alors les secondes restantes — même convention que presaison_draft_state.

export type RookieOnTheClock = {
  pickId: number
  round: number
  draftOrder: number | null
  ownerId: string
  ownerName: string
  // Sélection enregistrée mais pas encore confirmée par l'admin (le tour ne change pas avant).
  pendingPlayerId: number | null
  pendingPlayerName: string | null
  nextOwnerName: string | null  // pooler du choix suivant, pour le libellé « passer à X »
}

export type RookieTurnState = {
  onTheClock: RookieOnTheClock | null
  timer: RookieTimer
  isDraftStarted: boolean
}

/** Choix « à l'horloge » : le premier choix pas encore officiel (non utilisé), par ronde puis
 * ordre — qu'une sélection y soit enregistrée ou non. Le tour ne passe au suivant que lorsque
 * l'admin confirme (David, 2026-10-02 : enregistrer le nom ne doit pas changer de pooler).
 * Lisible par tout pooler connecté. */
export async function getRookieTurnStateAction(saisonId: number): Promise<RookieTurnState> {
  const supabase = await createClient()
  const [{ data: saison }, { data: picks }] = await Promise.all([
    supabase
      .from('pool_seasons')
      .select('rookie_draft_timer_active, rookie_draft_turn_started_at, rookie_draft_turn_seconds')
      .eq('id', saisonId)
      .maybeSingle(),
    supabase
      .from('pool_draft_picks')
      .select('id, round, draft_order, is_used, pending_player_id, current_owner:poolers!current_owner_id(id, name), pending:players!pending_player_id(first_name, last_name)')
      .eq('pool_season_id', saisonId)
      .order('round')
      .order('draft_order')
      .order('id'),
  ])
  type Row = {
    id: number; round: number; draft_order: number | null; is_used: boolean; pending_player_id: number | null
    current_owner: { id: string; name: string } | null
    pending: { first_name: string; last_name: string } | null
  }
  const rows = (picks ?? []) as unknown as Row[]
  const open = rows.filter(p => !p.is_used && p.current_owner)
  const next = open[0] ?? null
  return {
    onTheClock: next
      ? {
          pickId: next.id, round: next.round, draftOrder: next.draft_order,
          ownerId: next.current_owner!.id, ownerName: next.current_owner!.name,
          pendingPlayerId: next.pending_player_id,
          pendingPlayerName: next.pending ? `${next.pending.first_name} ${next.pending.last_name}` : null,
          nextOwnerName: open[1]?.current_owner?.name ?? null,
        }
      : null,
    timer: {
      active: !!saison?.rookie_draft_timer_active,
      startedAt: saison?.rookie_draft_turn_started_at ?? null,
      seconds: saison?.rookie_draft_turn_seconds ?? DEFAULT_TURN_SECONDS,
    },
    isDraftStarted: rows.some(p => p.is_used || p.pending_player_id != null),
  }
}

async function requireAdminClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' } as const
  const { data: pooler } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!pooler?.is_admin) return { error: 'Accès refusé.' } as const
  return { supabase } as const
}

async function updateRookieTimer(saisonId: number, values: Record<string, unknown>): Promise<{ error?: string }> {
  const check = await requireAdminClient()
  if ('error' in check) return check
  const { error } = await check.supabase.from('pool_seasons').update(values).eq('id', saisonId)
  if (error) return { error: error.message }
  return {}
}

/** Notification push au pooler dont c'est le tour — même principe que le repêchage des agents
 * libres. Envoyée après la réponse (after), un échec d'envoi ne bloque jamais le repêchage. */
function notifyOnTheClock(state: RookieTurnState) {
  const next = state.onTheClock
  if (!next) return
  after(async () => {
    const { sendPushToUser } = await import('@/lib/push')
    await sendPushToUser(next.ownerId, {
      title: 'Cap Crunch — C\'est ton tour !',
      body: `Repêchage des recrues : ronde ${next.round}${next.draftOrder != null ? `, choix ${next.draftOrder}` : ''}.`,
      url: '/repechage-recrues',
    }).catch(() => {})
  })
}

/** Après la confirmation d'un choix (ou une soumission), si le repêchage est lancé : relance le
 * chrono pour le choix suivant et avertit son pooler (en pause : le chrono le reste, remis à la durée
 * complète) ; s'il ne reste aucun choix sans sélection, arrête le chrono. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function restartRookieTimerIfActive(supabase: any, saisonId: number) {
  const state = await getRookieTurnStateAction(saisonId)
  if (!state.timer.active) return
  if (!state.onTheClock) {
    await supabase.from('pool_seasons').update({ rookie_draft_timer_active: false, rookie_draft_turn_started_at: null }).eq('id', saisonId)
    return
  }
  const { rookie } = await fetchDraftTurnSeconds(supabase)
  await supabase.from('pool_seasons').update({
    rookie_draft_turn_started_at: state.timer.startedAt ? new Date().toISOString() : null,
    rookie_draft_turn_seconds: rookie,
  }).eq('id', saisonId)
  notifyOnTheClock(state)
}

/** « Confirmer le choix » (David, 2026-10-02) : rend officielle la sélection enregistrée pour le
 * choix à l'horloge — même opération que « Soumettre », pour ce seul choix — puis le tour passe
 * au pooler suivant. Tant que l'admin n'a pas confirmé, la sélection peut encore être changée. */
export async function confirmRookiePickAction(saisonId: number): Promise<{ error?: string }> {
  const check = await requireAdminClient()
  if ('error' in check) return check
  const state = await getRookieTurnStateAction(saisonId)
  const pick = state.onTheClock
  if (!pick) return { error: 'Aucun choix en cours.' }
  if (pick.pendingPlayerId == null) return { error: "Aucune recrue n'est sélectionnée pour ce choix." }
  const { data: saison } = await check.supabase.from('pool_seasons').select('season').eq('id', saisonId).single()
  if (!saison) return { error: 'Saison introuvable.' }
  const poolDraftYear = parseInt(saison.season.split('-')[0], 10)
  return submitDraftAction(saisonId, poolDraftYear, [{ pick_id: pick.pickId, player_id: pick.pendingPlayerId }])
}

/** « Démarrer le repêchage » : lance le chrono du choix en cours et avertit son pooler. */
export async function startRookieTimerAction(saisonId: number): Promise<{ error?: string }> {
  const check = await requireAdminClient()
  if ('error' in check) return check
  const { rookie } = await fetchDraftTurnSeconds(check.supabase)
  const result = await updateRookieTimer(saisonId, {
    rookie_draft_timer_active: true, rookie_draft_turn_started_at: new Date().toISOString(), rookie_draft_turn_seconds: rookie,
  })
  if (!result.error) notifyOnTheClock(await getRookieTurnStateAction(saisonId))
  return result
}

/** Remet le chrono du tour en cours à la durée complète, sans nouvelle notification. */
export async function resetRookieTimerAction(saisonId: number): Promise<{ error?: string }> {
  const check = await requireAdminClient()
  if ('error' in check) return check
  const { rookie } = await fetchDraftTurnSeconds(check.supabase)
  return updateRookieTimer(saisonId, {
    rookie_draft_timer_active: true, rookie_draft_turn_started_at: new Date().toISOString(), rookie_draft_turn_seconds: rookie,
  })
}

export async function stopRookieTimerAction(saisonId: number): Promise<{ error?: string }> {
  return updateRookieTimer(saisonId, { rookie_draft_timer_active: false, rookie_draft_turn_started_at: null })
}

export async function pauseRookieTimerAction(saisonId: number): Promise<{ error?: string }> {
  const state = await getRookieTurnStateAction(saisonId)
  if (!state.timer.active || !state.timer.startedAt) return {}
  return updateRookieTimer(saisonId, {
    rookie_draft_turn_started_at: null, rookie_draft_turn_seconds: remainingSeconds(state.timer, Date.now()),
  })
}

export async function resumeRookieTimerAction(saisonId: number): Promise<{ error?: string }> {
  return updateRookieTimer(saisonId, { rookie_draft_turn_started_at: new Date().toISOString() })
}

export async function adjustRookieTimerAction(saisonId: number, deltaSeconds: number): Promise<{ error?: string }> {
  const state = await getRookieTurnStateAction(saisonId)
  if (!state.timer.active) return {}
  return updateRookieTimer(saisonId, { rookie_draft_turn_seconds: Math.max(0, state.timer.seconds + deltaSeconds) })
}

/** Durées des deux chronos (Configuration → Général). */
export async function getDraftTurnSecondsAction(): Promise<DraftTurnSeconds> {
  const supabase = await createClient()
  return fetchDraftTurnSeconds(supabase)
}

export async function updateDraftTurnSecondsAction(values: DraftTurnSeconds): Promise<{ error?: string }> {
  const check = await requireAdminClient()
  if ('error' in check) return check
  for (const v of [values.rookie, values.presaison]) {
    if (!Number.isInteger(v) || v < MIN_TURN_SECONDS || v > MAX_TURN_SECONDS) {
      return { error: `Chaque durée doit être un nombre entier de secondes entre ${MIN_TURN_SECONDS} et ${MAX_TURN_SECONDS}.` }
    }
  }
  const { error } = await check.supabase
    .from('app_settings')
    .update({ rookie_draft_turn_seconds: values.rookie, presaison_turn_seconds: values.presaison })
    .eq('id', 1)
  if (error) return { error: error.message }
  return {}
}
