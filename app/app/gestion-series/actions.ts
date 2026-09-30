'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'


// ─── Types ────────────────────────────────────────────────────────────────────

export type PlayoffSaison = {
  id: number
  season: string
  poolCap: number
  gestionEffectifsOuvert: boolean
}

export type PlayoffRound = {
  id: number
  poolSeasonId: number
  roundNumber: number
  submissionDeadline: string | null
  maxChanges: number
  maxF: number
  maxD: number
  maxG: number
  capPerRound: number | null
  isActive: boolean
  isFrozen: boolean
  teamIds: number[]
}

export type PlayoffRosterEntry = {
  id: number
  playerId: number
  positionSlot: 'F' | 'D' | 'G'
  firstName: string
  lastName: string
  position: string | null
  teamCode: string | null
  teamId: number | null
  nhlId: number | null
  capNumber: number | null
  teamEliminated: boolean
  addedAt: string
}

export type EliminatedTeam = {
  id: number
  teamId: number
  teamCode: string
  teamName: string
  eliminatedInRound: number
}

export type PlayoffPlayerResult = {
  id: number
  firstName: string
  lastName: string
  position: string | null
  teamCode: string | null
  teamId: number | null
  nhlId: number | null
  capNumber: number | null
  teamEliminated: boolean
}

export type AllPoolersRosters = {
  poolerId: string
  poolerName: string
  entries: PlayoffRosterEntry[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toRound(data: any): PlayoffRound {
  const deadline = data.submission_deadline ? new Date(data.submission_deadline) : null
  return {
    id: data.id,
    poolSeasonId: data.pool_season_id,
    roundNumber: data.round_number,
    submissionDeadline: data.submission_deadline ?? null,
    maxChanges: data.max_changes ?? 2,
    maxF: data.max_f ?? 3,
    maxD: data.max_d ?? 2,
    maxG: data.max_g ?? 1,
    capPerRound: data.cap_per_round ? Number(data.cap_per_round) : null,
    isActive: data.is_active,
    isFrozen: deadline ? new Date() > deadline : false,
    teamIds: (data.playoff_round_teams ?? []).map((t: any) => t.team_id),
  }
}

// ─── Read actions ─────────────────────────────────────────────────────────────

export async function getActivePlayoffSaisonAction(): Promise<PlayoffSaison | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pool_seasons')
    .select('id, season, pool_cap, gestion_effectifs_ouvert')
    .eq('is_active', true)
    .eq('is_playoff', true)
    .single()
  if (!data) return null
  return {
    id: data.id,
    season: data.season,
    poolCap: Number(data.pool_cap),
    gestionEffectifsOuvert: data.gestion_effectifs_ouvert ?? true,
  }
}

export async function getAllRoundsAction(poolSeasonId: number): Promise<PlayoffRound[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('playoff_rounds')
    .select('*, playoff_round_teams(team_id)')
    .eq('pool_season_id', poolSeasonId)
    .order('round_number')
  return (data ?? []).map(toRound)
}

export async function getActiveRoundAction(poolSeasonId: number): Promise<PlayoffRound | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('playoff_rounds')
    .select('*, playoff_round_teams(team_id)')
    .eq('pool_season_id', poolSeasonId)
    .eq('is_active', true)
    .single()
  if (!data) return null
  return toRound(data)
}

export async function getEliminatedTeamsAction(poolSeasonId: number): Promise<EliminatedTeam[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('playoff_eliminations')
    .select('id, team_id, eliminated_in_round, teams (code, name)')
    .eq('pool_season_id', poolSeasonId)
    .order('eliminated_in_round')
  return (data ?? []).map((e: any) => ({
    id: e.id,
    teamId: e.team_id,
    teamCode: e.teams?.code ?? '',
    teamName: e.teams?.name ?? '',
    eliminatedInRound: e.eliminated_in_round,
  }))
}

