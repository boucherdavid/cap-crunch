'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * « Empreinte » de l'état d'un repêchage (David, 2026-10-01) — une courte chaîne qui change dès
 * que le tour avance. `TurnWatcher` la sonde toutes les quelques secondes et ne recharge la page
 * que si elle a changé : chaque pooler voit que c'est son tour presque tout de suite, sans le
 * clignotement d'un rechargement complet à intervalle court (voir AutoReload.tsx).
 */

/** Signatures des agents libres : tour en cours, chrono (pause/reprise comprises), début/fin. */
export async function getPresaisonTurnSignatureAction(saisonId: number): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('presaison_draft_state')
    .select('is_active, queue, turn_started_at, turn_duration_seconds, ended_at, release_phase_open')
    .eq('pool_season_id', saisonId)
    .maybeSingle()
  if (!data) return null
  return [
    data.is_active, (data.queue as string[] | null)?.join(',') ?? '', data.turn_started_at ?? '',
    data.turn_duration_seconds, data.ended_at ?? '', data.release_phase_open,
  ].join('|')
}

/** Repêchage des recrues : choix restants et sélection en attente de confirmation. */
export async function getRookieDraftSignatureAction(saisonId: number): Promise<string | null> {
  const supabase = await createClient()
  const [{ data }, { data: saison }] = await Promise.all([
    supabase
      .from('pool_draft_picks')
      .select('id, pending_player_id, current_owner_id')
      .eq('pool_season_id', saisonId)
      .eq('is_used', false)
      .order('id'),
    // Chrono compris : une pause, une reprise ou un ajustement par l'admin se voit aussi.
    supabase
      .from('pool_seasons')
      .select('rookie_draft_timer_active, rookie_draft_turn_started_at, rookie_draft_turn_seconds')
      .eq('id', saisonId)
      .maybeSingle(),
  ])
  if (!data) return null
  const timer = `${saison?.rookie_draft_timer_active ?? ''}:${saison?.rookie_draft_turn_started_at ?? ''}:${saison?.rookie_draft_turn_seconds ?? ''}`
  return `${timer}#` + data.map(p => `${p.id}:${p.pending_player_id ?? ''}:${p.current_owner_id ?? ''}`).join('|')
}
