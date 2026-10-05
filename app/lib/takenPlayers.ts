/**
 * Joueurs « pris » — présents dans un alignement de la saison régulière active (actif,
 * réserviste, LTIR ou banque de recrues), libérés exclus. Sert la pastille de disponibilité de
 * /statistiques, /statistiques/projections et /statistiques/ahl.
 *
 * Jumelage par nhl_id d'abord (2026-10-05) : comparer les noms ratait les surnoms
 * (« Mitch Marner » dans l'API LNH vs « Mitchell Marner » en base → affiché disponible alors
 * qu'il était chez Steve). Le nom ne sert que pour un joueur sans nhl_id, ou une source sans
 * identifiant LNH (AHL).
 *
 * Serveur seulement — nhl-stats.ts est aussi importé côté client, d'où ce fichier séparé.
 */
import { createClient } from '@/lib/supabase/server'
import { normName } from '@/lib/nhl-stats'

export type TakenPlayers = {
  nhlIds: number[]
  /** Noms normalisés des joueurs pris qui n'ont pas de nhl_id. */
  namesWithoutNhlId: string[]
  /** Noms normalisés de tous les joueurs pris (sources sans nhl_id, ex. AHL). */
  allNames: string[]
}

const EMPTY: TakenPlayers = { nhlIds: [], namesWithoutNhlId: [], allNames: [] }

export async function fetchTakenPlayers(): Promise<TakenPlayers> {
  try {
    const supabase = await createClient()
    const { data: season } = await supabase
      .from('pool_seasons')
      .select('id')
      .eq('is_active', true)
      .eq('is_playoff', false)
      .single()
    if (!season) return EMPTY

    const { data: rosters } = await supabase
      .from('pooler_rosters')
      .select('players(nhl_id, first_name, last_name)')
      .eq('pool_season_id', season.id)
      .is('removed_at', null)
    if (!rosters) return EMPTY

    const taken: TakenPlayers = { nhlIds: [], namesWithoutNhlId: [], allNames: [] }
    for (const r of rosters) {
      const p = r.players as unknown as { nhl_id: number | null; first_name: string; last_name: string } | null
      if (!p) continue
      const name = normName(`${p.first_name} ${p.last_name}`)
      taken.allNames.push(name)
      if (p.nhl_id) taken.nhlIds.push(p.nhl_id)
      else taken.namesWithoutNhlId.push(name)
    }
    return taken
  } catch {
    return EMPTY
  }
}

/** Vrai si le joueur est pris — nhl_id d'abord, nom en repli. Pur, utilisable côté client. */
export function isTakenPlayer(
  idSet: Set<number>,
  nameSet: Set<string>,
  nhlId: number | null | undefined,
  firstName: string,
  lastName: string,
): boolean {
  if (nhlId && idSet.has(nhlId)) return true
  return nameSet.has(normName(`${firstName} ${lastName}`))
}