export async function getPoolerPlayoffRosterAction(
  poolerId: string,
  roundId: number,
  poolSeasonId: number,
  season: string,
): Promise<PlayoffRosterEntry[]> {
  const supabase = await createClient()
  const [{ data: entries }, { data: elims }] = await Promise.all([
    supabase
      .from('series_round_rosters')
      .select(`
        id, player_id, position_slot, added_at,
        players (
          first_name, last_name, position, nhl_id,
          teams (id, code),
          player_contracts (season, cap_number)
        )
      `)
      .eq('pooler_id', poolerId)
      .eq('round_id', roundId)
      .eq('is_active', true),
    supabase
      .from('playoff_eliminations')
      .select('team_id')
      .eq('pool_season_id', poolSeasonId),
  ])

  const eliminatedIds = new Set((elims ?? []).map((e: any) => e.team_id))

  return (entries ?? []).map((r: any) => ({
    id: r.id,
    playerId: r.player_id,
    positionSlot: r.position_slot as 'F' | 'D' | 'G',
    firstName: r.players?.first_name ?? '',
    lastName: r.players?.last_name ?? '',
    position: r.players?.position ?? null,
    teamCode: r.players?.teams?.code ?? null,
    teamId: r.players?.teams?.id ?? null,
    nhlId: r.players?.nhl_id ?? null,
    capNumber: r.players?.player_contracts?.find((c: any) => c.season === season)?.cap_number ?? null,
    teamEliminated: eliminatedIds.has(r.players?.teams?.id),
    addedAt: r.added_at,
  }))
}

export async function getAllPoolersRostersAction(
  roundId: number,
  poolSeasonId: number,
  season: string,
): Promise<AllPoolersRosters[]> {
  const supabase = await createClient()
  const [{ data: poolers }, { data: entries }, { data: elims }] = await Promise.all([
    supabase.from('poolers').select('id, name').order('name'),
    supabase
      .from('series_round_rosters')
      .select(`
        id, pooler_id, player_id, position_slot, added_at,
        players (
          first_name, last_name, position, nhl_id,
          teams (id, code),
          player_contracts (season, cap_number)
        )
      `)
      .eq('round_id', roundId)
      .eq('is_active', true),
    supabase
      .from('playoff_eliminations')
      .select('team_id')
      .eq('pool_season_id', poolSeasonId),
  ])

  const eliminatedIds = new Set((elims ?? []).map((e: any) => e.team_id))

  return (poolers ?? []).map(p => ({
    poolerId: p.id,
    poolerName: p.name,
    entries: (entries ?? [])
      .filter((e: any) => e.pooler_id === p.id)
      .map((r: any) => ({
        id: r.id,
        playerId: r.player_id,
        positionSlot: r.position_slot as 'F' | 'D' | 'G',
        firstName: r.players?.first_name ?? '',
        lastName: r.players?.last_name ?? '',
        position: r.players?.position ?? null,
        teamCode: r.players?.teams?.code ?? null,
        teamId: r.players?.teams?.id ?? null,
        nhlId: r.players?.nhl_id ?? null,
        capNumber: r.players?.player_contracts?.find((c: any) => c.season === season)?.cap_number ?? null,
        teamEliminated: eliminatedIds.has(r.players?.teams?.id),
        addedAt: r.added_at,
      })),
  }))
}

export async function searchPlayoffPlayersAction(
  query: string,
  season: string,
  poolSeasonId: number,
  roundId?: number,
): Promise<PlayoffPlayerResult[]> {
  if (query.length < 2) return []
  const supabase = await createClient()
  const [{ data: players }, { data: elims }, { data: roundTeams }] = await Promise.all([
    supabase
      .from('players')
      .select('id, first_name, last_name, position, nhl_id, teams (id, code), player_contracts (season, cap_number)')
      .or(`last_name.ilike.%${query}%,first_name.ilike.%${query}%`)
      .eq('is_available', true)
      .order('last_name')
      .limit(30),
    supabase
      .from('playoff_eliminations')
      .select('team_id')
      .eq('pool_season_id', poolSeasonId),
    roundId
      ? supabase.from('playoff_round_teams').select('team_id').eq('round_id', roundId)
      : Promise.resolve({ data: null }),
  ])

  const eliminatedIds = new Set((elims ?? []).map((e: any) => e.team_id))
  const allowedTeamIds = roundTeams && roundTeams.length > 0
    ? new Set(roundTeams.map((t: any) => t.team_id))
    : null

  return (players ?? [])
    .filter((p: any) => {
      const tid = p.teams?.id
      if (allowedTeamIds && !allowedTeamIds.has(tid)) return false
      return true
    })
    .map((p: any) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      position: p.position ?? null,
      teamCode: p.teams?.code ?? null,
      teamId: p.teams?.id ?? null,
      nhlId: p.nhl_id ?? null,
      capNumber: p.player_contracts?.find((c: any) => c.season === season)?.cap_number ?? null,
      teamEliminated: eliminatedIds.has(p.teams?.id),
    }))
}

