/**
 * Durées des chronos de repêchage (David, 2026-10-02) — paramétrables dans Admin → Gestion du
 * pool → Configuration → Général, selon ce qui sera décidé avec les poolers. Les chronos restent
 * indicatifs : rien ne se passe automatiquement à 00:00.
 */

export const DEFAULT_TURN_SECONDS = 120
export const MIN_TURN_SECONDS = 15
export const MAX_TURN_SECONDS = 3600

export type DraftTurnSeconds = { rookie: number; presaison: number }

// `any` : accepte le client de la requête comme le client admin (même forme d'appel).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchDraftTurnSeconds(supabase: any): Promise<DraftTurnSeconds> {
  const { data } = await supabase
    .from('app_settings')
    .select('rookie_draft_turn_seconds, presaison_turn_seconds')
    .eq('id', 1)
    .maybeSingle()
  return {
    rookie: data?.rookie_draft_turn_seconds ?? DEFAULT_TURN_SECONDS,
    presaison: data?.presaison_turn_seconds ?? DEFAULT_TURN_SECONDS,
  }
}

/** État du chrono du repêchage des recrues, porté par `pool_seasons` (une ligne par saison). */
export type RookieTimer = {
  active: boolean
  startedAt: string | null  // null pendant que `active` = en pause
  seconds: number           // durée du tour, ou secondes restantes figées pendant une pause
}

export function remainingSeconds(timer: RookieTimer, nowMs: number): number {
  if (!timer.startedAt) return timer.seconds
  return Math.max(0, timer.seconds - Math.floor((nowMs - new Date(timer.startedAt).getTime()) / 1000))
}

export const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
