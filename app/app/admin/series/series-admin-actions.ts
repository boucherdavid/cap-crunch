'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { PlayoffPoolSaison } from '@/app/gestion-series/playoff-pool-actions'
import { getAllPlayoffPoolRostersAction } from '@/app/gestion-series/playoff-pool-actions'
import { sendPushToUser } from '@/lib/push'

export { getAllPlayoffPoolRostersAction }

export type EliminatedTeam = {
  id: number
  teamId: number
  teamCode: string
  teamName: string
}

export async function getPlayoffPoolSaisonAction(): Promise<PlayoffPoolSaison | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pool_seasons')
    .select('id, season, pool_cap, playoff_submission_deadline, playoff_max_changes, playoff_max_elim_changes, playoff_max_f, playoff_max_d, playoff_max_g, gestion_effectifs_ouvert')
    .eq('is_active', true)
    .eq('is_playoff', true)
    .single()
  if (!data) return null
  return {
    id: data.id,
    season: data.season,
    poolCap: Number(data.pool_cap),
    submissionDeadline: data.playoff_submission_deadline ?? null,
    maxChanges: data.playoff_max_changes ?? 5,
    maxElimChanges: data.playoff_max_elim_changes ?? 5,
    maxF: data.playoff_max_f ?? 5,
    maxD: data.playoff_max_d ?? 3,
    maxG: data.playoff_max_g ?? 1,
    gestionOuverte: data.gestion_effectifs_ouvert ?? true,
  }
}

export async function getEliminatedTeamsForPoolAction(poolSeasonId: number): Promise<EliminatedTeam[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('playoff_eliminations')
    .select('id, team_id, teams(code, name)')
    .eq('pool_season_id', poolSeasonId)
    .order('id')
  return (data ?? []).map((e: any) => ({
    id: e.id,
    teamId: e.team_id,
    teamCode: e.teams?.code ?? '',
    teamName: e.teams?.name ?? '',
  }))
}

export async function markTeamEliminatedAction(
  poolSeasonId: number,
  teamId: number,
): Promise<{ error?: string }> {
  try {
    const db = createAdminClient()
    const { error } = await db.from('playoff_eliminations').upsert(
      { pool_season_id: poolSeasonId, team_id: teamId, eliminated_in_round: 1 },
      { onConflict: 'pool_season_id,team_id', ignoreDuplicates: true },
    )
    if (error) return { error: error.message }

    // Notifier les poolers qui ont un joueur actif de cette équipe
    const [{ data: teamRow }, { data: impacted }] = await Promise.all([
      db.from('teams').select('code, name').eq('id', teamId).single(),
      db.from('playoff_pool_rosters')
        .select('pooler_id, players!inner(team_id)')
        .eq('pool_season_id', poolSeasonId)
        .eq('is_active', true)
        .eq('players.team_id', teamId),
    ])

    const teamLabel = teamRow ? `${teamRow.code} — ${teamRow.name}` : `équipe #${teamId}`
    const uniquePoolerIds = [...new Set((impacted ?? []).map((r: any) => r.pooler_id))]

    await Promise.allSettled(
      uniquePoolerIds.map(poolerId =>
        sendPushToUser(poolerId, {
          title: '⚠️ Équipe éliminée — Pool des séries',
          body: `${teamLabel} est éliminée. Remplace ton joueur avant la prochaine ronde.`,
          url: '/gestion-series',
        }),
      ),
    )

    revalidatePath('/admin/series')
    revalidatePath('/gestion-series')
    return {}
  } catch (e: any) {
    return { error: e?.message ?? 'Erreur inconnue' }
  }
}

export async function removeEliminationAction(eliminationId: number): Promise<{ error?: string }> {
  try {
    const db = createAdminClient()
    const { error } = await db.from('playoff_eliminations').delete().eq('id', eliminationId)
    if (error) return { error: error.message }
    revalidatePath('/admin/series')
    revalidatePath('/gestion-series')
    return {}
  } catch (e: any) {
    return { error: e?.message ?? 'Erreur inconnue' }
  }
}

export async function sendDeadlineReminderAction(
  poolSeasonId: number,
): Promise<{ error?: string; sent?: number }> {
  try {
    const db = createAdminClient()
    const { data: saison } = await db
      .from('pool_seasons')
      .select('season, playoff_submission_deadline')
      .eq('id', poolSeasonId)
      .single()
    if (!saison) return { error: 'Saison introuvable' }
    if (!saison.playoff_submission_deadline) return { error: 'Aucune date limite configurée' }

    const deadline = new Date(saison.playoff_submission_deadline)
    const deadlineStr = deadline.toLocaleString('fr-CA', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Toronto', timeZoneName: 'short',
    })

    const { data: poolers } = await db.from('poolers').select('id').eq('is_admin', false)
    const ids = (poolers ?? []).map((p: any) => p.id)

    await Promise.allSettled(
      ids.map((id: string) =>
        sendPushToUser(id, {
          title: '⏰ Rappel — Pool des séries',
          body: `Date limite de soumission : ${deadlineStr}`,
          url: '/gestion-series',
        }),
      ),
    )

    return { sent: ids.length }
  } catch (e: any) {
    return { error: e?.message ?? 'Erreur inconnue' }
  }
}

export async function getParticipatingTeamsAction(poolSeasonId: number): Promise<number[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('playoff_participating_teams')
    .select('team_id')
    .eq('pool_season_id', poolSeasonId)
  return (data ?? []).map((r: any) => r.team_id)
}

export async function setParticipatingTeamsAction(
  poolSeasonId: number,
  teamIds: number[],
): Promise<{ error?: string }> {
  try {
    const db = createAdminClient()
    await db.from('playoff_participating_teams').delete().eq('pool_season_id', poolSeasonId)
    if (teamIds.length > 0) {
      const { error } = await db.from('playoff_participating_teams').insert(
        teamIds.map(team_id => ({ pool_season_id: poolSeasonId, team_id })),
      )
      if (error) return { error: error.message }
    }
    revalidatePath('/admin/series')
    revalidatePath('/gestion-series')
    return {}
  } catch (e: any) {
    return { error: e?.message ?? 'Erreur inconnue' }
  }
}