export async function getPostDeadlineChangesAction(
  poolerId: string,
  roundId: number,
  deadline: string,
): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('series_round_rosters')
    .select('id')
    .eq('pooler_id', poolerId)
    .eq('round_id', roundId)
    .eq('is_active', true)
    .neq('removal_reason', 'elimination')
    .gt('added_at', deadline)
  return (data ?? []).length
}

// ─── Pooler write action ───────────────────────────────────────────────────────

export async function submitPlayoffChangeAction(input: {
  poolerId: string
  roundId: number
  poolSeasonId: number
  season: string
  removeEntryId: number | null
  addPlayerId: number | null
  addPositionSlot: 'F' | 'D' | 'G' | null
  isEliminationReplacement: boolean
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' }

  const { data: poolerSelf } = await supabase
    .from('poolers').select('is_admin').eq('id', user.id).single()
  const isAdmin = poolerSelf?.is_admin ?? false

  if (!isAdmin && user.id !== input.poolerId) return { error: 'Non autorisé' }

  const db = createAdminClient()

  // Fetch round info
  const { data: round } = await db
    .from('playoff_rounds')
    .select('submission_deadline, max_changes, max_f, max_d, max_g, cap_per_round, is_active')
    .eq('id', input.roundId)
    .single()
  if (!round) return { error: 'Ronde introuvable' }
  if (!round.is_active) return { error: 'Cette ronde n\'est plus active' }

  const deadline = round.submission_deadline ? new Date(round.submission_deadline) : null
  const isFrozen = deadline ? new Date() > deadline : false

  // Post-deadline validations (non-admin only)
  if (isFrozen && !isAdmin) {
    if (!input.isEliminationReplacement) {
      // Check discretionary change budget
      const { data: postDeadlineEntries } = await db
        .from('series_round_rosters')
        .select('id')
        .eq('pooler_id', input.poolerId)
        .eq('round_id', input.roundId)
        .gt('added_at', round.submission_deadline!)
        .neq('removal_reason', 'elimination')
      const used = (postDeadlineEntries ?? []).length
      if (used >= round.max_changes) {
        return { error: `Limite de ${round.max_changes} changements discrétionnaires atteinte pour cette ronde.` }
      }
    } else {
      // Verify the removed player's team is actually eliminated
      if (input.removeEntryId) {
        const { data: entry } = await db
          .from('series_round_rosters')
          .select('player_id, players (teams (id))')
          .eq('id', input.removeEntryId)
          .single()
        const teamId = (entry?.players as any)?.teams?.id
        if (teamId) {
          const { data: elim } = await db
            .from('playoff_eliminations')
            .select('id')
            .eq('pool_season_id', input.poolSeasonId)
            .eq('team_id', teamId)
            .maybeSingle()
          if (!elim) return { error: 'Ce joueur n\'est pas sur une équipe éliminée.' }
        }
      }
    }
  }

  if (input.addPlayerId && input.addPositionSlot) {
    // Valider que le joueur est sur une équipe active dans cette ronde
    const { data: roundTeams } = await db.from('playoff_round_teams').select('team_id').eq('round_id', input.roundId)
    if (roundTeams && roundTeams.length > 0) {
      const { data: pTeam } = await db.from('players').select('teams(id)').eq('id', input.addPlayerId).single()
      const tid = (pTeam?.teams as any)?.id
      const allowed = new Set(roundTeams.map((t: any) => t.team_id))
      if (tid && !allowed.has(tid)) {
        return { error: 'Ce joueur n\'est pas sur une équipe active dans cette ronde.' }
      }
    }

    const [{ data: seasonRow }, { data: activeEntries }, { data: playerRow }] = await Promise.all([
      db
        .from('pool_seasons')
        .select('pool_cap')
        .eq('id', input.poolSeasonId)
        .single(),
      db
        .from('series_round_rosters')
        .select(`
          id, player_id, position_slot,
          players (player_contracts (season, cap_number))
        `)
        .eq('round_id', input.roundId)
        .eq('pooler_id', input.poolerId)
        .eq('is_active', true),
      db
        .from('players')
        .select('id, player_contracts (season, cap_number)')
        .eq('id', input.addPlayerId)
        .single(),
    ])

    type ContractRow = { season: string; cap_number: number | null }
    type EntryWithCap = {
      id?: number
      player_id?: number
      position_slot?: 'F' | 'D' | 'G'
      player_contracts?: ContractRow[] | null
      players?: { player_contracts?: ContractRow[] | null } | { player_contracts?: ContractRow[] | null }[] | null
    }

    const capFor = (row: EntryWithCap | null | undefined) => {
      const playerData = Array.isArray(row?.players) ? row?.players[0] : row?.players
      const contracts = playerData?.player_contracts ?? row?.player_contracts ?? []
      const contract = contracts.find(c => c.season === input.season)
      return Number(contract?.cap_number ?? 0)
    }

    const proposed = ((activeEntries ?? []) as EntryWithCap[])
      .filter((entry: EntryWithCap) => entry.id !== input.removeEntryId && entry.player_id !== input.addPlayerId)
      .map((entry: EntryWithCap) => ({
        positionSlot: entry.position_slot as 'F' | 'D' | 'G',
        capNumber: capFor(entry),
      }))

    proposed.push({
      positionSlot: input.addPositionSlot,
      capNumber: capFor(playerRow),
    })

    const counts = proposed.reduce<Record<'F' | 'D' | 'G', number>>(
      (acc, entry) => {
        acc[entry.positionSlot] += 1
        return acc
      },
      { F: 0, D: 0, G: 0 },
    )

    if (counts.F > (round.max_f ?? 3)) return { error: `Maximum de ${round.max_f ?? 3} attaquants atteint pour cette ronde.` }
    if (counts.D > (round.max_d ?? 2)) return { error: `Maximum de ${round.max_d ?? 2} défenseurs atteint pour cette ronde.` }
    if (counts.G > (round.max_g ?? 1)) return { error: `Maximum de ${round.max_g ?? 1} gardiens atteint pour cette ronde.` }

    const effectiveCap = Number(round.cap_per_round ?? seasonRow?.pool_cap ?? 0)
    const capUsed = proposed.reduce((sum, entry) => sum + entry.capNumber, 0)

    if (effectiveCap > 0 && capUsed > effectiveCap) {
      return {
        error: `Cap dépassé : ${(capUsed / 1_000_000).toFixed(2)} M$ / ${(effectiveCap / 1_000_000).toFixed(2)} M$. Ajustez votre sélection avant de soumettre.`,
      }
    }
  }

  try {
    const now = new Date().toISOString()

    // Remove existing entry
    if (input.removeEntryId) {
      await db.from('series_round_rosters').update({
        is_active: false,
        removed_at: now,
        removal_reason: input.isEliminationReplacement ? 'elimination' : 'discretionary',
      }).eq('id', input.removeEntryId)
    }

    // Add new player
    if (input.addPlayerId && input.addPositionSlot) {
      const { data: existing } = await db
        .from('series_round_rosters')
        .select('id')
        .eq('round_id', input.roundId)
        .eq('pooler_id', input.poolerId)
        .eq('player_id', input.addPlayerId)
        .maybeSingle()

      if (existing) {
        await db.from('series_round_rosters').update({
          is_active: true,
          position_slot: input.addPositionSlot,
          added_at: now,
          removed_at: null,
          removal_reason: null,
        }).eq('id', existing.id)
      } else {
        await db.from('series_round_rosters').insert({
          round_id: input.roundId,
          pooler_id: input.poolerId,
          player_id: input.addPlayerId,
          position_slot: input.addPositionSlot,
          is_active: true,
          added_at: now,
        })
      }
    }

    revalidatePath('/gestion-series')
    revalidatePath('/admin/series')
    return {}
  } catch (e: any) {
    return { error: e?.message ?? 'Erreur inconnue' }
  }
}

// ─── Admin write actions ───────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) throw new Error('Accès refusé')
}

