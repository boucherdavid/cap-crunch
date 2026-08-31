'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { computeTypeChangeAddedAt, checkFutureRosterConflict } from '@/lib/rosterTypeChange'

export type HistRosterEntry = {
  id: number
  playerId: number
  name: string
  position: string | null
  teamCode: string | null
  playerType: string
  addedAt: string
  rookieType: 'repeche' | 'agent_libre' | null
  poolDraftYear: number | null
  draftPickId: number | null
}

export async function getHistRosterAction(
  poolerId: string,
  poolSeasonId: number,
): Promise<HistRosterEntry[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('pooler_rosters')
    .select('id, player_id, player_type, added_at, rookie_type, pool_draft_year, draft_pick_id, players(first_name, last_name, position, teams(code))')
    .eq('pooler_id', poolerId)
    .eq('pool_season_id', poolSeasonId)
    .is('removed_at', null)
    .order('player_type')
  return (data ?? []).map((r: any) => ({
    id: r.id,
    playerId: r.player_id,
    name: `${r.players?.first_name ?? ''} ${r.players?.last_name ?? ''}`.trim(),
    position: r.players?.position ?? null,
    teamCode: r.players?.teams?.code ?? null,
    playerType: r.player_type,
    addedAt: r.added_at,
    rookieType: r.rookie_type,
    poolDraftYear: r.pool_draft_year,
    draftPickId: r.draft_pick_id,
  }))
}

export type HistPlayerResult = {
  id: number
  name: string
  position: string | null
  teamCode: string | null
}

