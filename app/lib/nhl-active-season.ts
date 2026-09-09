/**
 * Résolution de la saison NHL active — dépend de lib/supabase/server (next/headers),
 * donc séparé de lib/nhl-stats.ts qui doit rester importable depuis un composant client
 * (ResultatsManager.tsx via daily-recap.ts). Ne jamais réimporter ceci depuis un fichier
 * lui-même accessible côté client — voir SUIVI_PROJET.md 2026-09-09 pour l'incident de
 * build causé par ce mélange.
 */

import { createClient } from '@/lib/supabase/server'
import { NHL_SEASON, toNhlSeasonId } from '@/lib/nhl-stats'

/** Lit la saison active depuis pool_seasons et retourne l'id NHL (ex: "20262027"). Fallback sur NHL_SEASON. */
export async function fetchActiveNhlSeasonId(isPlayoff: boolean): Promise<string> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('pool_seasons')
      .select('season')
      .eq('is_active', true)
      .eq('is_playoff', isPlayoff)
      .single()
    if (data?.season) return toNhlSeasonId(data.season)
    return NHL_SEASON
  } catch {
    return NHL_SEASON
  }
}
