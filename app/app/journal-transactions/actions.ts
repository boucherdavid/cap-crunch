'use server'

import { getNhlPlayedGames, type NhlPlayedGame } from '@/lib/nhlPlayerGames'

/** Relevé officiel d'un joueur (API de la LNH, en cache 1 h — aucune lecture de Supabase). */
export async function getNhlPlayedGamesAction(nhlId: number, nhlSeason: number): Promise<NhlPlayedGame[] | null> {
  if (!Number.isInteger(nhlId) || !Number.isInteger(nhlSeason)) return null
  return getNhlPlayedGames(nhlId, nhlSeason)
}
