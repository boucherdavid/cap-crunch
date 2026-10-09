/**
 * Fetch partagé de `player_injuries` avec le signal d'admissibilité LTIR calculé (David,
 * 2026-09-23) — centralise la requête et le calcul plutôt que de les dupliquer dans les 5
 * endroits qui affichent le badge "Blessé"/"Admissible LTIR" (voir app/lib/ltirEligibility.ts
 * pour la règle elle-même).
 */

import type { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeDatesDisagree, computeLtirEligible, countInjurySources, isOnNhlIr, playedSinceInjury, DEFAULT_LTIR_SETTINGS, MIN_INJURY_SOURCES, type LtirSettings } from './ltirEligibility'

export type InjuryInfo = {
  injuryType: string
  status: string
  eligible: boolean
  /** Encore listé blessé, mais a rejoué récemment (règle 0 de ltirEligibility.ts). */
  backInAction: boolean
  estReturnDate: string | null      // CBS d'abord, ESPN en repli — base du calcul LTIR
  espnEstReturnDate: string | null  // ESPN seul, pour signaler un désaccord (voir computeDatesDisagree)
  cbsReturnDate: string | null      // les trois dates sont affichées côte à côte par transparence
  mpReturnDate: string | null
  datesDisagree: boolean
}

type InjuryRowLike = {
  injury_type: string | null
  status: string | null
  est_return_date: string | null
  espn_est_return_date: string | null
  espn_status_desc: string | null
  mp_status: string | null
  mp_return_date: string | null
  in_cbs: boolean | null
  cbs_return_date: string | null
  first_seen_at: string
}

/**
 * Dernier match de la LNH joué par chacun de ces joueurs dans les `recentGameDays` derniers jours
 * (David, 2026-10-05) — alimente la règle 0. Client admin : `player_game_logs` n'est pas lu avec
 * le client de la requête ailleurs non plus (voir buildStandings).
 */
export async function fetchLastGameByPlayerId(playerIds: number[], settings: LtirSettings): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (playerIds.length === 0) return map
  const since = new Date(Date.now() - settings.recentGameDays * 86_400_000).toISOString()
  const { data } = await createAdminClient()
    .from('player_game_logs')
    .select('player_id, game_start_time')
    .in('player_id', playerIds)
    .gte('game_start_time', since)
    .order('game_start_time')
  for (const g of (data ?? []) as { player_id: number; game_start_time: string }[]) map.set(g.player_id, g.game_start_time)
  return map
}

function toInjuryInfo(row: InjuryRowLike, settings: LtirSettings, lastGameAt: string | null): InjuryInfo {
  const input = {
    estReturnDate: row.est_return_date,
    firstSeenAt: row.first_seen_at,
    onNhlIr: isOnNhlIr(row.status, row.espn_status_desc, row.mp_status),
    lastGameAt,
  }
  return {
    injuryType: row.injury_type ?? '',
    status: row.status ?? row.espn_status_desc ?? '',
    eligible: computeLtirEligible(input, settings),
    backInAction: playedSinceInjury(input, settings),
    estReturnDate: row.est_return_date,
    espnEstReturnDate: row.espn_est_return_date,
    cbsReturnDate: row.cbs_return_date,
    mpReturnDate: row.mp_return_date,
    datesDisagree: computeDatesDisagree(row.est_return_date, row.espn_est_return_date, settings),
  }
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

/** Seuils d'admissibilité LTIR configurés par l'admin (app_settings, voir ltirEligibility.ts) —
 * repli sur les défauts si la ligne ou une colonne manque. */
export async function fetchLtirSettings(supabase: SupabaseLike): Promise<LtirSettings> {
  // Colonne lue à part (2026-10-05) : tant que sa migration n'est pas roulée, une seule requête
  // échouerait en entier et ramènerait tous les seuils à leurs défauts.
  const [{ data }, { data: returnRow }, { data: recentRow }, { data: relapseRow }] = await Promise.all([
    supabase
      .from('app_settings')
      .select('ltir_return_min_days, ltir_injured_min_days, ltir_grace_days, injury_disagreement_days, injury_removal_absence_days')
      .eq('id', 1)
      .maybeSingle(),
    supabase.from('app_settings').select('ltir_return_deadline_days').eq('id', 1).maybeSingle(),
    supabase.from('app_settings').select('ltir_recent_game_days').eq('id', 1).maybeSingle(),
    supabase.from('app_settings').select('ltir_relapse_days').eq('id', 1).maybeSingle(),
  ])
  const d = DEFAULT_LTIR_SETTINGS
  return {
    returnMinDays: data?.ltir_return_min_days ?? d.returnMinDays,
    injuredMinDays: data?.ltir_injured_min_days ?? d.injuredMinDays,
    graceDays: data?.ltir_grace_days ?? d.graceDays,
    disagreementDays: data?.injury_disagreement_days ?? d.disagreementDays,
    removalAbsenceDays: data?.injury_removal_absence_days ?? d.removalAbsenceDays,
    returnDeadlineDays: returnRow?.ltir_return_deadline_days ?? d.returnDeadlineDays,
    recentGameDays: recentRow?.ltir_recent_game_days ?? d.recentGameDays,
    relapseDays: relapseRow?.ltir_relapse_days ?? d.relapseDays,
  }
}

export async function fetchInjuriesByPlayerId(supabase: SupabaseLike): Promise<Map<number, InjuryInfo>> {
  const [{ data }, settings] = await Promise.all([
    supabase
      .from('player_injuries')
      .select('player_id, injury_type, status, est_return_date, espn_est_return_date, espn_status_desc, mp_status, mp_return_date, in_cbs, cbs_return_date, first_seen_at'),
    fetchLtirSettings(supabase),
  ])

  const lastGames = await fetchLastGameByPlayerId((data ?? []).map(r => r.player_id as number), settings)
  const map = new Map<number, InjuryInfo>()
  for (const row of data ?? []) {
    // Une seule source : pas encore considéré blessé (voir MIN_INJURY_SOURCES).
    if (countInjurySources(row) < MIN_INJURY_SOURCES) continue
    map.set(row.player_id, toInjuryInfo(row as InjuryRowLike, settings, lastGames.get(row.player_id) ?? null))
  }
  return map
}

/** Même chose, indexé par nhl_id — pour les composants qui n'ont pas le player_id interne
 * (ex: PlayerContrib de buildStandings(), voir /poolers/[id] onglet Alignement). */
export async function fetchInjuriesByNhlId(supabase: SupabaseLike): Promise<Map<number, InjuryInfo>> {
  const [{ data }, settings] = await Promise.all([
    supabase
      .from('player_injuries')
      .select('player_id, injury_type, status, est_return_date, espn_est_return_date, espn_status_desc, mp_status, mp_return_date, in_cbs, cbs_return_date, first_seen_at, players (nhl_id)'),
    fetchLtirSettings(supabase),
  ])

  const lastGames = await fetchLastGameByPlayerId((data ?? []).map(r => r.player_id as number), settings)
  const map = new Map<number, InjuryInfo>()
  for (const row of data ?? []) {
    const nhlId = (row.players as unknown as { nhl_id: number | null } | null)?.nhl_id
    if (!nhlId) continue
    if (countInjurySources(row) < MIN_INJURY_SOURCES) continue
    map.set(nhlId, toInjuryInfo(row as unknown as InjuryRowLike, settings, lastGames.get(row.player_id as number) ?? null))
  }
  return map
}
