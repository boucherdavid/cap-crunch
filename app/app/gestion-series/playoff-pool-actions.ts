'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// "2026-PO" → "2025-26"  (format utilisé dans player_contracts.season)
function toNhlSeason(poolSeason: string): string {
  const year = parseInt(poolSeason)
  return `${year - 1}-${String(year).slice(-2)}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlayoffPoolSaison = {
  id: number
  season: string
  poolCap: number
  submissionDeadline: string | null
  maxChanges: number
  maxElimChanges: number
  maxF: number
  maxD: number
  maxG: number
  gestionOuverte: boolean
}

export type PlayoffPoolEntry = {
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

export type PlayoffPoolPlayerResult = {
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

export type PlayoffChangeCounts = {
  voluntary: number
  elimination: number
}

export type PeriodInfo = {
  goals: number
  assists: number
  goalie_wins: number
  goalie_otl: number
  goalie_shutouts: number
  points: number
  activatedAt: string
  deactivatedAt: string | null  // null = période ouverte (joueur encore actif)
}

export type PlayoffPoolStanding = {
  poolerId: string
  poolerName: string
  totalPoints: number
  players: {
    playerId: number
    nhlId: number | null
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
    isActive: boolean
    periods: PeriodInfo[]
  }[]
}

// ─── Read actions ─────────────────────────────────────────────────────────────

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

export async function getPlayoffPoolRosterAction(
  poolerId: string,
  poolSeasonId: number,
  season: string,
): Promise<PlayoffPoolEntry[]> {
  const supabase = await createClient()
  const db = createAdminClient()
  const [{ data: entries }, { data: elims }, { data: participating }] = await Promise.all([
    supabase
      .from('playoff_pool_rosters')
      .select('id, player_id, position_slot, added_at, players(first_name, last_name, position, nhl_id, teams(id, code), player_contracts(season, cap_number))')
      .eq('pooler_id', poolerId)
      .eq('pool_season_id', poolSeasonId)
      .eq('is_active', true),
    db.from('playoff_eliminations').select('team_id').eq('pool_season_id', poolSeasonId),
    db.from('playoff_participating_teams').select('team_id').eq('pool_season_id', poolSeasonId),
  ])
  const eliminatedIds = new Set((elims ?? []).map((e: any) => e.team_id))
  const participatingIds = new Set((participating ?? []).map((e: any) => e.team_id))
  // Une équipe est "éliminée" si explicitement dans playoff_eliminations,
  // ou si des équipes participantes sont configurées et que la sienne n'en fait plus partie.
  const isEliminated = (teamId: number | undefined) =>
    !!teamId && (eliminatedIds.has(teamId) || (participatingIds.size > 0 && !participatingIds.has(teamId)))
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
    capNumber: r.players?.player_contracts?.find((c: any) => c.season === toNhlSeason(season))?.cap_number ?? null,
    teamEliminated: isEliminated(r.players?.teams?.id),
    addedAt: r.added_at,
  }))
}

export async function getPlayoffChangeCountsAction(
  poolerId: string,
  poolSeasonId: number,
): Promise<PlayoffChangeCounts> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('playoff_pool_rosters')
    .select('removal_reason')
    .eq('pooler_id', poolerId)
    .eq('pool_season_id', poolSeasonId)
    .not('removed_at', 'is', null)
  const rows = data ?? []
  return {
    voluntary: rows.filter((r: any) => r.removal_reason === 'voluntary').length,
    elimination: rows.filter((r: any) => r.removal_reason === 'elimination').length,
  }
}

export async function getRecentlyRemovedAction(
  poolSeasonId: number,
  poolerId: string,
): Promise<{ playerId: number; cooldownUntil: string }[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const db = createAdminClient()
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await db
    .from('playoff_pool_rosters')
    .select('player_id, removed_at')
    .eq('pool_season_id', poolSeasonId)
    .eq('pooler_id', poolerId)
    .not('removed_at', 'is', null)
    .eq('removal_reason', 'voluntary')
    .gt('removed_at', threeDaysAgo)
    .order('removed_at', { ascending: false })

  const seen = new Set<number>()
  return (data ?? [])
    .filter((r: any) => {
      if (seen.has(r.player_id)) return false
      seen.add(r.player_id)
      return true
    })
    .map((r: any) => ({
      playerId: r.player_id,
      cooldownUntil: new Date(new Date(r.removed_at).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    }))
}

export async function getAvailablePlayoffPlayersAction(
  poolSeasonId: number,
  season: string,
): Promise<PlayoffPoolPlayerResult[]> {
  const supabase = await createClient()
  const db = createAdminClient()
  const nhlSeason = toNhlSeason(season)

  // playoff_participating_teams a RLS sans politique — utiliser le client admin
  const [{ data: participating }, { data: elims }] = await Promise.all([
    db.from('playoff_participating_teams').select('team_id').eq('pool_season_id', poolSeasonId),
    db.from('playoff_eliminations').select('team_id').eq('pool_season_id', poolSeasonId),
  ])

  const teamIds = (participating ?? []).map((r: any) => r.team_id)
  const eliminatedIds = new Set((elims ?? []).map((e: any) => e.team_id))

  // Charger les joueurs : si équipes participantes configurées, filtrer par équipe
  // (is_available inutile ici — le filtre team_id est suffisant)
  // sinon retourner tous les joueurs disponibles (is_available comme garde-fou)
  let query = supabase
    .from('players')
    .select('id, first_name, last_name, position, nhl_id, teams(id, code), player_contracts(season, cap_number)')
  if (teamIds.length > 0) {
    query = query.in('team_id', teamIds)
  } else {
    query = query.eq('is_available', true)
  }

  const { data: players } = await query

  return (players ?? [])
    .map((p: any) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      position: p.position ?? null,
      teamCode: p.teams?.code ?? null,
      teamId: p.teams?.id ?? null,
      nhlId: p.nhl_id ?? null,
      capNumber: (p.player_contracts as any[])?.find((c: any) => c.season === nhlSeason)?.cap_number ?? null,
      teamEliminated: eliminatedIds.has(p.teams?.id),
    }))
    .filter(p => p.nhlId !== null)
    .sort((a, b) => {
      const teamCmp = (a.teamCode ?? 'zzz').localeCompare(b.teamCode ?? 'zzz')
      if (teamCmp !== 0) return teamCmp
      const capA = a.capNumber ?? -1
      const capB = b.capNumber ?? -1
      if (capB !== capA) return capB - capA
      return a.lastName.localeCompare(b.lastName)
    })
}

export async function searchPlayoffPoolPlayersAction(
  query: string,
  poolSeasonId: number,
  season: string,
): Promise<PlayoffPoolPlayerResult[]> {
  if (query.length < 2) return []
  const supabase = await createClient()
  const [{ data: players }, { data: elims }] = await Promise.all([
    supabase
      .from('players')
      .select('id, first_name, last_name, position, nhl_id, teams(id, code), player_contracts(season, cap_number)')
      .or(`last_name.ilike.%${query}%,first_name.ilike.%${query}%`)
      .eq('is_available', true)
      .limit(30),
    supabase
      .from('playoff_eliminations')
      .select('team_id')
      .eq('pool_season_id', poolSeasonId),
  ])
  const eliminatedIds = new Set((elims ?? []).map((e: any) => e.team_id))
  return (players ?? []).map((p: any) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    position: p.position ?? null,
    teamCode: p.teams?.code ?? null,
    teamId: p.teams?.id ?? null,
    nhlId: p.nhl_id ?? null,
    capNumber: p.player_contracts?.find((c: any) => c.season === toNhlSeason(season))?.cap_number ?? null,
    teamEliminated: eliminatedIds.has(p.teams?.id),
  }))
  .sort((a, b) => {
    const teamCmp = (a.teamCode ?? 'zzz').localeCompare(b.teamCode ?? 'zzz')
    if (teamCmp !== 0) return teamCmp
    const capA = a.capNumber ?? -1
    const capB = b.capNumber ?? -1
    if (capB !== capA) return capB - capA
    return a.lastName.localeCompare(b.lastName)
  })
}

export async function getAllPlayoffPoolRostersAction(
  poolSeasonId: number,
  season: string,
): Promise<{ poolerId: string; poolerName: string; entries: PlayoffPoolEntry[] }[]> {
  const supabase = await createClient()
  const [{ data: entries }, { data: elims }, { data: poolers }] = await Promise.all([
    supabase
      .from('playoff_pool_rosters')
      .select('pooler_id, player_id, position_slot, added_at, players(first_name, last_name, position, nhl_id, teams(id, code), player_contracts(season, cap_number))')
      .eq('pool_season_id', poolSeasonId)
      .eq('is_active', true),
    supabase.from('playoff_eliminations').select('team_id').eq('pool_season_id', poolSeasonId),
    supabase.from('poolers').select('id, name').order('name'),
  ])
  const eliminatedIds = new Set((elims ?? []).map((e: any) => e.team_id))
  const grouped = new Map<string, PlayoffPoolEntry[]>()
  for (const r of entries ?? []) {
    if (!grouped.has(r.pooler_id)) grouped.set(r.pooler_id, [])
    grouped.get(r.pooler_id)!.push({
      id: 0,
      playerId: r.player_id,
      positionSlot: r.position_slot as 'F' | 'D' | 'G',
      firstName: (r.players as any)?.first_name ?? '',
      lastName: (r.players as any)?.last_name ?? '',
      position: (r.players as any)?.position ?? null,
      teamCode: (r.players as any)?.teams?.code ?? null,
      teamId: (r.players as any)?.teams?.id ?? null,
      nhlId: (r.players as any)?.nhl_id ?? null,
      capNumber: (r.players as any)?.player_contracts?.find((c: any) => c.season === toNhlSeason(season))?.cap_number ?? null,
      teamEliminated: eliminatedIds.has((r.players as any)?.teams?.id),
      addedAt: r.added_at,
    })
  }
  return (poolers ?? []).map(p => ({
    poolerId: p.id,
    poolerName: p.name,
    entries: grouped.get(p.id) ?? [],
  }))
}

// ─── Change action ────────────────────────────────────────────────────────────

export async function submitPlayoffPoolChangeAction(input: {
  poolerId: string
  poolSeasonId: number
  season: string
  removeEntryId: number | null
  removePlayerId: number | null
  removeNhlId: number | null
  addPlayerId: number | null
  addNhlId: number | null
  addPositionSlot: 'F' | 'D' | 'G' | null
  isEliminationReplacement: boolean
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' }
  const { data: poolerSelf } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  const isAdmin = poolerSelf?.is_admin ?? false
  if (!isAdmin && user.id !== input.poolerId) return { error: 'Non autorisé' }

  const db = createAdminClient()

  // Fetch season config
  const { data: saisonRow } = await db
    .from('pool_seasons')
    .select('playoff_submission_deadline, playoff_max_changes, playoff_max_elim_changes')
    .eq('id', input.poolSeasonId)
    .single()
  if (!saisonRow) return { error: 'Saison introuvable' }

  const deadline = saisonRow.playoff_submission_deadline ? new Date(saisonRow.playoff_submission_deadline) : null
  const isLocked = deadline ? new Date() > deadline : false

  // Validate change budget after deadline (non-admin)
  if (isLocked && !isAdmin) {
    const { data: history } = await db
      .from('playoff_pool_rosters')
      .select('removal_reason')
      .eq('pooler_id', input.poolerId)
      .eq('pool_season_id', input.poolSeasonId)
      .not('removed_at', 'is', null)
    const used = history ?? []
    const voluntaryUsed = used.filter((r: any) => r.removal_reason === 'voluntary').length
    const elimUsed = used.filter((r: any) => r.removal_reason === 'elimination').length

    if (input.isEliminationReplacement) {
      if (elimUsed >= (saisonRow.playoff_max_elim_changes ?? 5)) {
        return { error: `Limite de ${saisonRow.playoff_max_elim_changes} changements d'élimination atteinte.` }
      }
      // Verify the removed player is actually on an eliminated team (same dual logic as client)
      if (input.removePlayerId) {
        const { data: pTeam } = await db.from('players').select('teams(id)').eq('id', input.removePlayerId).single()
        const tid = (pTeam?.teams as any)?.id
        if (tid) {
          const [{ data: elimRow }, { data: participating }] = await Promise.all([
            db.from('playoff_eliminations').select('id').eq('pool_season_id', input.poolSeasonId).eq('team_id', tid).maybeSingle(),
            db.from('playoff_participating_teams').select('team_id').eq('pool_season_id', input.poolSeasonId),
          ])
          const participatingIds = new Set((participating ?? []).map((e: any) => e.team_id))
          const isEliminated = !!elimRow || (participatingIds.size > 0 && !participatingIds.has(tid))
          if (!isEliminated) return { error: "Ce joueur n'est pas sur une équipe éliminée." }
        }
      }
    }
  }

  // Délai de réactivation : 3 jours après un retrait volontaire.
  // Exception : admin qui corrige le roster d'un AUTRE pooler (corrections administratives).
  const adminBypassCooldown = isAdmin && user.id !== input.poolerId
  if (isLocked && input.addPlayerId && !adminBypassCooldown) {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const { data: lastRow } = await db
      .from('playoff_pool_rosters')
      .select('removed_at')
      .eq('pooler_id', input.poolerId)
      .eq('pool_season_id', input.poolSeasonId)
      .eq('player_id', input.addPlayerId)
      .not('removed_at', 'is', null)
      .order('removed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastRow?.removed_at && lastRow.removed_at > threeDaysAgo) {
      const earliest = new Date(new Date(lastRow.removed_at).getTime() + 3 * 24 * 60 * 60 * 1000)
      const formatted = earliest.toLocaleDateString('fr-CA', { weekday: 'long', month: 'long', day: 'numeric' })
      const { data: pRow } = await db.from('players').select('first_name, last_name').eq('id', input.addPlayerId).single()
      const name = pRow ? `${(pRow as any).first_name} ${(pRow as any).last_name}` : 'Ce joueur'
      return { error: `${name} ne peut pas être remis dans l'alignement avant le ${formatted}.` }
    }
  }

  const now = new Date().toISOString()

  // Remove player
  if (input.removeEntryId) {
    // Avant la deadline, les changements sont libres et ne comptent pas dans le budget —
    // removal_reason reste null pour qu'ils soient ignorés par getPlayoffChangeCountsAction.
    const reason = !isLocked ? null : input.isEliminationReplacement ? 'elimination' : 'voluntary'
    const { error } = await db
      .from('playoff_pool_rosters')
      .update({ is_active: false, removed_at: now, removal_reason: reason })
      .eq('id', input.removeEntryId)
    if (error) return { error: error.message }
  }

  // Add player — toujours INSERT un nouveau row pour préserver l'historique des périodes
  if (input.addPlayerId && input.addPositionSlot) {
    const { error } = await db.from('playoff_pool_rosters').insert({
      pooler_id: input.poolerId,
      player_id: input.addPlayerId,
      pool_season_id: input.poolSeasonId,
      position_slot: input.addPositionSlot,
      is_active: true,
      added_at: now,
    })
    if (error) return { error: error.message }
  }

  // Notifier l'admin seulement après la deadline (changements avec budget)
  // Avant la deadline : la confirmation d'alignement envoie la notification
  if (!isAdmin && isLocked) {
    const { data: poolerRow } = await db.from('poolers').select('name').eq('id', input.poolerId).single()
    const { sendPushToAdmins } = await import('@/lib/push')
    // after() : voir le commentaire dans lib/threadNotify.ts.
    after(() => sendPushToAdmins({
      title: 'Pool des séries — Changement d\'alignement',
      body: `${poolerRow?.name ?? 'Un pooler'} a modifié ses choix.`,
      url: '/admin/series',
    }, user.id).catch(() => {}))
  }

  revalidatePath('/gestion-series')
  revalidatePath('/admin/series')
  revalidatePath('/classement-series')
  return {}
}