export async function searchHistPlayersAction(query: string): Promise<HistPlayerResult[]> {
  if (query.trim().length < 2) return []
  const db = createAdminClient()
  const { data } = await db
    .from('players')
    .select('id, first_name, last_name, position, teams(code)')
    .or(`last_name.ilike.%${query}%,first_name.ilike.%${query}%`)
    .limit(15)
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`,
    position: p.position ?? null,
    teamCode: p.teams?.code ?? null,
  }))
}

// Vérifie si playerId a été retiré de poolerId il y a moins de delai_reactivation_jours
// par rapport à `date` (comparaison sur les dates effectives, pas l'heure réelle).
export async function checkHistReactivationDelayAction(
  poolerId: string,
  playerId: number,
  poolSeasonId: number,
  date: string,
): Promise<{ warning: string | null }> {
  if (!poolerId || !playerId || !date) return { warning: null }
  const db = createAdminClient()
  const ts = `${date}T12:00:00Z`

  const [{ data: saison }, { data: lastRemoval }] = await Promise.all([
    db.from('pool_seasons').select('delai_reactivation_jours').eq('id', poolSeasonId).single(),
    db.from('pooler_rosters')
      .select('removed_at')
      .eq('pooler_id', poolerId)
      .eq('player_id', playerId)
      .eq('pool_season_id', poolSeasonId)
      .not('removed_at', 'is', null)
      .lte('removed_at', ts)
      .order('removed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!lastRemoval?.removed_at) return { warning: null }
  const delai = saison?.delai_reactivation_jours ?? 7
  const days = (new Date(ts).getTime() - new Date(lastRemoval.removed_at).getTime()) / 86_400_000
  if (days < delai) {
    return { warning: `Retiré de ce pooler il y a ${days.toFixed(1)} j (délai de réactivation configuré : ${delai} j).` }
  }
  return { warning: null }
}

// Vérifie si playerId sort de LTIR (chez poolerId) moins de duree_min_ltir_jours après y
// avoir été placé — avertissement non bloquant, seulement pour laisser une trace dans le
// journal (Historique doit rester libre pour reconstituer des scénarios réels, même
// philosophie que checkHistReactivationDelayAction). Ne s'applique qu'aux corrections qui
// font sortir un joueur de LTIR (newType fourni et différent de 'ltir') ; le statut avant
// la correction doit être déterminé par l'appelant (roster actuel côté A).
export async function checkHistLtirDurationAction(
  poolerId: string,
  playerId: number,
  poolSeasonId: number,
  date: string,
  currentType: string | null,
  newType: string,
): Promise<{ warning: string | null }> {
  if (!poolerId || !playerId || !date || currentType !== 'ltir' || newType === 'ltir') return { warning: null }
  const db = createAdminClient()
  const ts = `${date}T12:00:00Z`

  const [{ data: saison }, { data: lastLtirStart }] = await Promise.all([
    db.from('pool_seasons').select('duree_min_ltir_jours').eq('id', poolSeasonId).single(),
    db.from('roster_change_log')
      .select('changed_at')
      .eq('pooler_id', poolerId)
      .eq('player_id', playerId)
      .eq('pool_season_id', poolSeasonId)
      .eq('new_type', 'ltir')
      .lte('changed_at', ts)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!lastLtirStart?.changed_at) return { warning: null }
  const duree = saison?.duree_min_ltir_jours ?? 21
  const days = (new Date(ts).getTime() - new Date(lastLtirStart.changed_at).getTime()) / 86_400_000
  if (days < duree) {
    return { warning: `Sur LTIR depuis seulement ${days.toFixed(1)} j (durée minimale configurée : ${duree} j).` }
  }
  return { warning: null }
}

export type HistTxType = 'swap' | 'trade' | 'ajout' | 'retrait' | 'type_change' | 'ballotage'

export type HistPlayerType = 'actif' | 'reserviste' | 'recrue' | 'ltir'

export type HistTradePlayer = {
  playerId: number
  type: HistPlayerType
  // pertinent seulement si type === 'recrue' — pré-rempli depuis la fiche d'origine
  // (transfert automatique de la protection), éditable manuellement dans le formulaire
  rookieType: 'repeche' | 'agent_libre' | null
  poolDraftYear: number | null
}

export type HistChangeInput = {
  poolSeasonId: number
  date: string            // YYYY-MM-DD
  txType: HistTxType
  // Côté A — toujours requis
  poolerAId: string
  playerOutAId: number | null   // swap/retrait/type_change : joueur qui quitte le pooler A (ou dont le type change)
  // swap seulement — si fourni, playerOutAId change de statut (reste chez le pooler A) au
  // lieu de quitter le pool complètement (ex: passer LTIR pour libérer une place et signer
  // un agent libre en même temps). null = comportement existant (retrait complet).
  playerOutANewType: HistPlayerType | null
  playerInAId: number | null    // swap/ajout : joueur qui arrive chez le pooler A
  playerInAType: HistPlayerType
  // Côté B — trade et ballotage
  poolerBId: string | null
  // ballotage seulement — statut du joueur (playerOutAId) chez le pooler réclamant (poolerBId)
  ballotageType: HistPlayerType | null
  // ballotage seulement — joueur optionnel libéré par le pooler réclamant pour faire de la
  // place (retrait complet chez poolerBId, ne repasse pas par le ballotage dans cet outil)
  ballotageReleasedId: number | null
  // type_change seulement — nouveau player_type du joueur playerOutAId, sans le retirer du pool
  typeChangeTo: HistPlayerType | null
  // type_change seulement — 2e joueur optionnel, pour un échange (ex: un descend, un monte)
  // dans la même transaction plutôt que 2 saisies séparées
  typeChangeSecondPlayerId: number | null
  typeChangeSecondTo: HistPlayerType | null
  // trade seulement — un ou plusieurs joueurs de chaque côté (échange N contre M)
  playersAOut: HistTradePlayer[]   // joueurs qui quittent A, arrivent chez B (avec leur type chez B)
  playersBOut: HistTradePlayer[]   // joueurs qui quittent B, arrivent chez A (avec leur type chez A)
  // trade seulement — choix de repêchage échangés (id de pool_draft_picks)
  pickAIds: number[]   // picks de A, transférés vers B
  pickBIds: number[]   // picks de B, transférés vers A
}

export type HistDraftPick = {
  id: number
  round: number
  season: string
  originalOwnerName: string | null
}

export async function getHistDraftPicksAction(poolerId: string): Promise<HistDraftPick[]> {
  if (!poolerId) return []
  const db = createAdminClient()
  const { data } = await db
    .from('pool_draft_picks')
    .select('id, round, pool_seasons(season), original_owner:poolers!original_owner_id(name)')
    .eq('current_owner_id', poolerId)
    .eq('is_used', false)
    .order('pool_season_id')
    .order('round')
  return ((data ?? []) as any[]).map(p => ({
    id: p.id,
    round: p.round,
    season: p.pool_seasons?.season ?? '?',
    originalOwnerName: p.original_owner?.name ?? null,
  }))
}

export async function submitHistChangeAction(
  input: HistChangeInput,
): Promise<{ error?: string; warning?: string }> {
  const db = createAdminClient()
  const ts = `${input.date}T12:00:00Z`
  const changeType = `hist_${input.txType}`

  async function log(playerId: number, poolerId: string, newType: string | null, oldType: string | null = null) {
    const { error } = await db.from('roster_change_log').insert({
      player_id: playerId, pooler_id: poolerId, pool_season_id: input.poolSeasonId,
      change_type: changeType, old_type: oldType, new_type: newType,
      changed_by: null, changed_at: ts, is_admin_override: true,
    })
    if (error) console.error('submitHistChangeAction log:', error.message)
  }

  // Change le player_type d'une ligne pooler_rosters existante sans la retirer du pool —
  // utilisé par "Changement de type" et par le nouveau cas "Échange même pooler" où le
  // joueur retiré change de statut (ex: passe LTIR) plutôt que de quitter le pooler.
  async function applyTypeChange(poolerId: string, playerId: number, newType: string): Promise<{ error?: string; warning?: string }> {
    const { data: existing } = await db
      .from('pooler_rosters')
      .select('player_type, added_at')
      .eq('pooler_id', poolerId)
      .eq('player_id', playerId)
      .eq('pool_season_id', input.poolSeasonId)
      .is('removed_at', null)
      .maybeSingle()
    if (!existing) return { error: `Entrée introuvable dans le roster actuel (joueur ${playerId})` }

    const conflict = await checkFutureRosterConflict(db, poolerId, playerId, input.poolSeasonId, ts, newType)
    if (conflict.error) return conflict

    const { addedAtOverride, warning } = computeTypeChangeAddedAt(existing.added_at, ts)
    const updateFields: Record<string, unknown> = { player_type: newType }
    if (addedAtOverride) updateFields.added_at = addedAtOverride

    const { error } = await db
      .from('pooler_rosters')
      .update(updateFields)
      .eq('pooler_id', poolerId)
      .eq('player_id', playerId)
      .eq('pool_season_id', input.poolSeasonId)
      .is('removed_at', null)
    if (error) return { error: `Changement de type : ${error.message}` }
    await log(playerId, poolerId, newType, existing.player_type)
    return { warning }
  }

  // Changement de type (actif ↔ réserviste ↔ recrue) sans retrait/ajout — cas à part,
  // le(s) joueur(s) restent dans le pool. Un 2e joueur optionnel permet un échange
  // (un descend, un monte) en une seule transaction.
  if (input.txType === 'type_change') {
    if (!input.playerOutAId || !input.typeChangeTo) return { error: 'Joueur ou type manquant' }

    const res1 = await applyTypeChange(input.poolerAId, input.playerOutAId, input.typeChangeTo)
    if (res1.error) return { error: res1.error }
    const warnings = [res1.warning].filter((w): w is string => !!w)

    if (input.typeChangeSecondPlayerId && input.typeChangeSecondTo) {
      const res2 = await applyTypeChange(input.poolerAId, input.typeChangeSecondPlayerId, input.typeChangeSecondTo)
      if (res2.error) return { error: res2.error }
      if (res2.warning) warnings.push(res2.warning)
    }

    revalidatePath('/admin/historique')
    revalidatePath('/admin/effectifs')
    return { warning: warnings.length > 0 ? warnings.join(' ') : undefined }
  }

  // Réclamation au ballotage : le pooler A libère un joueur, le pooler B le réclame —
  // retrait chez A + ajout chez B (comme un trade à sens unique, un seul joueur), mais
  // journalisé sous hist_ballotage pour rester distinguable d'un hist_trade dans le
  // Suivi/les notifications futures. Le réclamant peut aussi devoir libérer un de ses
  // propres joueurs pour faire de la place (ballotageReleasedId, optionnel) — ce joueur
  // quitte simplement le pool dans cet outil simplifié, il ne repasse pas lui-même par
  // un cycle de ballotage (ce serait une saisie distincte si applicable).
  if (input.txType === 'ballotage') {
    if (!input.poolerBId) return { error: 'Pooler réclamant manquant' }
    if (!input.playerOutAId) return { error: 'Joueur manquant' }
    if (!input.ballotageType) return { error: "Type d'arrivée manquant" }

    const { data: existing } = await db
      .from('pooler_rosters')
      .select('added_at')
      .eq('pooler_id', input.poolerAId)
      .eq('player_id', input.playerOutAId)
      .eq('pool_season_id', input.poolSeasonId)
      .is('removed_at', null)
      .maybeSingle()
    if (!existing) return { error: `Entrée introuvable dans le roster actuel (joueur ${input.playerOutAId})` }
    if (existing.added_at && ts < existing.added_at) {
      return { error: `Date (${input.date}) antérieure à la date d'ajout au roster (${existing.added_at.slice(0, 10)}) — corrige d'abord added_at (ex: via Changement de type) avant de saisir ce ballotage.` }
    }

    if (input.ballotageReleasedId) {
      const { data: releasedExisting } = await db
        .from('pooler_rosters')
        .select('added_at')
        .eq('pooler_id', input.poolerBId)
        .eq('player_id', input.ballotageReleasedId)
        .eq('pool_season_id', input.poolSeasonId)
        .is('removed_at', null)
        .maybeSingle()
      if (!releasedExisting) return { error: `Joueur libéré par le réclamant introuvable dans son roster actuel (joueur ${input.ballotageReleasedId}).` }
      if (releasedExisting.added_at && ts < releasedExisting.added_at) {
        return { error: `Date (${input.date}) antérieure à la date d'ajout au roster (${releasedExisting.added_at.slice(0, 10)}) pour le joueur libéré par le réclamant — corrige d'abord added_at.` }
      }
    }

    const { error: e1 } = await db
      .from('pooler_rosters')
      .update({ is_active: false, removed_at: ts })
      .eq('pooler_id', input.poolerAId)
      .eq('player_id', input.playerOutAId)
      .eq('pool_season_id', input.poolSeasonId)
      .is('removed_at', null)
    if (e1) return { error: `Libération (retrait A) : ${e1.message}` }
    await log(input.playerOutAId, input.poolerAId, null)

    const { error: e2 } = await db.from('pooler_rosters').insert({
      pooler_id: input.poolerBId,
      player_id: input.playerOutAId,
      pool_season_id: input.poolSeasonId,
      player_type: input.ballotageType,
      is_active: true,
      added_at: ts,
    })
    if (e2) return { error: `Réclamation (ajout B) : ${e2.message}` }
    await log(input.playerOutAId, input.poolerBId, input.ballotageType)

    if (input.ballotageReleasedId) {
      const { error: e3 } = await db
        .from('pooler_rosters')
        .update({ is_active: false, removed_at: ts })
        .eq('pooler_id', input.poolerBId)
        .eq('player_id', input.ballotageReleasedId)
        .eq('pool_season_id', input.poolSeasonId)
        .is('removed_at', null)
      if (e3) return { error: `Libération par le réclamant : ${e3.message}` }
      await log(input.ballotageReleasedId, input.poolerBId, null)
    }

    revalidatePath('/admin/historique')
    revalidatePath('/admin/effectifs')
    return {}
  }

  // Échange entre poolers : un ou plusieurs joueurs de chaque côté (N contre M),
  // plus des choix de repêchage optionnels. Cas à part, ne partage pas le chemin
  // "un seul joueur" utilisé par swap/ajout/retrait ci-dessous.
  if (input.txType === 'trade') {
    if (!input.poolerBId) return { error: 'Pooler B manquant' }
    const playersAOut = input.playersAOut ?? []
    const playersBOut = input.playersBOut ?? []
    const pickAIds = input.pickAIds ?? []
    const pickBIds = input.pickBIds ?? []
    if (playersAOut.length === 0 && playersBOut.length === 0 && pickAIds.length === 0 && pickBIds.length === 0) {
      return { error: 'Aucun joueur ni choix de repêchage sélectionné' }
    }

    // Calcule rookie_type/pool_draft_year/draft_pick_id pour la nouvelle ligne chez le pooler
    // receveur. Si l'admin n'a pas modifié les valeurs pré-remplies (transfert automatique
    // depuis la ligne d'origine), le draft_pick_id d'origine suit aussi — sinon (reconstruction
    // manuelle/incertaine) il est abandonné, le lien vers le pick d'origine n'étant plus fiable.
    function resolveRookieFields(
      type: HistPlayerType,
      rookieType: 'repeche' | 'agent_libre' | null,
      poolDraftYear: number | null,
      srcRow: { rookie_type: string | null; pool_draft_year: number | null; draft_pick_id: number | null } | null,
    ) {
      if (type !== 'recrue') return { rookie_type: null, pool_draft_year: null, draft_pick_id: null }
      const effectiveYear = rookieType === 'repeche' ? poolDraftYear : null
      const unchanged = rookieType === (srcRow?.rookie_type ?? null) && effectiveYear === (srcRow?.pool_draft_year ?? null)
      return {
        rookie_type: rookieType,
        pool_draft_year: effectiveYear,
        draft_pick_id: unchanged ? (srcRow?.draft_pick_id ?? null) : null,
      }
    }

    // Ferme la ligne ouverte (removed_at = date effective de l'échange) après avoir
    // vérifié que cette date n'est pas antérieure à added_at — sinon la fenêtre
    // added_at→removed_at serait inversée (incohérente, aucun segment actif calculable).
    async function removeFromRoster(poolerId: string, playerId: number) {
      const { data: existing } = await db
        .from('pooler_rosters')
        .select('added_at, rookie_type, pool_draft_year, draft_pick_id')
        .eq('pooler_id', poolerId)
        .eq('player_id', playerId)
        .eq('pool_season_id', input.poolSeasonId)
        .is('removed_at', null)
        .maybeSingle()
      if (!existing) return { error: `Entrée introuvable dans le roster actuel (joueur ${playerId})` }
      if (existing.added_at && ts < existing.added_at) {
        return { error: `Date d'échange (${input.date}) antérieure à la date d'ajout au roster (${existing.added_at.slice(0, 10)}) pour le joueur ${playerId} — corrige d'abord added_at (ex: via Changement de type) avant de saisir cet échange.` }
      }
      const { data: srcRow, error } = await db
        .from('pooler_rosters')
        .update({ is_active: false, removed_at: ts })
        .eq('pooler_id', poolerId)
        .eq('player_id', playerId)
        .eq('pool_season_id', input.poolSeasonId)
        .is('removed_at', null)
        .select('rookie_type, pool_draft_year, draft_pick_id')
        .maybeSingle()
      if (error) return { error: error.message }
      return { srcRow }
    }

    // Joueurs de A → B
    for (const { playerId, type, rookieType, poolDraftYear } of playersAOut) {
      const { srcRow, error: removeError } = await removeFromRoster(input.poolerAId, playerId)
      if (removeError) return { error: `Retrait A (joueur ${playerId}) : ${removeError}` }
      await log(playerId, input.poolerAId, null)

      const { error: errIn } = await db.from('pooler_rosters').insert({
        pooler_id: input.poolerBId,
        player_id: playerId,
        pool_season_id: input.poolSeasonId,
        player_type: type,
        is_active: true,
        added_at: ts,
        ...resolveRookieFields(type, rookieType, poolDraftYear, srcRow ?? null),
      })
      if (errIn) return { error: `Ajout B (joueur ${playerId}) : ${errIn.message}` }
      await log(playerId, input.poolerBId, type)
    }

    // Joueurs de B → A
    for (const { playerId, type, rookieType, poolDraftYear } of playersBOut) {
      const { srcRow, error: removeError } = await removeFromRoster(input.poolerBId, playerId)
      if (removeError) return { error: `Retrait B (joueur ${playerId}) : ${removeError}` }
      await log(playerId, input.poolerBId, null)

      const { error: errIn } = await db.from('pooler_rosters').insert({
        pooler_id: input.poolerAId,
        player_id: playerId,
        pool_season_id: input.poolSeasonId,
        player_type: type,
        is_active: true,
        added_at: ts,
        ...resolveRookieFields(type, rookieType, poolDraftYear, srcRow ?? null),
      })
      if (errIn) return { error: `Ajout A (joueur ${playerId}) : ${errIn.message}` }
      await log(playerId, input.poolerAId, type)
    }

    async function logPick(pickId: number, poolerId: string, arrived: boolean) {
      const { error } = await db.from('roster_change_log').insert({
        player_id: null, pick_id: pickId, pooler_id: poolerId, pool_season_id: input.poolSeasonId,
        change_type: changeType, old_type: null, new_type: arrived ? 'transfere' : null,
        changed_by: null, changed_at: ts, is_admin_override: true,
      })
      if (error) console.error('submitHistChangeAction logPick:', error.message)
    }

    // Choix de repêchage échangés : A → B et B → A
    for (const pickId of pickAIds) {
      const { data: pick } = await db.from('pool_draft_picks').select('current_owner_id, is_used').eq('id', pickId).single()
      if (!pick || pick.is_used || pick.current_owner_id !== input.poolerAId) {
        return { error: `Choix de repêchage (id: ${pickId}) invalide ou n'appartient plus à ce pooler.` }
      }
      const { error } = await db.from('pool_draft_picks').update({ current_owner_id: input.poolerBId }).eq('id', pickId)
      if (error) return { error: `Transfert de pick A→B : ${error.message}` }
      await logPick(pickId, input.poolerAId, false)
      await logPick(pickId, input.poolerBId, true)
    }
    for (const pickId of pickBIds) {
      const { data: pick } = await db.from('pool_draft_picks').select('current_owner_id, is_used').eq('id', pickId).single()
      if (!pick || pick.is_used || pick.current_owner_id !== input.poolerBId) {
        return { error: `Choix de repêchage (id: ${pickId}) invalide ou n'appartient plus à ce pooler.` }
      }
      const { error } = await db.from('pool_draft_picks').update({ current_owner_id: input.poolerAId }).eq('id', pickId)
      if (error) return { error: `Transfert de pick B→A : ${error.message}` }
      await logPick(pickId, input.poolerBId, false)
      await logPick(pickId, input.poolerAId, true)
    }

    revalidatePath('/admin/historique')
    revalidatePath('/admin/effectifs')
    return {}
  }

  const outWarnings: string[] = []

  // Retirer OU changer le statut du joueur A (swap / retrait). playerOutANewType (swap
  // seulement) permet de garder le joueur chez le pooler A avec un nouveau statut (ex:
  // LTIR) plutôt que de le retirer complètement — utile pour signer un agent libre en
  // libérant une place par LTIR/réserve dans la même transaction.
  if (input.playerOutAId) {
    if (input.txType === 'swap' && input.playerOutANewType) {
      const res = await applyTypeChange(input.poolerAId, input.playerOutAId, input.playerOutANewType)
      if (res.error) return { error: res.error }
      if (res.warning) outWarnings.push(res.warning)
    } else {
      const { error } = await db
        .from('pooler_rosters')
        .update({ is_active: false, removed_at: ts })
        .eq('pooler_id', input.poolerAId)
        .eq('player_id', input.playerOutAId)
        .eq('pool_season_id', input.poolSeasonId)
        .is('removed_at', null)
      if (error) return { error: `Retrait A : ${error.message}` }
      await log(input.playerOutAId, input.poolerAId, null)
    }
  }

  // Ajouter un joueur chez le pooler A (swap / ajout)
  if (input.playerInAId) {
    const { error } = await db.from('pooler_rosters').insert({
      pooler_id: input.poolerAId,
      player_id: input.playerInAId,
      pool_season_id: input.poolSeasonId,
      player_type: input.playerInAType,
      is_active: true,
      added_at: ts,
    })
    if (error) return { error: `Ajout A : ${error.message}` }
    await log(input.playerInAId, input.poolerAId, input.playerInAType)
  }

  revalidatePath('/admin/historique')
  revalidatePath('/admin/effectifs')
  return { warning: outWarnings.length > 0 ? outWarnings.join(' ') : undefined }
}

