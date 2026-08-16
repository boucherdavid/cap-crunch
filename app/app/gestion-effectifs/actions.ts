'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

import { sendPushToUser } from '@/lib/push'
import { computeTypeChangeAddedAt, checkFutureRosterConflict } from '@/lib/rosterTypeChange'

export type PlayerType = 'actif' | 'reserviste' | 'ltir' | 'recrue'

export type ActionType =
  | 'change_status'
  | 'ltir'
  | 'return_ltir'
  | 'ltir_sign'
  | 'sign'
  | 'release'
  | 'ballotage'

export type RosterStatus = 'actif' | 'reserviste' | 'recrue'

export type RosterEntry = {
  id: number
  playerId: number
  playerType: PlayerType
  firstName: string
  lastName: string
  position: string | null
  teamCode: string | null
  nhlId: number | null
  capNumber: number | null
  lastDeactivatedAt: string | null  // ISO timestamp de la dernière désactivation (actif→res ou ltir)
  recrueEligible: boolean  // is_rookie ou draft_year dans la fenêtre de protection 5 saisons — peut retourner à la banque de recrues
}

export type RosterForPooler = {
  actifs: RosterEntry[]
  reservistes: RosterEntry[]
  ltir: RosterEntry[]
  recrues: RosterEntry[]
}

export type PlayerSearchResult = {
  id: number
  firstName: string
  lastName: string
  position: string | null
  teamCode: string | null
  nhlId: number | null
  capNumber: number | null
}

export type SaisonInfo = {
  id: number
  season: string
  poolCap: number
  delaiReactivationJours: number
  maxSignaturesAl: number
  maxSignaturesLtir: number
  gestionEffectifsOuvert: boolean
  isPlayoff: boolean
}

export type SigningCounts = {
  al: number
  ltir: number
}

export type BatchActionInput = {
  type: ActionType
  entry1Id?: number
  newType1?: RosterStatus
  entry2Id?: number
  newType2?: RosterStatus
  ltirEntryId?: number
  returnLtirEntryId?: number
  deactivateActifId?: number
  deactivateNewType?: 'reserviste' | 'ltir'
  newPlayerId?: number
  newPlayerType?: 'actif' | 'reserviste'
  releaseEntryId?: number
}

// ─── Read actions ─────────────────────────────────────────────────────────────

export async function getActiveSaisonAction(): Promise<SaisonInfo | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pool_seasons')
    .select('id, season, pool_cap, delai_reactivation_jours, max_signatures_al, max_signatures_ltir, gestion_effectifs_ouvert, is_playoff')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .single()
  if (!data) return null
  return {
    id: data.id,
    season: data.season,
    poolCap: Number(data.pool_cap),
    delaiReactivationJours: data.delai_reactivation_jours ?? 7,
    maxSignaturesAl: data.max_signatures_al ?? 10,
    maxSignaturesLtir: data.max_signatures_ltir ?? 2,
    gestionEffectifsOuvert: data.gestion_effectifs_ouvert ?? true,
    isPlayoff: data.is_playoff ?? false,
  }
}

export async function getPoolerRosterAction(
  poolerId: string,
  saisonId: number,
  season: string,
): Promise<RosterForPooler> {
  const supabase = await createClient()

  // Fenêtre de protection recrue (5 saisons) — même formule que getDraftYearCutoff()
  // dans admin/rosters/actions.ts, pour déterminer si un actif/réserviste peut encore
  // retourner à la banque de recrues.
  const draftYearCutoff = parseInt(season.split('-')[0], 10) + 1 - 5

  const [{ data: rosterData }, { data: deactRows }] = await Promise.all([
    supabase
      .from('pooler_rosters')
      .select(`
        id, player_id, player_type,
        players (
          first_name, last_name, position, nhl_id, is_rookie, draft_year,
          teams (code),
          player_contracts (season, cap_number)
        )
      `)
      .eq('pooler_id', poolerId)
      .eq('pool_season_id', saisonId)
      .eq('is_active', true)
      .order('player_type'),
    supabase
      .from('roster_change_log')
      .select('player_id, changed_at')
      .eq('pooler_id', poolerId)
      .eq('pool_season_id', saisonId)
      .in('change_type', ['deactivation', 'ltir'])
      .order('changed_at', { ascending: false }),
  ])

  // most recent deactivation date per player
  const deactMap = new Map<number, string>()
  for (const row of (deactRows ?? [])) {
    if (!deactMap.has(row.player_id)) deactMap.set(row.player_id, row.changed_at)
  }

  const entries: RosterEntry[] = (rosterData ?? []).map((r: any) => ({
    id: r.id,
    playerId: r.player_id,
    playerType: (r.player_type === 'agent_libre' ? 'reserviste' : r.player_type) as PlayerType,
    firstName: r.players?.first_name ?? '',
    lastName: r.players?.last_name ?? '',
    position: r.players?.position ?? null,
    teamCode: r.players?.teams?.code ?? null,
    nhlId: r.players?.nhl_id ?? null,
    capNumber: r.players?.player_contracts?.find((c: any) => c.season === season)?.cap_number ?? null,
    lastDeactivatedAt: deactMap.get(r.player_id) ?? null,
    recrueEligible: !!(r.players?.is_rookie || (r.players?.draft_year != null && r.players.draft_year >= draftYearCutoff)),
  }))

  return {
    actifs:      entries.filter(e => e.playerType === 'actif'),
    reservistes: entries.filter(e => e.playerType === 'reserviste'),
    ltir:        entries.filter(e => e.playerType === 'ltir'),
    recrues:     entries.filter(e => e.playerType === 'recrue'),
  }
}