// ─── Batch change action (retraits + ajouts découplés) ───────────────────────

export type SeriesBatchRemoval = {
  entryId: number
  playerId: number
  nhlId: number | null
  removalType: 'elimination' | 'voluntary' | 'free' // 'free' = avant deadline
}

export type SeriesBatchAddition = {
  playerId: number
  nhlId: number | null
  positionSlot: 'F' | 'D' | 'G'
}

export async function submitSeriesBatchAction(input: {
  poolerId: string
  poolSeasonId: number
  season: string
  removals: SeriesBatchRemoval[]
  additions: SeriesBatchAddition[]
}): Promise<{ error?: string }> {
  if (!input.removals.length && !input.additions.length) return {}

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' }
  const { data: poolerSelf } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  const isAdmin = poolerSelf?.is_admin ?? false
  if (!isAdmin && user.id !== input.poolerId) return { error: 'Non autorisé' }

  const db = createAdminClient()

  const { data: saisonRow } = await db
    .from('pool_seasons')
    .select('playoff_submission_deadline, playoff_max_changes, playoff_max_elim_changes, pool_cap')
    .eq('id', input.poolSeasonId)
    .single()
  if (!saisonRow) return { error: 'Saison introuvable' }

  const deadline = saisonRow.playoff_submission_deadline ? new Date(saisonRow.playoff_submission_deadline) : null
  const isLocked = deadline ? new Date() > deadline : false
  const poolCap: number = Number(saisonRow.pool_cap ?? 0)

  const elimRemovals = input.removals.filter(r => r.removalType === 'elimination')
  const voluntaryRemovals = input.removals.filter(r => r.removalType === 'voluntary')

  // Vérifier que les retraits 'élimination' sont bien sur des équipes éliminées
  if (isLocked && !isAdmin && elimRemovals.length > 0) {
    const [{ data: eliminations }, { data: participating }] = await Promise.all([
      db.from('playoff_eliminations').select('team_id').eq('pool_season_id', input.poolSeasonId),
      db.from('playoff_participating_teams').select('team_id').eq('pool_season_id', input.poolSeasonId),
    ])
    const elimTeamIds = new Set((eliminations ?? []).map((e: any) => e.team_id))
    const participatingIds = new Set((participating ?? []).map((e: any) => e.team_id))
    const isEliminated = (tid: number) =>
      elimTeamIds.has(tid) || (participatingIds.size > 0 && !participatingIds.has(tid))

    for (const r of elimRemovals) {
      const { data: pTeam } = await db.from('players').select('teams(id)').eq('id', r.playerId).single()
      const tid = (pTeam?.teams as any)?.id
      if (tid && !isEliminated(tid)) {
        return { error: "Un joueur marqué 'élimination' n'est pas sur une équipe éliminée." }
      }
    }
  }

  // Validation cap globale sur l'ensemble retraits + ajouts
  if (poolCap > 0) {
    const { data: currentRoster } = await db
      .from('playoff_pool_rosters')
      .select('player_id, players(player_contracts(season, cap_number))')
      .eq('pooler_id', input.poolerId)
      .eq('pool_season_id', input.poolSeasonId)
      .eq('is_active', true)

    const removePlayerIds = new Set(input.removals.map(r => r.playerId))
    let projectedCap = 0
    for (const r of (currentRoster ?? []) as any[]) {
      if (removePlayerIds.has(r.player_id)) continue
      const c = (r.players?.player_contracts ?? []).find((c: any) => c.season === toNhlSeason(input.season))
      projectedCap += c?.cap_number ?? 0
    }
    for (const a of input.additions) {
      const { data: p } = await db.from('players').select('player_contracts(season, cap_number)').eq('id', a.playerId).single()
      const c = ((p as any)?.player_contracts ?? []).find((c: any) => c.season === toNhlSeason(input.season))
      projectedCap += c?.cap_number ?? 0
    }
    if (projectedCap > poolCap) {
      const fmt = (n: number) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
      return { error: `Ce panier dépasse la masse salariale (${fmt(projectedCap)} / ${fmt(poolCap)}).` }
    }
  }

  // Délai de réactivation : 3 jours après un retrait volontaire (non-admin seulement)
  if (!isAdmin && isLocked && input.additions.length > 0) {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    for (const a of input.additions) {
      const { data: lastRow } = await db
        .from('playoff_pool_rosters')
        .select('removed_at')
        .eq('pooler_id', input.poolerId)
        .eq('pool_season_id', input.poolSeasonId)
        .eq('player_id', a.playerId)
        .not('removed_at', 'is', null)
        .order('removed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastRow?.removed_at && lastRow.removed_at > threeDaysAgo) {
        const earliest = new Date(new Date(lastRow.removed_at).getTime() + 3 * 24 * 60 * 60 * 1000)
        const formatted = earliest.toLocaleDateString('fr-CA', { weekday: 'long', month: 'long', day: 'numeric' })
        const { data: pRow } = await db.from('players').select('first_name, last_name').eq('id', a.playerId).single()
        const name = pRow ? `${(pRow as any).first_name} ${(pRow as any).last_name}` : 'Ce joueur'
        return { error: `${name} ne peut pas être remis dans l'alignement avant le ${formatted}.` }
      }
    }
  }

  const now = new Date().toISOString()

  // Appliquer les retraits
  for (const r of input.removals) {
    // Enforcement côté serveur : si la deadline est passée, le reason ne peut pas être null
    // (protège contre un client qui enverrait 'free' si saison.submissionDeadline n'était pas chargée)
    const reason = !isLocked ? null : r.removalType === 'elimination' ? 'elimination' : 'voluntary'
    const { error } = await db
      .from('playoff_pool_rosters')
      .update({ is_active: false, removed_at: now, removal_reason: reason })
      .eq('id', r.entryId)
    if (error) return { error: error.message }
  }

  // Appliquer les ajouts — toujours INSERT pour préserver l'historique multi-période
  for (const a of input.additions) {
    const { error } = await db.from('playoff_pool_rosters').insert({
      pooler_id: input.poolerId, player_id: a.playerId,
      pool_season_id: input.poolSeasonId, position_slot: a.positionSlot,
      is_active: true, added_at: now,
    })
    if (error) return { error: error.message }
  }

  if (!isAdmin && isLocked) {
    const { data: poolerRow } = await db.from('poolers').select('name').eq('id', input.poolerId).single()
    const { sendPushToAdmins } = await import('@/lib/push')
    const n = input.removals.length + input.additions.length
    // after() : voir le commentaire dans lib/threadNotify.ts.
    after(() => sendPushToAdmins({
      title: 'Pool des séries — Changement d\'alignement',
      body: n <= 2
        ? `${poolerRow?.name ?? 'Un pooler'} a modifié son alignement.`
        : `${poolerRow?.name ?? 'Un pooler'} a soumis ${Math.max(input.removals.length, input.additions.length)} changements.`,
      url: '/admin/series',
    }, user.id).catch(() => {}))
  }

  revalidatePath('/gestion-series')
  revalidatePath('/admin/series')
  revalidatePath('/classement-series')
  return {}
}