export async function createRoundAction(
  poolSeasonId: number,
  roundNumber: number,
  submissionDeadline: string | null,
  maxChanges: number,
  maxF: number,
  maxD: number,
  maxG: number,
  capPerRound: number | null,
  teamIds: number[] = [],
): Promise<{ error?: string }> {
  try {
    await requireAdmin()
    const db = createAdminClient()
    const { data: newRound, error } = await db.from('playoff_rounds').insert({
      pool_season_id: poolSeasonId,
      round_number: roundNumber,
      submission_deadline: submissionDeadline,
      max_changes: maxChanges,
      max_f: maxF,
      max_d: maxD,
      max_g: maxG,
      cap_per_round: capPerRound,
      is_active: false,
    }).select('id').single()
    if (error) return { error: error.message }
    if (teamIds.length > 0 && newRound) {
      await db.from('playoff_round_teams').insert(teamIds.map(tid => ({ round_id: newRound.id, team_id: tid })))
    }
    revalidatePath('/admin/series')
    revalidatePath('/gestion-series')
    return {}
  } catch (e: any) {
    return { error: e?.message ?? 'Erreur inconnue' }
  }
}

export async function updateRoundAction(
  roundId: number,
  submissionDeadline: string | null,
  maxChanges: number,
  maxF: number,
  maxD: number,
  maxG: number,
  capPerRound: number | null,
  teamIds: number[] = [],
): Promise<{ error?: string }> {
  try {
    await requireAdmin()
    const db = createAdminClient()
    const { error } = await db.from('playoff_rounds').update({
      submission_deadline: submissionDeadline,
      max_changes: maxChanges,
      max_f: maxF,
      max_d: maxD,
      max_g: maxG,
      cap_per_round: capPerRound,
    }).eq('id', roundId)
    if (error) return { error: error.message }
    // Remplacer les équipes de la ronde
    await db.from('playoff_round_teams').delete().eq('round_id', roundId)
    if (teamIds.length > 0) {
      await db.from('playoff_round_teams').insert(teamIds.map(tid => ({ round_id: roundId, team_id: tid })))
    }
    revalidatePath('/admin/series')
    revalidatePath('/gestion-series')
    return {}
  } catch (e: any) {
    return { error: e?.message ?? 'Erreur inconnue' }
  }
}