export type HistLogEntry = {
  id: number
  txType: HistTxType
  poolerName: string
  playerName: string | null
  teamCode: string | null
  pickLabel: string | null
  newType: string | null
  effectiveDate: string   // changed_at — date du mouvement dans le pool
  loggedAt: string        // created_at — moment réel de la saisie
  reactivationWarning: string | null
  ltirWarning: string | null
}

export async function getHistLogAction(poolSeasonId: number): Promise<HistLogEntry[]> {
  const db = createAdminClient()
  // poolers!roster_change_log_pooler_id_fkey : roster_change_log a 2 FK vers poolers
  // (pooler_id et changed_by) — PostgREST refuse un embed "poolers(...)" ambigu.
  const [{ data, error }, { data: saison }, { data: removals }, { data: ltirStarts }] = await Promise.all([
    db.from('roster_change_log')
      .select('id, pooler_id, player_id, pick_id, change_type, old_type, new_type, changed_at, created_at, players(first_name, last_name, teams(code)), poolers!roster_change_log_pooler_id_fkey(name), pool_draft_picks(round, pool_seasons(season))')
      .eq('pool_season_id', poolSeasonId)
      .like('change_type', 'hist_%')
      .order('created_at', { ascending: false })
      .limit(100),
    db.from('pool_seasons').select('delai_reactivation_jours, duree_min_ltir_jours').eq('id', poolSeasonId).single(),
    // Toutes les désactivations de la saison, pour évaluer le délai de réactivation en mémoire
    // plutôt qu'avec une requête par ligne du journal.
    db.from('pooler_rosters')
      .select('pooler_id, player_id, removed_at')
      .eq('pool_season_id', poolSeasonId)
      .not('removed_at', 'is', null),
    // Tous les débuts de LTIR de la saison, même principe pour la durée minimale.
    db.from('roster_change_log')
      .select('pooler_id, player_id, changed_at')
      .eq('pool_season_id', poolSeasonId)
      .eq('new_type', 'ltir'),
  ])

  if (error) {
    console.error('getHistLogAction:', error.message)
    return []
  }

  const delai = saison?.delai_reactivation_jours ?? 7
  const dureeLtir = saison?.duree_min_ltir_jours ?? 21

  return ((data ?? []) as any[]).map(r => {
    let reactivationWarning: string | null = null
    if (r.new_type && r.player_id) {
      const priorRemoval = (removals ?? [])
        .filter((x: any) => x.pooler_id === r.pooler_id && x.player_id === r.player_id && x.removed_at <= r.changed_at)
        .sort((a: any, b: any) => (b.removed_at as string).localeCompare(a.removed_at))[0]
      if (priorRemoval) {
        const days = (new Date(r.changed_at).getTime() - new Date(priorRemoval.removed_at).getTime()) / 86_400_000
        if (days < delai) {
          reactivationWarning = `Réactivé ${days.toFixed(1)} j après désactivation (délai configuré : ${delai} j)`
        }
      }
    }
    let ltirWarning: string | null = null
    if (r.old_type === 'ltir' && r.new_type && r.new_type !== 'ltir') {
      const lastLtirStart = (ltirStarts ?? [])
        .filter((x: any) => x.pooler_id === r.pooler_id && x.player_id === r.player_id && x.changed_at <= r.changed_at)
        .sort((a: any, b: any) => (b.changed_at as string).localeCompare(a.changed_at))[0]
      if (lastLtirStart) {
        const days = (new Date(r.changed_at).getTime() - new Date(lastLtirStart.changed_at).getTime()) / 86_400_000
        if (days < dureeLtir) {
          ltirWarning = `Sorti de LTIR ${days.toFixed(1)} j après y avoir été placé (durée minimale configurée : ${dureeLtir} j)`
        }
      }
    }
    return {
      id: r.id,
      txType: (r.change_type as string).replace('hist_', '') as HistTxType,
      poolerName: r.poolers?.name ?? '',
      playerName: r.player_id ? `${r.players?.first_name ?? ''} ${r.players?.last_name ?? ''}`.trim() : null,
      teamCode: r.players?.teams?.code ?? null,
      pickLabel: r.pick_id ? `Choix — ${r.pool_draft_picks?.pool_seasons?.season ?? '?'} Ronde ${r.pool_draft_picks?.round ?? '?'}` : null,
      newType: r.new_type,
      effectiveDate: r.changed_at,
      loggedAt: r.created_at,
      reactivationWarning,
      ltirWarning,
    }
  })
}

