/**
 * Fetch partagé de `player_injuries` avec le signal d'admissibilité LTIR calculé (David,
 * 2026-09-23) — centralise la requête et le calcul plutôt que de les dupliquer dans les 5
 * endroits qui affichent le badge "Blessé"/"Admissible LTIR" (voir app/lib/ltirEligibility.ts
 * pour la règle elle-même).
 */

import type { createClient } from '@/lib/supabase/server'
import { computeLtirEligible } from './ltirEligibility'

export type InjuryInfo = { injuryType: string; status: string; eligible: boolean }

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export async function fetchInjuriesByPlayerId(supabase: SupabaseLike): Promise<Map<number, InjuryInfo>> {
  const { data } = await supabase
    .from('player_injuries')
    .select('player_id, injury_type, status, est_return_date, first_seen_at')

  const map = new Map<number, InjuryInfo>()
  for (const row of data ?? []) {
    map.set(row.player_id, {
      injuryType: row.injury_type ?? '',
      status: row.status ?? '',
      eligible: computeLtirEligible({
        estReturnDate: row.est_return_date,
        firstSeenAt: row.first_seen_at as string,
      }),
    })
  }
  return map
}

/** Même chose, indexé par nhl_id — pour les composants qui n'ont pas le player_id interne
 * (ex: PlayerContrib de buildStandings(), voir /poolers/[id] onglet Alignement). */
export async function fetchInjuriesByNhlId(supabase: SupabaseLike): Promise<Map<number, InjuryInfo>> {
  const { data } = await supabase
    .from('player_injuries')
    .select('injury_type, status, est_return_date, first_seen_at, players (nhl_id)')

  const map = new Map<number, InjuryInfo>()
  for (const row of data ?? []) {
    const nhlId = (row.players as unknown as { nhl_id: number | null } | null)?.nhl_id
    if (!nhlId) continue
    map.set(nhlId, {
      injuryType: row.injury_type ?? '',
      status: row.status ?? '',
      eligible: computeLtirEligible({
        estReturnDate: row.est_return_date,
        firstSeenAt: row.first_seen_at as string,
      }),
    })
  }
  return map
}
