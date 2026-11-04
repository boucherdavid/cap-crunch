'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { fetchScratchSettings, MAX_SCRATCH_GAMES, MIN_SCRATCH_GAMES, type ScratchSettings } from '@/lib/scratchSettings'

export async function getScratchSettingsAction(): Promise<ScratchSettings> {
  const supabase = await createClient()
  return fetchScratchSettings(supabase)
}

export async function updateScratchSettingsAction(settings: ScratchSettings): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }
  for (const n of [settings.skaterGames, settings.goalieGames]) {
    if (!Number.isInteger(n) || n < MIN_SCRATCH_GAMES || n > MAX_SCRATCH_GAMES) {
      return { error: `Chaque seuil doit être un nombre entier de matchs entre ${MIN_SCRATCH_GAMES} et ${MAX_SCRATCH_GAMES}.` }
    }
  }
  const { error } = await supabase
    .from('app_settings')
    .update({ scratch_skater_games: settings.skaterGames, scratch_goalie_games: settings.goalieGames })
    .eq('id', 1)
  if (error) return { error: error.message }
  revalidatePath('/aide')
  return {}
}