export async function searchPlayersAction(
  query: string,
  season: string,
): Promise<PlayerSearchResult[]> {
  if (query.length < 2) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('players')
    .select('id, first_name, last_name, position, nhl_id, teams (code), player_contracts (season, cap_number)')
    .or(`last_name.ilike.%${query}%,first_name.ilike.%${query}%`)
    .eq('is_available', true)
    .order('last_name')
    .limit(20)
  return (data ?? []).map((p: any) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    position: p.position ?? null,
    teamCode: p.teams?.code ?? null,
    nhlId: p.nhl_id ?? null,
    capNumber: p.player_contracts?.find((c: any) => c.season === season)?.cap_number ?? null,
  }))
}

export async function getSigningCountsAction(
  poolerId: string,
  saisonId: number,
): Promise<SigningCounts> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('roster_change_log')
    .select('change_type')
    .eq('pooler_id', poolerId)
    .eq('pool_season_id', saisonId)
    .in('change_type', ['signature_agent_libre', 'signature_ltir'])
  const rows = data ?? []
  return {
    al:   rows.filter(r => r.change_type === 'signature_agent_libre').length,
    ltir: rows.filter(r => r.change_type === 'signature_ltir').length,
  }
}

// ─── Submit action ────────────────────────────────────────────────────────────

