/**
 * Fetch partagé de `player_injuries` avec le signal d'admissibilité LTIR calculé (David,
 * 2026-09-23) — centralise la requête et le calcul plutôt que de les dupliquer dans les 5
 * endroits qui affichent le badge "Blessé"/"Admissible LTIR" (voir app/lib/ltirEligibility.ts
 * pour la règle elle-même).
 */

import type { createClient } from '@/lib/supabase/server'
import { computeDatesDisagree, computeLtirEligible, isOnNhlIr, DEFAULT_LTIR_SETTINGS, type LtirSettings } from './ltirEligibility'

export type InjuryInfo = {
  injuryType: string
  status: string
  eligible: boolean
  estReturnDate: string | null      // CBS d'abord, ESPN en repli — base du calcul LTIR
  espnEstReturnDate: string | null  // ESPN seul, pour signaler un désaccord (voir computeDatesDisagree)
  datesDisagree: boolean
}

type InjuryRowLike = {
  injury_type: string | null
  status: string | null
  est_return_date: string | null
  espn_est_return_date: string | null
  espn_status_desc: string | null
  first_seen_at: string
}

function toInjuryInfo(row: InjuryRowLike, settings: LtirSettings): InjuryInfo {
  return {
    injuryType: row.injury_type ?? '',
    status: row.status ?? '',
    eligible: computeLtirEligible({
      estReturnDate: row.est_return_date,
      firstSeenAt: row.first_seen_at,
      onNhlIr: isOnNhlIr(row.status, row.espn_status_desc),
    }, settings),
    estReturnDate: row.est_return_date,
    espnEstReturnDate: row.espn_est_return_date,
    datesDisagree: computeDatesDisagree(row.est_return_date, row.espn_est_return_date, settings),
  }
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

/** Seuils d'admissibilité LTIR configurés par l'admin (app_settings, voir ltirEligibility.ts) —
 * repli sur les défauts si la ligne ou une colonne manque. */
export async function fetchLtirSettings(supabase: SupabaseLike): Promise<LtirSettings> {
  const { data } = await supabase
    .from('app_settings')
    .select('ltir_return_min_days, ltir_injured_min_days, ltir_grace_days, injury_disagreement_days, injury_removal_absence_days')
    .eq('id', 1)
    .maybeSingle()
  const d = DEFAULT_LTIR_SETTINGS
  return {
    returnMinDays: data?.ltir_return_min_days ?? d.returnMinDays,
    injuredMinDays: data?.ltir_injured_min_days ?? d.injuredMinDays,
    graceDays: data?.ltir_grace_days ?? d.graceDays,
    disagreementDays: data?.injury_disagreement_days ?? d.disagreementDays,
    removalAbsenceDays: data?.injury_removal_absence_days ?? d.removalAbsenceDays,
  }
}

export async function fetchInjuriesByPlayerId(supabase: SupabaseLike): Promise<Map<number, InjuryInfo>> {
  const [{ data }, settings] = await Promise.all([
    supabase
      .from('player_injuries')
      .select('player_id, injury_type, status, est_return_date, espn_est_return_date, espn_status_desc, first_seen_at'),
    fetchLtirSettings(supabase),
  ])

  const map = new Map<number, InjuryInfo>()
  for (const row of data ?? []) {
    map.set(row.player_id, toInjuryInfo(row as InjuryRowLike, settings))
  }
  return map
}

/** Même chose, indexé par nhl_id — pour les composants qui n'ont pas le player_id interne
 * (ex: PlayerContrib de buildStandings(), voir /poolers/[id] onglet Alignement). */
export async function fetchInjuriesByNhlId(supabase: SupabaseLike): Promise<Map<number, InjuryInfo>> {
  const [{ data }, settings] = await Promise.all([
    supabase
      .from('player_injuries')
      .select('injury_type, status, est_return_date, espn_est_return_date, espn_status_desc, first_seen_at, players (nhl_id)'),
    fetchLtirSettings(supabase),
  ])

  const map = new Map<number, InjuryInfo>()
  for (const row of data ?? []) {
    const nhlId = (row.players as unknown as { nhl_id: number | null } | null)?.nhl_id
    if (!nhlId) continue
    map.set(nhlId, toInjuryInfo(row as unknown as InjuryRowLike, settings))
  }
  return map
}
