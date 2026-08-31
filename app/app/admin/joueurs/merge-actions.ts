'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type PlayerSearchResult = {
  id: number
  first_name: string
  last_name: string
  position: string | null
  nhl_id: number | null
  is_rookie: boolean
  teams: { code: string } | null
  player_contracts: { season: string; cap_number: number }[]
}

export async function searchPlayersAction(query: string): Promise<PlayerSearchResult[]> {
  if (query.trim().length < 2) return []
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const q = query.trim()
  const { data } = await supabase
    .rpc('search_players_unaccent', { search_term: q })
    .select('id, first_name, last_name, position, nhl_id, is_rookie, teams(code), player_contracts(season, cap_number)')
    .order('last_name')
    .limit(20)

  return (data ?? []) as unknown as PlayerSearchResult[]
}

export async function mergePlayersAction(
  keepId: number,
  dupId: number,
): Promise<{ error?: string; summary?: string }> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await userClient.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }
  if (keepId === dupId) return { error: 'Les deux joueurs doivent être différents.' }

  const db = createAdminClient()
  const ops: string[] = []

  // ── Enrichir le joueur à garder avec les champs manquants du doublon ───────
  const [{ data: keepPlayer }, { data: dupPlayer }] = await Promise.all([
    db.from('players').select('draft_year, draft_round, draft_overall, nhl_id').eq('id', keepId).single(),
    db.from('players').select('draft_year, draft_round, draft_overall, nhl_id').eq('id', dupId).single(),
  ])
  if (keepPlayer && dupPlayer) {
    const updates: Record<string, unknown> = {}
    if (!keepPlayer.draft_year   && dupPlayer.draft_year)   updates.draft_year    = dupPlayer.draft_year
    if (!keepPlayer.draft_round  && dupPlayer.draft_round)  updates.draft_round   = dupPlayer.draft_round
    if (!keepPlayer.draft_overall && dupPlayer.draft_overall) updates.draft_overall = dupPlayer.draft_overall
    if (!keepPlayer.nhl_id       && dupPlayer.nhl_id)       updates.nhl_id        = dupPlayer.nhl_id
    if (Object.keys(updates).length > 0) {
      await db.from('players').update(updates).eq('id', keepId)
      ops.push(`players (enrichi: ${Object.keys(updates).join(', ')})`)
    }
  }

  // ── player_contracts ──────────────────────────────────────────────────────
  // Récupérer les saisons déjà couvertes par le joueur à garder
  const { data: keepContracts } = await db
    .from('player_contracts')
    .select('season')
    .eq('player_id', keepId)
  const keepSeasons = new Set((keepContracts ?? []).map(c => c.season))

  const { data: dupContracts } = await db
    .from('player_contracts')
    .select('season')
    .eq('player_id', dupId)

  for (const c of dupContracts ?? []) {
    if (keepSeasons.has(c.season)) {
      await db.from('player_contracts').delete().eq('player_id', dupId).eq('season', c.season)
    } else {
      await db.from('player_contracts').update({ player_id: keepId }).eq('player_id', dupId).eq('season', c.season)
    }
  }
  ops.push('player_contracts')

  // ── pooler_rosters ─────────────────────────────────────────────────────────
  const { data: dupRosters } = await db
    .from('pooler_rosters')
    .select('id, pooler_id, pool_season_id')
    .eq('player_id', dupId)

  for (const r of dupRosters ?? []) {
    // Vérifier si keep_id est déjà dans ce roster (même pooler + saison)
    const { data: conflict } = await db
      .from('pooler_rosters')
      .select('id')
      .eq('player_id', keepId)
      .eq('pooler_id', r.pooler_id)
      .eq('pool_season_id', r.pool_season_id)
      .maybeSingle()
    if (conflict) {
      await db.from('pooler_rosters').delete().eq('id', r.id)
    } else {
      await db.from('pooler_rosters').update({ player_id: keepId }).eq('id', r.id)
    }
  }
  ops.push('pooler_rosters')

  // ── player_game_logs ───────────────────────────────────────────────────────
  // Supprimer les logs du doublon qui conflictent (même date/saison/type)
  const { data: dupLogs } = await db
    .from('player_game_logs')
    .select('id, game_date, season, game_type')
    .eq('player_id', dupId)

  for (const log of dupLogs ?? []) {
    const { data: conflict } = await db
      .from('player_game_logs')
      .select('id')
      .eq('player_id', keepId)
      .eq('game_date', log.game_date)
      .eq('season', log.season)
      .eq('game_type', log.game_type)
      .maybeSingle()
    if (conflict) {
      await db.from('player_game_logs').delete().eq('id', log.id)
    } else {
      await db.from('player_game_logs').update({ player_id: keepId }).eq('id', log.id)
    }
  }
  ops.push('player_game_logs')

  // ── Tables sans contrainte unique sur player_id ────────────────────────────
  await db.from('player_stat_snapshots').update({ player_id: keepId }).eq('player_id', dupId)
  await db.from('roster_change_log').update({ player_id: keepId }).eq('player_id', dupId)

  // playoff_pool_rosters si elle existe
  try {
    await db.from('playoff_pool_rosters' as never).update({ player_id: keepId } as never).eq('player_id', dupId)
  } catch { /* table peut ne pas exister */ }

  ops.push('stat_snapshots', 'roster_change_log')

  // ── Supprimer le doublon ───────────────────────────────────────────────────
  const { error: deleteError } = await db.from('players').delete().eq('id', dupId)
  if (deleteError) return { error: `Impossible de supprimer le doublon : ${deleteError.message}` }

  return { summary: `Fusion complète. Tables mises à jour : ${ops.join(', ')}. Joueur #${dupId} supprimé.` }
}
