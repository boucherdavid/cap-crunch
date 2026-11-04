/**
 * Seuils du badge « laissé de côté » (`app_settings.scratch_skater_games` / `scratch_goalie_games`)
 * — David, 2026-11-04, réglés dans Configuration → Général. Nombre de matchs consécutifs de son
 * équipe qu'un joueur n'a pas joués avant d'afficher le badge ; plus élevé pour un gardien, qui ne
 * joue pas tous les matchs même en santé. Fichier sans dépendance serveur.
 */

export const DEFAULT_SCRATCH_SKATER_GAMES = 2
export const DEFAULT_SCRATCH_GOALIE_GAMES = 5
export const MIN_SCRATCH_GAMES = 1
export const MAX_SCRATCH_GAMES = 20

export type ScratchSettings = { skaterGames: number; goalieGames: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchScratchSettings(supabase: any): Promise<ScratchSettings> {
  const { data } = await supabase
    .from('app_settings').select('scratch_skater_games, scratch_goalie_games').eq('id', 1).maybeSingle()
  return {
    skaterGames: data?.scratch_skater_games ?? DEFAULT_SCRATCH_SKATER_GAMES,
    goalieGames: data?.scratch_goalie_games ?? DEFAULT_SCRATCH_GOALIE_GAMES,
  }
}