export async function activateRoundAction(
  roundId: number,
  poolSeasonId: number,
): Promise<{ error?: string }> {
  try {
    await requireAdmin()
    const db = createAdminClient()
    // Désactiver toutes les rondes de cette saison
    await db.from('playoff_rounds').update({ is_active: false }).eq('pool_season_id', poolSeasonId)
    const { error } = await db.from('playoff_rounds').update({ is_active: true }).eq('id', roundId)
    if (error) return { error: error.message }
    revalidatePath('/admin/series')
    revalidatePath('/gestion-series')
    return {}
  } catch (e: any) {
    return { error: e?.message ?? 'Erreur inconnue' }
  }
}


export async function markTeamEliminatedAction(
  poolSeasonId: number,
  teamId: number,
  eliminatedInRound: number,
): Promise<{ error?: string }> {
  try {
    await requireAdmin()
    const db = createAdminClient()
    const { error } = await db.from('playoff_eliminations').upsert(
      { pool_season_id: poolSeasonId, team_id: teamId, eliminated_in_round: eliminatedInRound },
      { onConflict: 'pool_season_id,team_id', ignoreDuplicates: false },
    )
    if (error) return { error: error.message }
    revalidatePath('/admin/series')
    revalidatePath('/gestion-series')
    return {}
  } catch (e: any) {
    return { error: e?.message ?? 'Erreur inconnue' }
  }
}