// Corrige la date effective d'une ou plusieurs lignes déjà journalisées (ex: erreur de saisie).
// Propage la correction à pooler_rosters.added_at/removed_at (jamais seulement au journal) —
// buildStandings() calcule les points sur cette fenêtre, pas sur roster_change_log.changed_at.
export async function updateHistLogDateAction(
  ids: number[],
  newDate: string,
): Promise<{ error?: string }> {
  if (ids.length === 0) return { error: 'Aucune ligne sélectionnée' }
  if (!newDate) return { error: 'Date manquante' }
  const db = createAdminClient()
  const newTs = `${newDate}T12:00:00Z`

  const { data: rows, error: fetchError } = await db
    .from('roster_change_log')
    .select('id, pooler_id, player_id, pool_season_id, change_type, new_type, changed_at')
    .in('id', ids)
  if (fetchError) return { error: fetchError.message }

  for (const row of rows ?? []) {
    const { error: logErr } = await db
      .from('roster_change_log')
      .update({ changed_at: newTs })
      .eq('id', row.id)
    if (logErr) return { error: `Journal (id ${row.id}) : ${logErr.message}` }

    // type_change ne touche jamais added_at/removed_at (le joueur reste sur la même ligne continue)
    // choix de repêchage (player_id null) : aucune fenêtre added_at/removed_at associée
    if (row.change_type === 'hist_type_change' || !row.player_id) continue

    const dateField = row.new_type ? 'added_at' : 'removed_at'
    const { data: updatedRoster, error: rosterErr } = await db
      .from('pooler_rosters')
      .update({ [dateField]: newTs })
      .eq('pooler_id', row.pooler_id)
      .eq('player_id', row.player_id)
      .eq('pool_season_id', row.pool_season_id)
      .eq(dateField, row.changed_at)
      .select('id')
    if (rosterErr) return { error: `Roster (id ${row.id}) : ${rosterErr.message}` }
    if (!updatedRoster || updatedRoster.length === 0) {
      return {
        error: `Ligne ${row.id} : date du journal corrigée, mais la ligne pooler_rosters correspondante (${dateField}) est introuvable — vérifier manuellement, le calcul des points pourrait rester basé sur l'ancienne date.`,
      }
    }
  }

  revalidatePath('/admin/historique')
  revalidatePath('/admin/effectifs')
  revalidatePath('/classement')
  revalidatePath('/poolers')
  revalidatePath('/poolers/[id]', 'page')
  revalidatePath('/dashboard')
  return {}
}