export async function submitBatchAction(input: {
  poolerId: string
  saisonId: number
  actions: BatchActionInput[]
  forcedDate?: string
}): Promise<{ error?: string; warning?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' }

  const { data: poolerSelf } = await supabase
    .from('poolers').select('is_admin').eq('id', user.id).single()
  const isAdmin = poolerSelf?.is_admin ?? false

  if (!isAdmin && user.id !== input.poolerId) return { error: 'Non autorisé' }
  if (input.actions.length === 0) return { error: 'Aucune action à soumettre' }

  const db = createAdminClient()
  const changedBy = isAdmin ? null : user.id

  // Fetch config
  const { data: saisonConfig } = await db
    .from('pool_seasons')
    .select('delai_reactivation_jours, max_signatures_al, max_signatures_ltir, saison_start_date, season')
    .eq('id', input.saisonId)
    .single()

  // Fenêtre de protection recrue (5 saisons) — même formule que getPoolerRosterAction()
  // et admin/rosters/actions.ts, revalidée ici côté serveur pour 'demote_rookie'.
  const draftYearCutoff = saisonConfig?.season
    ? parseInt(saisonConfig.season.split('-')[0], 10) + 1 - 5
    : new Date().getFullYear() - 4

  const delaiJours    = saisonConfig?.delai_reactivation_jours ?? 7
  const maxAl         = saisonConfig?.max_signatures_al ?? 10
  const maxLtir       = saisonConfig?.max_signatures_ltir ?? 2

  // Pré-saison : si une date de début est définie et qu'on est avant cette date
  const startDate = saisonConfig?.saison_start_date ? new Date(saisonConfig.saison_start_date) : null
  const isPreseason = startDate !== null && new Date() < startDate
  const isAdminOverride = !isPreseason && !!input.forcedDate && isAdmin

  const changedAt = isPreseason
    ? `${saisonConfig!.saison_start_date}T12:00:00Z`
    : input.forcedDate
      ? `${input.forcedDate}T12:00:00Z`
      : new Date().toISOString()

  // Count existing signings
  const { data: existingSigns } = await db
    .from('roster_change_log')
    .select('change_type')
    .eq('pooler_id', input.poolerId)
    .eq('pool_season_id', input.saisonId)
    .in('change_type', ['signature_agent_libre', 'signature_ltir'])

  let alUsed   = (existingSigns ?? []).filter(s => s.change_type === 'signature_agent_libre').length
  let ltirUsed = (existingSigns ?? []).filter(s => s.change_type === 'signature_ltir').length

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const warnings: string[] = []

  async function getEntry(entryId: number) {
    const { data } = await db
      .from('pooler_rosters')
      .select('player_id, player_type, added_at, rookie_type, players (nhl_id, is_rookie, draft_year)')
      .eq('id', entryId)
      .single()
    return data as {
      player_id: number; player_type: string; added_at: string | null; rookie_type: string | null
      players: { nhl_id: number | null; is_rookie: boolean | null; draft_year: number | null } | null
    } | null
  }

  async function log(playerId: number, changeType: string, oldType: string | null, newType: string | null) {
    if (isPreseason) return
    await db.from('roster_change_log').insert({
      player_id: playerId, pooler_id: input.poolerId, pool_season_id: input.saisonId,
      change_type: changeType, old_type: oldType, new_type: newType,
      changed_by: changedBy, changed_at: changedAt,
      is_admin_override: isAdminOverride,
    })
  }

  async function checkReactivationDelay(playerId: number) {
    if (isAdmin) return  // les admins ne sont pas soumis au délai
    const { data: lastDeact } = await db
      .from('roster_change_log')
      .select('changed_at')
      .eq('player_id', playerId)
      .eq('pooler_id', input.poolerId)
      .eq('pool_season_id', input.saisonId)
      .in('change_type', ['deactivation', 'ltir'])
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!lastDeact) return
    const daysDiff = (Date.now() - new Date(lastDeact.changed_at).getTime()) / 86_400_000
    if (daysDiff < delaiJours) {
      const unlock = new Date(lastDeact.changed_at)
      unlock.setDate(unlock.getDate() + delaiJours)
      throw new Error(
        `Ce joueur ne peut pas être réactivé avant le ${unlock.toLocaleDateString('fr-CA')} (délai de ${delaiJours} j)`,
      )
    }
  }

  async function deactivate(entryId: number, toType: 'reserviste' | 'ltir' | 'recrue') {
    const e = await getEntry(entryId)
    if (!e) throw new Error('Entrée introuvable')
    if (toType === 'recrue') {
      const eligible = !!(e.players?.is_rookie || (e.players?.draft_year != null && e.players.draft_year >= draftYearCutoff))
      if (!eligible) throw new Error('Ce joueur a dépassé la protection recrue (5 saisons) — ne peut plus retourner à la banque')
      if (!e.rookie_type) {
        warnings.push('Joueur renvoyé à la banque de recrues sans type recrue défini — à compléter dans Rosters initiaux (Repêché / Agent libre).')
      }
    }
    const conflict = await checkFutureRosterConflict(db, input.poolerId, e.player_id, input.saisonId, changedAt, toType)
    if (conflict.error) throw new Error(conflict.error)
    const { addedAtOverride, warning } = computeTypeChangeAddedAt(e.added_at, changedAt)
    if (warning) warnings.push(warning)
    await db.from('pooler_rosters')
      .update({ player_type: toType, ...(addedAtOverride ? { added_at: addedAtOverride } : {}) })
      .eq('id', entryId)
    await log(e.player_id, toType === 'ltir' ? 'ltir' : toType === 'recrue' ? 'changement_type' : 'deactivation', e.player_type, toType)
  }

  async function activate(entryId: number, fromType: string, withDelayCheck = false) {
    const e = await getEntry(entryId)
    if (!e) throw new Error('Entrée introuvable')
    if (withDelayCheck) await checkReactivationDelay(e.player_id)
    const conflict = await checkFutureRosterConflict(db, input.poolerId, e.player_id, input.saisonId, changedAt, 'actif')
    if (conflict.error) throw new Error(conflict.error)
    const { addedAtOverride, warning } = computeTypeChangeAddedAt(e.added_at, changedAt)
    if (warning) warnings.push(warning)
    await db.from('pooler_rosters')
      .update({ player_type: 'actif', ...(addedAtOverride ? { added_at: addedAtOverride } : {}) })
      .eq('id', entryId)
    await log(e.player_id, fromType === 'ltir' ? 'retour_ltir' : 'activation', fromType, 'actif')
  }

  // Changement de statut générique (actif/réserviste/recrue), utilisé par 'change_status' —
  // le délai de réactivation est toujours vérifié pour une entrée vers 'actif' (même un
  // joueur venant de la banque de recrues, au cas où il aurait été désactivé récemment sur
  // cette même ligne avant d'être renvoyé en recrue) puisque checkReactivationDelay() ne
  // trouve simplement rien à bloquer si aucun historique de désactivation n'existe.
  async function applyStatus(entryId: number, newType: RosterStatus) {
    if (newType === 'actif') {
      const e = await getEntry(entryId)
      if (!e) throw new Error('Entrée introuvable')
      await activate(entryId, e.player_type, /* withDelayCheck */ true)
    } else {
      await deactivate(entryId, newType)
    }
  }

  async function addNewPlayer(playerId: number, playerType: 'actif' | 'reserviste', signingType: 'al' | 'ltir' | 'ballotage') {
    // Validate budget (non-admins seulement, ballotage exempt)
    if (!isAdmin && signingType !== 'ballotage') {
      if (signingType === 'ltir') {
        // Budget LTIR dispo ou débord sur AL ?
        const ltirRoom = maxLtir - ltirUsed
        const alRoom   = maxAl - alUsed
        if (ltirRoom <= 0 && alRoom <= 0)
          throw new Error(`Budgets d'agents libres épuisés (AL : ${alUsed}/${maxAl}, LTIR : ${ltirUsed}/${maxLtir})`)
      } else {
        if (alUsed >= maxAl)
          throw new Error(`Budget d'agents libres standard épuisé (${alUsed}/${maxAl})`)
      }
    }

    const conflict = await checkFutureRosterConflict(db, input.poolerId, playerId, input.saisonId, changedAt, playerType)
    if (conflict.error) throw new Error(conflict.error)

    const { data: existing } = await db
      .from('pooler_rosters').select('id')
      .eq('pooler_id', input.poolerId).eq('player_id', playerId)
      .eq('pool_season_id', input.saisonId).maybeSingle()
    if (existing) {
      await db.from('pooler_rosters')
        .update({ is_active: true, player_type: playerType, removed_at: null, added_at: changedAt }).eq('id', existing.id)
    } else {
      await db.from('pooler_rosters').insert({
        pooler_id: input.poolerId, player_id: playerId,
        pool_season_id: input.saisonId, player_type: playerType, is_active: true,
        added_at: changedAt,
      })
    }

    // Choisir le bon budget et type de log
    let logType: string
    if (signingType === 'ballotage') {
      logType = 'ballotage'
    } else if (signingType === 'ltir' && ltirUsed < maxLtir) {
      logType = 'signature_ltir'
      ltirUsed++
    } else {
      logType = 'signature_agent_libre'
      alUsed++
    }

    await log(playerId, logType, null, playerType)
  }

  // ─── Process actions ────────────────────────────────────────────────────────

  try {
    for (const action of input.actions) {
      switch (action.type) {
        case 'change_status': {
          if (!action.entry1Id || !action.newType1) throw new Error('Joueur ou statut manquant (changement de statut)')
          if (action.entry2Id === action.entry1Id) throw new Error('Les deux joueurs sélectionnés doivent être différents')
          await applyStatus(action.entry1Id, action.newType1)
          if (action.entry2Id && action.newType2) await applyStatus(action.entry2Id, action.newType2)
          break
        }

        case 'ltir':
          if (!action.ltirEntryId) throw new Error('Joueur manquant (LTIR)')
          await deactivate(action.ltirEntryId, 'ltir')
          break

        case 'return_ltir':
          if (!action.returnLtirEntryId || !action.deactivateActifId) throw new Error('Joueurs manquants (retour LTIR)')
          await deactivate(action.deactivateActifId, action.deactivateNewType ?? 'reserviste')
          await activate(action.returnLtirEntryId, 'ltir', /* withDelayCheck */ true)
          break

        case 'ltir_sign':
          if (!action.ltirEntryId || !action.newPlayerId) throw new Error('Joueurs manquants (LTIR + signature)')
          await deactivate(action.ltirEntryId, 'ltir')
          await addNewPlayer(action.newPlayerId, 'actif', 'ltir')
          break

        case 'sign':
          if (!action.newPlayerId || !action.newPlayerType) throw new Error('Joueur manquant (signature)')
          await addNewPlayer(action.newPlayerId, action.newPlayerType, 'al')
          break

        case 'ballotage':
          if (!action.newPlayerId || !action.newPlayerType) throw new Error('Joueur manquant (ballotage)')
          await addNewPlayer(action.newPlayerId, action.newPlayerType, 'ballotage')
          break

        case 'release': {
          if (!action.releaseEntryId) throw new Error('Joueur manquant (libération)')
          const e = await getEntry(action.releaseEntryId)
          if (!e) throw new Error('Entrée introuvable (libération)')
          await log(e.player_id, e.player_type === 'actif' ? 'deactivation' : 'retrait', e.player_type, null)
          await db.from('pooler_rosters')
            .update({ is_active: false, removed_at: changedAt }).eq('id', action.releaseEntryId)
          break
        }

        default:
          throw new Error('Action inconnue')
      }
    }

    if (isAdmin) {
      const n = input.actions.length
      sendPushToUser(input.poolerId, {
        title: 'Cap Crunch — Mouvements',
        body: n === 1
          ? "Votre alignement a été modifié par l'admin."
          : `${n} mouvements ont été appliqués à votre alignement.`,
        url: `/poolers/${input.poolerId}`,
      }).catch(() => {})
    }

    return { warning: warnings.length > 0 ? warnings.join(' ') : undefined }
  } catch (e: any) {
    return { error: e?.message ?? 'Erreur inconnue' }
  }
}