export async function removeEliminationAction(eliminationId: number): Promise<{ error?: string }> {
  try {
    await requireAdmin()
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

// ─── Scoring ──────────────────────────────────────────────────────────────────

export type RoundPlayerScore = {
  playerId: number
  firstName: string
  lastName: string
  teamCode: string | null
  positionSlot: 'F' | 'D' | 'G'
  goals: number
  assists: number
  goalieWins: number
  goalieOtl: number
  goalieShutouts: number
  points: number
}

export type RoundStanding = {
  poolerId: string
  poolerName: string
  totalPoints: number
  players: RoundPlayerScore[]
}

export type RoundSnapshotStatus = {
  hasStart: boolean
  hasEnd: boolean
  startTakenAt: string | null
  endTakenAt: string | null
}

export async function getRoundSnapshotStatusAction(roundId: number): Promise<RoundSnapshotStatus> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('series_round_snapshots')
    .select('snapshot_type, taken_at')
    .eq('round_id', roundId)
  const rows = data ?? []
  const starts = rows.filter((r: any) => r.snapshot_type === 'start')
  const ends = rows.filter((r: any) => r.snapshot_type === 'end')
  return {
    hasStart: starts.length > 0,
    hasEnd: ends.length > 0,
    startTakenAt: starts[0]?.taken_at ?? null,
    endTakenAt: ends[0]?.taken_at ?? null,
  }
}

/**
 * Prend un snapshot pour tous les joueurs actifs de la ronde.
 * useZeros=true : insère des zéros (début de ronde 1, avant tout match playoff).
 * useZeros=false : fetch les stats playoff cumulatives depuis l'API NHL.
 */
export async function takeRoundSnapshotAction(
  roundId: number,
  snapshotType: 'start' | 'end',
  useZeros = false,
): Promise<{ error?: string; count?: number }> {
  try {
    await requireAdmin()
    const db = createAdminClient()

    const { data: entries } = await db
      .from('series_round_rosters')
      .select('pooler_id, player_id, players(nhl_id)')
      .eq('round_id', roundId)
      .eq('is_active', true)

    if (!entries || entries.length === 0) return { error: 'Aucun alignement dans cette ronde.' }

    const { fetchPlayerStatsById, EMPTY_STATS } = await import('@/lib/nhl-snapshot')
    const now = new Date().toISOString()

    const toUpsert = await Promise.all(entries.map(async (e: any) => {
      const nhlId = e.players?.nhl_id ?? null
      const stats = useZeros || !nhlId
        ? EMPTY_STATS
        : (await fetchPlayerStatsById(nhlId, 3)) ?? EMPTY_STATS
      return {
        round_id: roundId,
        pooler_id: e.pooler_id,
        player_id: e.player_id,
        snapshot_type: snapshotType,
        taken_at: now,
        ...stats,
      }
    }))

    const { error } = await db
      .from('series_round_snapshots')
      .upsert(toUpsert, { onConflict: 'round_id,pooler_id,player_id,snapshot_type' })
    if (error) return { error: error.message }

    revalidatePath('/admin/series')
    revalidatePath('/classement-series')
    return { count: toUpsert.length }
  } catch (e: any) {
    return { error: e?.message ?? 'Erreur inconnue' }
  }
}

export async function getRoundStandingsAction(
  roundId: number,
): Promise<RoundStanding[]> {
  const supabase = await createClient()

  const [{ data: snapshots }, { data: scoringRows }, { data: rosters }] = await Promise.all([
    supabase
      .from('series_round_snapshots')
      .select('pooler_id, player_id, snapshot_type, goals, assists, goalie_wins, goalie_otl, goalie_shutouts')
      .eq('round_id', roundId),
    supabase
      .from('scoring_config')
      .select('stat_key, points, points_playoffs, scope'),
    supabase
      .from('series_round_rosters')
      .select('pooler_id, player_id, position_slot, players(first_name, last_name, teams(code)), poolers(id, name)')
      .eq('round_id', roundId)
      .eq('is_active', true),
  ])

  if (!snapshots || snapshots.length === 0) return []

  // Scoring config — utilise points_playoffs si défini
  const cfg: Record<string, number> = {}
  for (const row of scoringRows ?? []) {
    cfg[row.stat_key] = row.points_playoffs != null ? row.points_playoffs : row.points
  }

  // Index snapshots par pooler+player+type
  type SnapKey = string
  const snap = new Map<SnapKey, any>()
  for (const s of snapshots) {
    snap.set(`${s.pooler_id}:${s.player_id}:${s.snapshot_type}`, s)
  }

  // Index rosters
  const poolerNames = new Map<string, string>()
  const playerMeta = new Map<number, { firstName: string; lastName: string; teamCode: string | null; positionSlot: 'F' | 'D' | 'G' }>()
  const rosterByPooler = new Map<string, number[]>()

  for (const r of rosters ?? []) {
    const poolerId = r.pooler_id
    const name = (r.poolers as any)?.name ?? poolerId
    poolerNames.set(poolerId, name)
    if (!rosterByPooler.has(poolerId)) rosterByPooler.set(poolerId, [])
    rosterByPooler.get(poolerId)!.push(r.player_id)
    playerMeta.set(r.player_id, {
      firstName: (r.players as any)?.first_name ?? '',
      lastName: (r.players as any)?.last_name ?? '',
      teamCode: (r.players as any)?.teams?.code ?? null,
      positionSlot: r.position_slot as 'F' | 'D' | 'G',
    })
  }

  const standings: RoundStanding[] = []

  for (const [poolerId, playerIds] of rosterByPooler.entries()) {
    const players: RoundPlayerScore[] = []
    let totalPoints = 0

    for (const playerId of playerIds) {
      const start = snap.get(`${poolerId}:${playerId}:start`)
      const end = snap.get(`${poolerId}:${playerId}:end`)
      if (!end) continue

      const delta = {
        goals:          (end.goals ?? 0)          - (start?.goals ?? 0),
        assists:        (end.assists ?? 0)         - (start?.assists ?? 0),
        goalie_wins:    (end.goalie_wins ?? 0)     - (start?.goalie_wins ?? 0),
        goalie_otl:     (end.goalie_otl ?? 0)      - (start?.goalie_otl ?? 0),
        goalie_shutouts:(end.goalie_shutouts ?? 0) - (start?.goalie_shutouts ?? 0),
      }

      const pts =
        delta.goals           * (cfg['goal']         ?? 1) +
        delta.assists         * (cfg['assist']        ?? 1) +
        delta.goalie_wins     * (cfg['goalie_win']    ?? 2) +
        delta.goalie_otl      * (cfg['goalie_otl']    ?? 1) +
        delta.goalie_shutouts * (cfg['goalie_shutout']?? 0)

      const meta = playerMeta.get(playerId)
      players.push({
        playerId,
        firstName:      meta?.firstName ?? '',
        lastName:       meta?.lastName ?? '',
        teamCode:       meta?.teamCode ?? null,
        positionSlot:   meta?.positionSlot ?? 'F',
        goals:          delta.goals,
        assists:        delta.assists,
        goalieWins:     delta.goalie_wins,
        goalieOtl:      delta.goalie_otl,
        goalieShutouts: delta.goalie_shutouts,
        points:         pts,
      })
      totalPoints += pts
    }

    standings.push({
      poolerId,
      poolerName: poolerNames.get(poolerId) ?? poolerId,
      totalPoints,
      players: players.sort((a, b) => b.points - a.points),
    })
  }

  return standings.sort((a, b) => b.totalPoints - a.totalPoints)
}