// ─── Confirm alignment ────────────────────────────────────────────────────────

export async function confirmPlayoffAlignmentAction(
  poolerId: string,
  poolerName: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== poolerId) return { error: 'Non autorisé' }
  const { sendPushToAdmins } = await import('@/lib/push')
  // after() : voir le commentaire dans lib/threadNotify.ts.
  after(() => sendPushToAdmins({
    title: 'Pool des séries — Alignement confirmé',
    body: `${poolerName} a confirmé son alignement.`,
    url: '/admin/series',
  }, user.id).catch(() => {}))
  return {}
}

// ─── Change log (admin) ───────────────────────────────────────────────────────

export type PlayoffChangeLogEntry = {
  poolerName: string
  action: 'ajout' | 'retrait'
  playerName: string
  teamCode: string | null
  positionSlot: 'F' | 'D' | 'G' | null
  removalReason: 'elimination' | 'voluntary' | null
  changedAt: string
}

export async function getPlayoffChangeLogAction(
  poolSeasonId: number,
  limit = 50,
): Promise<PlayoffChangeLogEntry[]> {
  const db = createAdminClient()

  const { data } = await db
    .from('playoff_pool_rosters')
    .select('pooler_id, player_id, position_slot, is_active, added_at, removed_at, removal_reason, poolers(name), players(first_name, last_name, teams(code))')
    .eq('pool_season_id', poolSeasonId)
    .not('removal_reason', 'is', null)  // seulement les changements post-deadline
    .order('removed_at', { ascending: false })
    .limit(limit)

  const log: PlayoffChangeLogEntry[] = []
  for (const r of (data ?? []) as any[]) {
    const playerName = `${r.players?.last_name ?? ''}, ${r.players?.first_name ?? ''}`
    const poolerName: string = r.poolers?.name ?? r.pooler_id
    const teamCode: string | null = r.players?.teams?.code ?? null

    // Retrait (joueur sorti)
    log.push({
      poolerName,
      action: 'retrait',
      playerName,
      teamCode,
      positionSlot: r.position_slot as 'F' | 'D' | 'G',
      removalReason: r.removal_reason,
      changedAt: r.removed_at,
    })
  }

  // Ajouts post-deadline : entrées dont added_at > deadline (pas de deadline_baseline)
  const { data: saisonRow } = await db
    .from('pool_seasons')
    .select('playoff_submission_deadline')
    .eq('id', poolSeasonId)
    .single()
  const deadline = saisonRow?.playoff_submission_deadline

  if (deadline) {
    const { data: additions } = await db
      .from('playoff_pool_rosters')
      .select('pooler_id, player_id, position_slot, added_at, poolers(name), players(first_name, last_name, teams(code))')
      .eq('pool_season_id', poolSeasonId)
      .gt('added_at', deadline)
      .order('added_at', { ascending: false })
      .limit(limit)

    for (const r of (additions ?? []) as any[]) {
      const playerName = `${r.players?.last_name ?? ''}, ${r.players?.first_name ?? ''}`
      log.push({
        poolerName: r.poolers?.name ?? r.pooler_id,
        action: 'ajout',
        playerName,
        teamCode: r.players?.teams?.code ?? null,
        positionSlot: r.position_slot as 'F' | 'D' | 'G',
        removalReason: null,
        changedAt: r.added_at,
      })
    }
  }

  return log.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()).slice(0, limit)
}


