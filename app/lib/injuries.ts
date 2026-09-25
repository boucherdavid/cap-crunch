/**
 * Fetch partagé de `player_injuries` avec le signal d'admissibilité LTIR calculé (David,
 * 2026-09-23) — centralise la requête et le calcul plutôt que de les dupliquer dans les 5
 * endroits qui affichent le badge "Blessé"/"Admissible LTIR" (voir app/lib/ltirEligibility.ts
 * pour la règle elle-même).
 */

import type { createClient } from '@/lib/supabase/server'
import { computeDatesDisagree, computeLtirEligible } from './ltirEligibility'

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
  first_seen_at: string
}

function toInjuryInfo(row: InjuryRowLike): InjuryInfo {
  return {
    injuryType: row.injury_type ?? '',
    status: row.status ?? '',
    eligible: computeLtirEligible({ estReturnDate: row.est_return_date, firstSeenAt: row.first_seen_at }),
    estReturnDate: row.est_return_date,
    espnEstReturnDate: row.espn_est_return_date,
    datesDisagree: computeDatesDisagree(row.est_return_date, row.espn_est_return_date),
  }
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export async function fetchInjuriesByPlayerId(supabase: SupabaseLike): Promise<Map<number, InjuryInfo>> {
  const { data } = await supabase
    .from('player_injuries')
    .select('player_id, injury_type, status, est_return_date, espn_est_return_date, first_seen_at')

  const map = new Map<number, InjuryInfo>()
  for (const row of data ?? []) {
    map.set(row.player_id, toInjuryInfo(row as InjuryRowLike))
  }
  return map
}

/** Même chose, indexé par nhl_id — pour les composants qui n'ont pas le player_id interne
 * (ex: PlayerContrib de buildStandings(), voir /poolers/[id] onglet Alignement). */
export async function fetchInjuriesByNhlId(supabase: SupabaseLike): Promise<Map<number, InjuryInfo>> {
  const { data } = await supabase
    .from('player_injuries')
    .select('injury_type, status, est_return_date, espn_est_return_date, first_seen_at, players (nhl_id)')

  const map = new Map<number, InjuryInfo>()
  for (const row of data ?? []) {
    const nhlId = (row.players as unknown as { nhl_id: number | null } | null)?.nhl_id
    if (!nhlId) continue
    map.set(nhlId, toInjuryInfo(row as unknown as InjuryRowLike))
  }
  return map
}
