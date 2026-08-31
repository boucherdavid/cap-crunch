'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

import { sendPushToUser } from '@/lib/push'
import { computeTypeChangeAddedAt, checkFutureRosterConflict } from '@/lib/rosterTypeChange'
import { computeBatchEffectiveDate } from '@/lib/gameDayLock'
import { getEffectiveCap } from '@/lib/capUtils'
import { validateRosterLimits } from '@/lib/rosterLimits'

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
  isEstimatedCap: boolean
  lastDeactivatedAt: string | null  // ISO timestamp de la dernière désactivation (actif→res ou ltir)
  recrueEligible: boolean  // is_rookie, draft_year dans la fenêtre de 5 saisons, ou statut ELC — peut retourner à la banque de recrues
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
  seasonStarted: boolean
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
  newPlayerType?: 'actif' | 'reserviste' | 'recrue'
  releaseEntryId?: number
}

// ─── Read actions ─────────────────────────────────────────────────────────────

export async function getActiveSaisonAction(): Promise<SaisonInfo | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pool_seasons')
    .select('id, season, pool_cap, delai_reactivation_jours, max_signatures_al, max_signatures_ltir, gestion_effectifs_ouvert, season_started, is_playoff')
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
    seasonStarted: data.season_started ?? true,
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

  const [{ data: rosterData }, { data: deactRows }, { data: settings }] = await Promise.all([
    supabase
      .from('pooler_rosters')
      .select(`
        id, player_id, player_type,
        players (
          first_name, last_name, position, nhl_id, is_rookie, draft_year, status,
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
    supabase.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle(),
  ])
  const unsignedMultiplier = settings?.unsigned_player_cap_multiplier ?? 1.20

  // most recent deactivation date per player
  const deactMap = new Map<number, string>()
  for (const row of (deactRows ?? [])) {
    if (!deactMap.has(row.player_id)) deactMap.set(row.player_id, row.changed_at)
  }

  const entries: RosterEntry[] = (rosterData ?? []).map((r: any) => {
    const { cap, isEstimated } = getEffectiveCap(r.players?.player_contracts, season, unsignedMultiplier)
    return {
      id: r.id,
      playerId: r.player_id,
      playerType: (r.player_type === 'agent_libre' ? 'reserviste' : r.player_type) as PlayerType,
      firstName: r.players?.first_name ?? '',
      lastName: r.players?.last_name ?? '',
      position: r.players?.position ?? null,
      teamCode: r.players?.teams?.code ?? null,
      nhlId: r.players?.nhl_id ?? null,
      capNumber: cap || null,
      isEstimatedCap: isEstimated,
      lastDeactivatedAt: deactMap.get(r.player_id) ?? null,
      recrueEligible: !!(r.players?.is_rookie || (r.players?.draft_year != null && r.players.draft_year >= draftYearCutoff) || r.players?.status === 'ELC'),
    }
  })

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
    .select('delai_reactivation_jours, max_signatures_al, max_signatures_ltir, saison_start_date, season, season_started, pool_cap, gestion_effectifs_ouvert')
    .eq('id', input.saisonId)
    .single()

  // Verrou pooler : self-service fermé tant que la saison n'est pas démarrée
  // (/admin/nouvelle-saison → "Démarrer la saison"), et indépendamment tant que
  // gestion_effectifs_ouvert=false (gel ponctuel, ex: date limite de transaction). Les
  // admins contournent les deux, comme avant.
  if (!isAdmin) {
    if (!saisonConfig?.season_started) return { error: "La saison n'a pas encore démarré." }
    if (!(saisonConfig.gestion_effectifs_ouvert ?? true)) return { error: "L'outil est temporairement fermé." }
  }

  // Fenêtre de protection recrue (5 saisons) — même formule que getPoolerRosterAction()
  // et admin/rosters/actions.ts, revalidée ici côté serveur pour 'demote_rookie'.
  const draftYearCutoff = saisonConfig?.season
    ? parseInt(saisonConfig.season.split('-')[0], 10) + 1 - 5
    : new Date().getFullYear() - 4

  const delaiJours    = saisonConfig?.delai_reactivation_jours ?? 7
  const maxAl         = saisonConfig?.max_signatures_al ?? 10
  const maxLtir       = saisonConfig?.max_signatures_ltir ?? 2

  // Pré-saison (saison active mais pas encore démarrée) : ni validation ni journalisation,
  // date effective forcée à la date de début — même flag que le verrou ci-dessus, pour ne
  // pas avoir deux définitions de "on est encore en préparation" qui pourraient diverger.
  const isPreseason = !saisonConfig?.season_started
  const isAdminOverride = !isPreseason && !!input.forcedDate && isAdmin

  // Joueurs touchés par le lot (des deux côtés — celui qui sort, celui qui entre) pour la
  // règle d'atomicité : si l'un d'eux a déjà un match commencé aujourd'hui, tout le lot est
  // reporté à demain plutôt que de laisser chaque joueur basculer selon l'heure de son
  // propre match (voir app/lib/gameDayLock.ts). Seulement pour une soumission "en direct" —
  // pré-saison et date forcée ont déjà leur propre date explicite, pas de now() ambigu ici.
  let deferredToTomorrow = false
  let liveEffectiveAt = new Date().toISOString()
  if (!isPreseason && !input.forcedDate) {
    const entryIdsToResolve = new Set<number>()
    const directPlayerIds: number[] = []
    for (const action of input.actions) {
      if (action.entry1Id) entryIdsToResolve.add(action.entry1Id)
      if (action.entry2Id) entryIdsToResolve.add(action.entry2Id)
      if (action.ltirEntryId) entryIdsToResolve.add(action.ltirEntryId)
      if (action.returnLtirEntryId) entryIdsToResolve.add(action.returnLtirEntryId)
      if (action.deactivateActifId) entryIdsToResolve.add(action.deactivateActifId)
      if (action.releaseEntryId) entryIdsToResolve.add(action.releaseEntryId)
      if (action.newPlayerId) directPlayerIds.push(action.newPlayerId)
    }
    let resolvedPlayerIds: number[] = []
    if (entryIdsToResolve.size > 0) {
      const { data: rows } = await db.from('pooler_rosters').select('id, player_id').in('id', Array.from(entryIdsToResolve))
      resolvedPlayerIds = (rows ?? []).map(r => r.player_id)
    }
    const { effectiveAt, deferred } = await computeBatchEffectiveDate([...resolvedPlayerIds, ...directPlayerIds])
    liveEffectiveAt = effectiveAt
    deferredToTomorrow = deferred
  }

  const changedAt = isPreseason
    ? `${saisonConfig!.saison_start_date}T12:00:00Z`
    : input.forcedDate
      ? `${input.forcedDate}T12:00:00Z`
      : liveEffectiveAt

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
  if (deferredToTomorrow) {
    warnings.push("Un des joueurs impliqués a déjà un match commencé aujourd'hui — ce mouvement sera effectif à compter de demain.")
  }

  async function getEntry(entryId: number) {
    const { data } = await db
      .from('pooler_rosters')
      .select('player_id, player_type, added_at, rookie_type, players (nhl_id, is_rookie, draft_year, status)')
      .eq('id', entryId)
      .single()
    return data as {
      player_id: number; player_type: string; added_at: string | null; rookie_type: string | null
      players: { nhl_id: number | null; is_rookie: boolean | null; draft_year: number | null; status: string | null } | null
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
    const rookieFields: Record<string, unknown> = {}
    if (toType === 'recrue') {
      const eligible = !!(
        e.players?.is_rookie ||
        (e.players?.draft_year != null && e.players.draft_year >= draftYearCutoff) ||
        e.players?.status === 'ELC'
      )
      if (!eligible) throw new Error('Ce joueur a dépassé la protection recrue (5 saisons) et n\'est pas sur ELC — ne peut plus retourner à la banque')
      // Jamais classé auparavant (pas passé par le repêchage du pool, qui fixe rookie_type='repeche'
      // dès la sélection) — seul le cas agent libre/ELC peut être déduit automatiquement ici. Le cas
      // repêché-mais-plus-sur-ELC (protection 5 saisons) reste manuel via /admin/init (pool_draft_year requis).
      if (!e.rookie_type) rookieFields.rookie_type = 'agent_libre'
    }
    const conflict = await checkFutureRosterConflict(db, input.poolerId, e.player_id, input.saisonId, changedAt, toType)
    if (conflict.error) throw new Error(conflict.error)
    const { addedAtOverride, warning } = computeTypeChangeAddedAt(e.added_at, changedAt)
    if (warning) warnings.push(warning)
    await db.from('pooler_rosters')
      .update({ player_type: toType, ...(addedAtOverride ? { added_at: addedAtOverride } : {}), ...rookieFields })
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

  async function addNewPlayer(playerId: number, playerType: 'actif' | 'reserviste' | 'recrue', signingType: 'al' | 'ltir' | 'ballotage') {
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

    // Signature directe en recrue (agent libre encore sur son ELC) — évite le détour par
    // /admin/init (Banque de recrues), qui reste nécessaire seulement pour le cas repêché-par-
    // le-pool mais plus sur ELC (protection 5 saisons, pool_draft_year requis).
    const rookieFields: Record<string, unknown> = {}
    if (playerType === 'recrue') {
      const { data: player } = await db.from('players').select('is_rookie, draft_year, status').eq('id', playerId).single()
      const eligible = !!(player?.is_rookie || (player?.draft_year != null && player.draft_year >= draftYearCutoff) || player?.status === 'ELC')
      if (!eligible) throw new Error('Ce joueur n\'est pas admissible à la banque de recrues (protection recrue expirée et pas sur ELC)')
      rookieFields.rookie_type = 'agent_libre'
    }

    const conflict = await checkFutureRosterConflict(db, input.poolerId, playerId, input.saisonId, changedAt, playerType)
    if (conflict.error) throw new Error(conflict.error)

    const { data: existing } = await db
      .from('pooler_rosters').select('id')
      .eq('pooler_id', input.poolerId).eq('player_id', playerId)
      .eq('pool_season_id', input.saisonId).maybeSingle()
    if (existing) {
      await db.from('pooler_rosters')
        .update({ is_active: true, player_type: playerType, removed_at: null, added_at: changedAt, ...rookieFields }).eq('id', existing.id)
    } else {
      await db.from('pooler_rosters').insert({
        pooler_id: input.poolerId, player_id: playerId,
        pool_season_id: input.saisonId, player_type: playerType, is_active: true,
        added_at: changedAt, ...rookieFields,
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

  // ─── Validation de l'état final (poolers seulement — override admin délibéré) ─────────────
  // Simule l'effet du lot sur le roster actif du pooler AVANT d'écrire quoi que ce soit, pour
  // ne jamais laisser un état non conforme (12/6/2, réservistes, cap) atteindre la base —
  // mêmes règles que submitTransactionAction/submitRosterAction (app/lib/rosterLimits.ts).
  // Ne devient de toute façon atteignable qu'après "Démarrer la saison" (verrou plus haut).
  if (!isAdmin) {
    const [{ data: currentRows }, { data: settingsRow }] = await Promise.all([
      db
        .from('pooler_rosters')
        .select('id, player_type, players (position, player_contracts (season, cap_number))')
        .eq('pooler_id', input.poolerId)
        .eq('pool_season_id', input.saisonId)
        .eq('is_active', true),
      db.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle(),
    ])
    const unsignedMultiplier = settingsRow?.unsigned_player_cap_multiplier ?? 1.20
    const season = saisonConfig?.season ?? ''

    type VirtualEntry = { player_type: string; position: string | null; capNumber: number }
    const virtual = new Map<number, VirtualEntry>()
    for (const row of (currentRows ?? []) as any[]) {
      virtual.set(row.id, {
        player_type: row.player_type,
        position: row.players?.position ?? null,
        capNumber: getEffectiveCap(row.players?.player_contracts, season, unsignedMultiplier).cap,
      })
    }

    // Nouveaux joueurs (sign/ballotage/ltir_sign)
    const newPlayerIds = input.actions.filter(a => a.newPlayerId).map(a => a.newPlayerId!)
    const newPlayerMap = new Map<number, any>()
    if (newPlayerIds.length > 0) {
      const { data: newPlayers } = await db.from('players').select('id, position, player_contracts (season, cap_number)').in('id', newPlayerIds)
      for (const p of (newPlayers ?? [])) newPlayerMap.set(p.id, p)
    }

    let nextTempId = -1
    for (const action of input.actions) {
      switch (action.type) {
        case 'change_status': {
          if (action.entry1Id && action.newType1) {
            const e = virtual.get(action.entry1Id)
            if (e) e.player_type = action.newType1
          }
          if (action.entry2Id && action.newType2) {
            const e = virtual.get(action.entry2Id)
            if (e) e.player_type = action.newType2
          }
          break
        }
        case 'ltir': {
          if (action.ltirEntryId) {
            const e = virtual.get(action.ltirEntryId)
            if (e) e.player_type = 'ltir'
          }
          break
        }
        case 'return_ltir': {
          if (action.deactivateActifId) {
            const e = virtual.get(action.deactivateActifId)
            if (e) e.player_type = action.deactivateNewType ?? 'reserviste'
          }
          if (action.returnLtirEntryId) {
            const e = virtual.get(action.returnLtirEntryId)
            if (e) e.player_type = 'actif'
          }
          break
        }
        case 'ltir_sign': {
          if (action.ltirEntryId) {
            const e = virtual.get(action.ltirEntryId)
            if (e) e.player_type = 'ltir'
          }
          if (action.newPlayerId) {
            const p = newPlayerMap.get(action.newPlayerId)
            virtual.set(nextTempId--, {
              player_type: 'actif',
              position: p?.position ?? null,
              capNumber: getEffectiveCap(p?.player_contracts, season, unsignedMultiplier).cap,
            })
          }
          break
        }
        case 'sign':
        case 'ballotage': {
          if (action.newPlayerId && action.newPlayerType) {
            const p = newPlayerMap.get(action.newPlayerId)
            virtual.set(nextTempId--, {
              player_type: action.newPlayerType,
              position: p?.position ?? null,
              capNumber: getEffectiveCap(p?.player_contracts, season, unsignedMultiplier).cap,
            })
          }
          break
        }
        case 'release': {
          if (action.releaseEntryId) virtual.delete(action.releaseEntryId)
          break
        }
      }
    }

    const limitError = validateRosterLimits(Array.from(virtual.values()), saisonConfig?.pool_cap ?? 0)
    if (limitError) return { error: limitError }
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