// ─── Standings ────────────────────────────────────────────────────────────────

export async function getPlayoffPoolStandingsAction(
  poolSeasonId: number,
  fetchLive = false,
): Promise<PlayoffPoolStanding[]> {
  const supabase = await createClient()

  const [{ data: rosters }, { data: scoringRows }, { data: poolers }, { data: saisonRow }] = await Promise.all([
    supabase
      .from('playoff_pool_rosters')
      .select('pooler_id, player_id, position_slot, is_active, removal_reason, added_at, removed_at, players(first_name, last_name, nhl_id, teams(code))')
      .eq('pool_season_id', poolSeasonId),
    supabase.from('scoring_config').select('stat_key, points, points_playoffs'),
    supabase.from('poolers').select('id, name').order('name'),
    supabase.from('pool_seasons').select('playoff_max_f, playoff_max_d, playoff_max_g, season').eq('id', poolSeasonId).single(),
  ])

  const maxF = saisonRow?.playoff_max_f ?? 5
  const maxD = saisonRow?.playoff_max_d ?? 3
  const maxG = saisonRow?.playoff_max_g ?? 1

  // Identifiant saison NHL : '2026-PO' → parseInt = 2026 → 20252026
  const rawYear = parseInt(saisonRow?.season ?? '2026')
  const nhlSeasonId = (rawYear - 1) * 10000 + rawYear

  const cfg: Record<string, number> = {}
  for (const row of scoringRows ?? []) {
    cfg[row.stat_key] = row.points_playoffs != null ? row.points_playoffs : row.points
  }

  function calcPts(g: number, a: number, w: number, l: number, s: number): number {
    return g * (cfg['goal'] ?? 1) + a * (cfg['assist'] ?? 1) + w * (cfg['goalie_win'] ?? 2) + l * (cfg['goalie_otl'] ?? 1) + s * (cfg['goalie_shutout'] ?? 0)
  }

  // Tous les player_id présents dans le pool
  const playerIds = [...new Set((rosters ?? []).map((r: any) => r.player_id as number))]

  // Game-logs pour ces joueurs (séries, saison courante)
  type GameLog = {
    player_id: number
    game_start_time: string
    goals: number
    assists: number
    goalie_wins: number
    goalie_otl: number
    goalie_shutouts: number
  }
  let gameLogs: GameLog[] = []
  if (playerIds.length > 0) {
    const { data } = await supabase
      .from('player_game_logs')
      .select('player_id, game_start_time, goals, assists, goalie_wins, goalie_otl, goalie_shutouts')
      .in('player_id', playerIds)
      .eq('season', nhlSeasonId)
      .eq('game_type', 3)
    gameLogs = (data ?? []) as GameLog[]
  }

  // Index par player_id
  const logsByPlayer = new Map<number, GameLog[]>()
  for (const gl of gameLogs) {
    if (!logsByPlayer.has(gl.player_id)) logsByPlayer.set(gl.player_id, [])
    logsByPlayer.get(gl.player_id)!.push(gl)
  }

  // Game-logs dans une fenêtre d'activation :
  //   activé AVANT la mise en jeu  ET  pas encore désactivé quand le match a commencé
  function logsForPeriod(playerId: number, addedAt: string, removedAt: string | null): GameLog[] {
    const logs = logsByPlayer.get(playerId) ?? []
    const start = new Date(addedAt)
    const end   = removedAt ? new Date(removedAt) : null
    return logs.filter(gl => {
      const t = new Date(gl.game_start_time)
      return start < t && (end === null || end >= t)
    })
  }

  // Grouper les rosters par pooler
  const rosterMap = new Map<string, any[]>()
  for (const r of rosters ?? []) {
    if (!rosterMap.has(r.pooler_id)) rosterMap.set(r.pooler_id, [])
    rosterMap.get(r.pooler_id)!.push(r)
  }

  const poolerNames = new Map((poolers ?? []).map(p => [p.id, p.name]))
  const standings: PlayoffPoolStanding[] = []

  for (const [poolerId, rosterEntries] of rosterMap.entries()) {
    // Vérifier l'alignement minimum par position
    const uniqueActive = new Map<number, any>()
    for (const r of rosterEntries) { if (r.is_active) uniqueActive.set(r.player_id, r) }
    const countF = [...uniqueActive.values()].filter(r => r.position_slot === 'F').length
    const countD = [...uniqueActive.values()].filter(r => r.position_slot === 'D').length
    const countG = [...uniqueActive.values()].filter(r => r.position_slot === 'G').length
    if (countF < maxF || countD < maxD || countG < maxG) continue

    // Grouper les périodes d'activation par joueur
    const entriesByPlayer = new Map<number, any[]>()
    for (const r of rosterEntries) {
      if (!entriesByPlayer.has(r.player_id)) entriesByPlayer.set(r.player_id, [])
      entriesByPlayer.get(r.player_id)!.push(r)
    }

    const players: PlayoffPoolStanding['players'] = []
    let total = 0

    for (const [playerId, playerEntries] of entriesByPlayer.entries()) {
      const activeEntry = playerEntries.find((e: any) => e.is_active)
      const isActive = !!activeEntry
      const hasContribution = playerEntries.some((e: any) => e.removal_reason)
      if (!isActive && !hasContribution) continue

      // Cumuler les stats sur toutes les périodes (triées chronologiquement)
      let totalGoals = 0, totalAssists = 0, totalWins = 0, totalOtl = 0, totalSo = 0
      const periods: PeriodInfo[] = []
      const sortedEntries = [...playerEntries].sort(
        (a: any, b: any) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime(),
      )

      for (const period of sortedEntries) {
        const pLogs = logsForPeriod(playerId, period.added_at, period.removed_at ?? null)
        const pg = pLogs.reduce((s, gl) => s + gl.goals, 0)
        const pa = pLogs.reduce((s, gl) => s + gl.assists, 0)
        const pw = pLogs.reduce((s, gl) => s + gl.goalie_wins, 0)
        const pl = pLogs.reduce((s, gl) => s + gl.goalie_otl, 0)
        const ps = pLogs.reduce((s, gl) => s + gl.goalie_shutouts, 0)
        totalGoals += pg; totalAssists += pa; totalWins += pw; totalOtl += pl; totalSo += ps

        if (pLogs.length > 0 || period.is_active) {
          periods.push({
            goals: pg, assists: pa, goalie_wins: pw, goalie_otl: pl, goalie_shutouts: ps,
            points: calcPts(pg, pa, pw, pl, ps),
            activatedAt:   period.added_at,
            deactivatedAt: period.removed_at ?? null,
          })
        }
      }

      const pts = calcPts(totalGoals, totalAssists, totalWins, totalOtl, totalSo)
      const displayEntry = activeEntry ?? sortedEntries[sortedEntries.length - 1]

      players.push({
        playerId,
        nhlId:          (displayEntry.players as any)?.nhl_id ?? null,
        firstName:      (displayEntry.players as any)?.first_name ?? '',
        lastName:       (displayEntry.players as any)?.last_name ?? '',
        teamCode:       (displayEntry.players as any)?.teams?.code ?? null,
        positionSlot:   displayEntry.position_slot as 'F' | 'D' | 'G',
        goals:          totalGoals,
        assists:        totalAssists,
        goalieWins:     totalWins,
        goalieOtl:      totalOtl,
        goalieShutouts: totalSo,
        points:         pts,
        isActive,
        periods,
      })
      total += pts
    }

    standings.push({
      poolerId,
      poolerName: poolerNames.get(poolerId) ?? poolerId,
      totalPoints: total,
      players: players.sort((a, b) =>
        b.points - a.points || (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0)
      ),
    })
  }

  const sorted = standings.sort((a, b) => b.totalPoints - a.totalPoints)

  // Mise à jour du cache BD (appelé depuis /classement-series)
  if (fetchLive && sorted.length > 0) {
    const db = createAdminClient()
    await db.from('playoff_pool_standings_cache').upsert(
      sorted.map(s => ({
        pool_season_id: poolSeasonId,
        pooler_id:      s.poolerId,
        total_pts:      s.totalPoints,
        updated_at:     new Date().toISOString(),
      })),
      { onConflict: 'pool_season_id,pooler_id' },
    )
  }

  return sorted
}

/**
 * Lit le classement du pool des séries depuis le cache BD.
 * Rapide (pas d'appel NHL) — mis à jour à chaque visite de /classement-series.
 */
export async function getPlayoffStandingsCached(
  poolSeasonId: number,
): Promise<{ poolerId: string; poolerName: string; totalPoints: number }[]> {
  const supabase = await createClient()
  const [{ data: cache }, { data: poolers }] = await Promise.all([
    supabase
      .from('playoff_pool_standings_cache')
      .select('pooler_id, total_pts')
      .eq('pool_season_id', poolSeasonId)
      .order('total_pts', { ascending: false }),
    supabase.from('poolers').select('id, name'),
  ])
  if (!cache || cache.length === 0) return []
  const nameMap = new Map((poolers ?? []).map(p => [p.id, p.name]))
  return cache.map(row => ({
    poolerId:    row.pooler_id,
    poolerName:  nameMap.get(row.pooler_id) ?? row.pooler_id,
    totalPoints: row.total_pts,
  }))
}