// Supprime une ou plusieurs lignes déjà journalisées (ex: transaction saisie par erreur).
// Annule aussi la vraie mutation associée (jamais seulement la ligne du journal) :
//   - arrivée joueur  → supprime la ligne pooler_rosters créée, si elle n'a pas été modifiée depuis
//   - départ joueur   → restaure removed_at = null sur la ligne d'origine, si elle n'a pas bougé depuis
//   - type_change     → restaure l'ancien player_type, si le type courant correspond encore à ce que
//                        cette ligne avait fait (old_type est connu, contrairement à updateHistLogDateAction)
//   - pick (arrivée)  → restaure current_owner_id vers le propriétaire précédent (retrouvé via la
//                        ligne de départ jumelle, même pick_id + même changed_at), si le pick n'a pas
//                        été retransféré depuis
// Sélectionner l'ensemble des lignes d'une même transaction (tous les joueurs/picks des deux sens)
// avant de supprimer — une suppression partielle peut laisser le roster dans un état incohérent.
export async function deleteHistLogAction(ids: number[]): Promise<{ error?: string }> {
  if (ids.length === 0) return { error: 'Aucune ligne sélectionnée' }
  const db = createAdminClient()

  const { data: rows, error: fetchError } = await db
    .from('roster_change_log')
    .select('id, pooler_id, player_id, pick_id, pool_season_id, change_type, old_type, new_type, changed_at')
    .in('id', ids)
  if (fetchError) return { error: fetchError.message }

  for (const row of rows ?? []) {
    if (row.change_type === 'hist_type_change') {
      if (!row.old_type) {
        return { error: `Ligne ${row.id} : type précédent inconnu — suppression annulée (risque d'incohérence).` }
      }
      const { data: current } = await db
        .from('pooler_rosters')
        .select('id, player_type')
        .eq('pooler_id', row.pooler_id)
        .eq('player_id', row.player_id)
        .eq('pool_season_id', row.pool_season_id)
        .is('removed_at', null)
        .maybeSingle()
      if (!current || current.player_type !== row.new_type) {
        return { error: `Ligne ${row.id} : le type actuel du joueur ne correspond plus à ce qu'a fait cette ligne (probablement modifié depuis) — suppression annulée.` }
      }
      const { error: revertErr } = await db
        .from('pooler_rosters')
        .update({ player_type: row.old_type })
        .eq('id', current.id)
      if (revertErr) return { error: `Ligne ${row.id} : ${revertErr.message}` }
      continue
    }

    if (row.pick_id) {
      if (row.new_type) {
        const { data: sibling } = await db
          .from('roster_change_log')
          .select('pooler_id')
          .eq('pick_id', row.pick_id)
          .eq('changed_at', row.changed_at)
          .is('new_type', null)
          .maybeSingle()
        if (!sibling) {
          return { error: `Ligne ${row.id} : propriétaire précédent du pick introuvable (ligne de départ jumelle absente) — suppression annulée.` }
        }
        const { data: reverted, error: pickErr } = await db
          .from('pool_draft_picks')
          .update({ current_owner_id: sibling.pooler_id })
          .eq('id', row.pick_id)
          .eq('current_owner_id', row.pooler_id)
          .select('id')
        if (pickErr) return { error: `Ligne ${row.id} : ${pickErr.message}` }
        if (!reverted || reverted.length === 0) {
          return { error: `Ligne ${row.id} : le pick a été retransféré depuis — suppression annulée.` }
        }
      }
      continue
    }

    if (row.player_id) {
      if (row.new_type) {
        const { data: deleted, error: delErr } = await db
          .from('pooler_rosters')
          .delete()
          .eq('pooler_id', row.pooler_id)
          .eq('player_id', row.player_id)
          .eq('pool_season_id', row.pool_season_id)
          .eq('added_at', row.changed_at)
          .is('removed_at', null)
          .select('id')
        if (delErr) return { error: `Ligne ${row.id} : ${delErr.message}` }
        if (!deleted || deleted.length === 0) {
          return { error: `Ligne ${row.id} : la fiche roster correspondante est introuvable ou a été modifiée depuis — suppression annulée.` }
        }
      } else {
        const { data: restored, error: restErr } = await db
          .from('pooler_rosters')
          .update({ removed_at: null, is_active: true })
          .eq('pooler_id', row.pooler_id)
          .eq('player_id', row.player_id)
          .eq('pool_season_id', row.pool_season_id)
          .eq('removed_at', row.changed_at)
          .select('id')
        if (restErr) return { error: `Ligne ${row.id} : ${restErr.message}` }
        if (!restored || restored.length === 0) {
          return { error: `Ligne ${row.id} : la fiche roster correspondante est introuvable (removed_at ne correspond plus) — suppression annulée.` }
        }
      }
    }
  }

  const { error: delLogErr } = await db.from('roster_change_log').delete().in('id', ids)
  if (delLogErr) return { error: delLogErr.message }

  revalidatePath('/admin/historique')
  revalidatePath('/admin/effectifs')
  revalidatePath('/classement')
  revalidatePath('/poolers')
  revalidatePath('/poolers/[id]', 'page')
  revalidatePath('/dashboard')
  return {}
}
