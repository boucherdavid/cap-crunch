'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { isRookieProtectionExpired } from '@/lib/rookieProtection'

const REVALIDATE_PATHS = ['/admin/pool', '/admin', '/', '/poolers', '/dashboard']
const revalidateAll = () => REVALIDATE_PATHS.forEach(p => revalidatePath(p))

function nextSeasonLabel(season: string, offset: number): string {
  const startYear = parseInt(season.split('-')[0], 10) + offset
  const endShort = String(startYear + 1).slice(2)
  return `${startYear}-${endShort}`
}

async function ensureSeasonWithPicks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  season: string,
  nhlCap: number,
  capMultiplier: number,
  poolerIds: string[],
): Promise<{ id: number; created: boolean } | { error: string }> {
  const { data: existing } = await supabase
    .from('pool_seasons')
    .select('id')
    .eq('season', season)
    .maybeSingle()

  let saisonId: number
  let created = false

  if (existing) {
    saisonId = existing.id
  } else {
    const { data: newSaison, error } = await supabase
      .from('pool_seasons')
      .insert({ season, nhl_cap: nhlCap, cap_multiplier: capMultiplier, is_active: false })
      .select('id')
      .single()
    if (error) return { error: error.message }
    saisonId = newSaison.id
    created = true
  }

  // Créer les picks manquants (ON CONFLICT DO NOTHING via upsert)
  if (poolerIds.length > 0) {
    const picks = poolerIds.flatMap(id =>
      [1, 2, 3, 4].map(round => ({
        pool_season_id: saisonId,
        original_owner_id: id,
        current_owner_id: id,
        round,
        is_used: false,
      }))
    )
    const { error: pickError } = await supabase
      .from('pool_draft_picks')
      .upsert(picks, { onConflict: 'pool_season_id,original_owner_id,round', ignoreDuplicates: true })
    if (pickError) return { error: pickError.message }
  }

  return { id: saisonId, created }
}

export async function createSeasonAction(
  season: string,
  nhlCap: number,
  capMultiplier: number,
  isPlayoff = false,
): Promise<{ error?: string }> {
  const validFormat = isPlayoff ? /^\d{4}-PO$/.test(season) : /^\d{4}-\d{2}$/.test(season)
  if (!validFormat) return { error: isPlayoff ? 'Format invalide. Utiliser ex: 2025-PO' : 'Format invalide. Utiliser ex: 2026-27' }
  if (nhlCap < 1_000_000) return { error: 'Cap NHL invalide.' }
  if (capMultiplier <= 0) return { error: 'Facteur invalide.' }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('pool_seasons')
    .select('id')
    .eq('season', season)
    .maybeSingle()
  if (existing) return { error: `La saison ${season} existe déjà.` }

  const { data: poolers } = await supabase.from('poolers').select('id')
  const poolerIds = (poolers ?? []).map(p => p.id)

  if (isPlayoff) {
    // Saison séries : cap fixe par ronde, pas de facteur multiplicatif
    const { error } = await supabase
      .from('pool_seasons')
      .insert({ season, nhl_cap: nhlCap, cap_multiplier: 1, is_active: false, is_playoff: true })
    if (error) return { error: error.message }
  } else {
    // Saison régulière : créer + 2 suivantes avec picks
    for (let offset = 0; offset < 3; offset++) {
      const label = offset === 0 ? season : nextSeasonLabel(season, offset)
      const result = await ensureSeasonWithPicks(supabase, label, nhlCap, capMultiplier, poolerIds)
      if ('error' in result) return { error: result.error }
      if (offset === 0 && !result.created) return { error: `La saison ${season} existe déjà.` }
    }
  }

  revalidateAll()
  return {}
}

export async function activateSeasonAction(saisonId: number): Promise<{ error?: string }> {
  const supabase = await createClient()

  // Récupérer le type de la saison cible pour ne désactiver que les saisons du même type
  const { data: target } = await supabase
    .from('pool_seasons')
    .select('is_playoff')
    .eq('id', saisonId)
    .single()
  if (!target) return { error: 'Saison introuvable.' }

  // Désactiver uniquement les saisons du même type (régulières OU séries)
  // — permet à une saison régulière et une saison séries d'être actives simultanément
  const { error: deactivateError } = await supabase
    .from('pool_seasons')
    .update({ is_active: false })
    .eq('is_playoff', target.is_playoff)
  if (deactivateError) return { error: deactivateError.message }

  // Activer la saison cible
  const { error } = await supabase
    .from('pool_seasons')
    .update({ is_active: true })
    .eq('id', saisonId)
  if (error) return { error: error.message }

  revalidateAll()
  return {}
}

export async function deactivateSeasonAction(saisonId: number): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { data: saison } = await supabase.from('pool_seasons').select('is_active, is_playoff').eq('id', saisonId).single()
  if (!saison) return { error: 'Saison introuvable.' }
  if (!saison.is_playoff) return { error: 'Seule une saison de séries peut être désactivée sans en activer une autre.' }

  const { error } = await supabase
    .from('pool_seasons')
    .update({ is_active: false })
    .eq('id', saisonId)
  if (error) return { error: error.message }

  revalidateAll()
  return {}
}

export async function previewTransitionAction(
  fromSaisonId: number,
  toSaisonId: number,
): Promise<{
  error?: string
  playerCount?: number
  poolerCount?: number
  noContract?: { playerName: string; poolerName: string; playerType: string }[]
  willBumpToReserviste?: number
}> {
  const supabase = await createClient()

  const [{ data: toSaison }, { data: rosters }] = await Promise.all([
    supabase.from('pool_seasons').select('season').eq('id', toSaisonId).single(),
    supabase
      .from('pooler_rosters')
      .select(`pooler_id, player_id, player_type, rookie_type, pool_draft_year, poolers (name), players (first_name, last_name, player_contracts (season, cap_number, is_elc))`)
      .eq('pool_season_id', fromSaisonId)
      .eq('is_active', true),
  ])

  if (!toSaison) return { error: 'Saison cible introuvable.' }

  const seasonStartYear = parseInt(toSaison.season.split('-')[0], 10)
  const entries = (rosters ?? []) as any[]
  const noContract: { playerName: string; poolerName: string; playerType: string }[] = []

  let willBumpToReserviste = 0

  for (const e of entries) {
    const contracts: any[] = e.players?.player_contracts ?? []
    const currentContract = contracts.find((c: any) => c.season === toSaison.season)
    const hasContract = contracts.some((c: any) => c.season === toSaison.season && c.cap_number > 0)
    if (hasContract) continue

    // Recrue encore protégée (5 saisons repêchage, ou ELC actif) : normal de ne pas avoir
    // de contrat NHL — n'appartient pas au même avertissement que les vétérans non signés.
    if (e.player_type === 'recrue') {
      const isExpired = isRookieProtectionExpired(e.rookie_type ?? null, e.pool_draft_year ?? null, !!currentContract?.is_elc, seasonStartYear)
      if (!isExpired) continue
      // Protection expirée : sera basculée en réserviste par transitionSeasonAction (David,
      // 2026-09-02) — de toute façon, elle devra devenir active ou réservistes si le pooler
      // la garde, autant l'exposer tout de suite plutôt que la laisser invisible dans la banque.
      willBumpToReserviste++
    }

    noContract.push({
      playerName: `${e.players?.last_name}, ${e.players?.first_name}`,
      poolerName: e.poolers?.name ?? '?',
      playerType: e.player_type,
    })
  }

  const poolerCount = new Set(entries.map((e: any) => e.pooler_id)).size

  return { playerCount: entries.length, poolerCount, noContract, willBumpToReserviste }
}

export async function transitionSeasonAction(
  fromSaisonId: number,
  toSaisonId: number,
): Promise<{ error?: string; copied?: number; bumped?: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { data: toSaison } = await supabase.from('pool_seasons').select('season').eq('id', toSaisonId).single()
  if (!toSaison) return { error: 'Saison cible introuvable.' }
  const seasonStartYear = parseInt(toSaison.season.split('-')[0], 10)

  const { data: rosters } = await supabase
    .from('pooler_rosters')
    .select('pooler_id, player_id, player_type, rookie_type, pool_draft_year, players(player_contracts(season, is_elc))')
    .eq('pool_season_id', fromSaisonId)
    .eq('is_active', true)

  const entries = (rosters ?? []) as any[]
  if (entries.length === 0) return { error: 'Aucun roster à copier dans la saison source.' }

  // Pas de contrainte unique (pooler_id, player_id, pool_season_id) fiable en base pour
  // s'appuyer sur un upsert ON CONFLICT — on filtre nous-mêmes les entrées déjà copiées
  // (relance après un essai précédent) plutôt que de dépendre d'une contrainte absente.
  const { data: existing } = await supabase
    .from('pooler_rosters')
    .select('pooler_id, player_id')
    .eq('pool_season_id', toSaisonId)
  const existingKeys = new Set((existing ?? []).map((e: any) => `${e.pooler_id}:${e.player_id}`))

  let bumped = 0

  const toInsert = entries
    .filter((e: any) => !existingKeys.has(`${e.pooler_id}:${e.player_id}`))
    .map((e: any) => {
      // Les joueurs en LTIR reviennent actif au début de la nouvelle saison
      let playerType = e.player_type === 'ltir' ? 'actif' : e.player_type

      // Recrue dont la protection expire pour la saison cible (5 saisons repêchage, ou fin
      // d'ELC pour un agent libre) : bascule en réserviste plutôt que de rester invisible
      // dans la banque de recrues — de toute façon elle devra devenir active ou réserviste
      // si le pooler la garde, autant l'exposer tout de suite pour le ménage pré-saison
      // (David, 2026-09-02). Même définition que previewTransitionAction — l'avertissement
      // affiché avant de confirmer doit correspondre exactement à ce qui se passe ici.
      if (playerType === 'recrue') {
        const contracts: any[] = e.players?.player_contracts ?? []
        const currentContract = contracts.find((c: any) => c.season === toSaison.season)
        if (isRookieProtectionExpired(e.rookie_type ?? null, e.pool_draft_year ?? null, !!currentContract?.is_elc, seasonStartYear)) {
          playerType = 'reserviste'
          bumped++
        }
      }

      return {
        pooler_id: e.pooler_id,
        player_id: e.player_id,
        pool_season_id: toSaisonId,
        player_type: playerType,
        rookie_type: e.rookie_type ?? null,
        pool_draft_year: e.pool_draft_year ?? null,
        is_active: true,
      }
    })

  if (toInsert.length === 0) return { copied: 0, bumped: 0 }

  const { error } = await supabase.from('pooler_rosters').insert(toInsert)

  if (error) return { error: error.message }

  revalidateAll()
  return { copied: toInsert.length, bumped }
}

// Masque/affiche une saison inactive dans les sélecteurs publics (/journal-transactions,
// /repechage-recrues) — n'a aucun effet sur la saison active, toujours visible dans son
// propre sélecteur (voir le filtre .or('is_public.eq.true,is_active.eq.true') des pages).
export async function setSeasonVisibilityAction(saisonId: number, isPublic: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { error } = await supabase
    .from('pool_seasons')
    .update({ is_public: isPublic })
    .eq('id', saisonId)
  if (error) return { error: error.message }

  revalidateAll()
  return {}
}

export async function deleteSeasonAction(saisonId: number): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { data: saison } = await supabase.from('pool_seasons').select('is_active, is_playoff, season').eq('id', saisonId).single()
  if (!saison) return { error: 'Saison introuvable.' }
  if (saison.is_active && !saison.is_playoff) return { error: 'Impossible de supprimer une saison régulière active.' }

  // Supprimer les transaction_items puis transactions liés (pas de CASCADE)
  const { data: txs } = await supabase.from('transactions').select('id').eq('pool_season_id', saisonId)
  if (txs && txs.length > 0) {
    const txIds = txs.map(t => t.id)
    const { error: e1 } = await supabase.from('transaction_items').delete().in('transaction_id', txIds)
    if (e1) return { error: e1.message }
    const { error: e2 } = await supabase.from('transactions').delete().eq('pool_season_id', saisonId)
    if (e2) return { error: e2.message }
  }

  // player_stat_snapshots et roster_change_log référencent pool_season_id sans CASCADE —
  // surtout pertinent pour une saison de séries (snapshots d'activation/désactivation du pool
  // des séries), mais nettoyé pour les deux types par prudence.
  const { error: eSnap } = await supabase.from('player_stat_snapshots').delete().eq('pool_season_id', saisonId)
  if (eSnap) return { error: eSnap.message }
  const { error: eLog } = await supabase.from('roster_change_log').delete().eq('pool_season_id', saisonId)
  if (eLog) return { error: eLog.message }

  // Tables du pool des séries (app/app/gestion-series/playoff-pool-actions.ts) — même
  // situation, pool_season_id sans CASCADE. Pertinentes seulement pour une saison is_playoff,
  // mais nettoyées inconditionnellement par prudence (pas de mal à les viser sur une saison
  // régulière, elles seront simplement vides).
  const { error: ePpr } = await supabase.from('playoff_pool_rosters').delete().eq('pool_season_id', saisonId)
  if (ePpr) return { error: ePpr.message }
  const { error: ePpt } = await supabase.from('playoff_participating_teams').delete().eq('pool_season_id', saisonId)
  if (ePpt) return { error: ePpt.message }
  const { error: ePe } = await supabase.from('playoff_eliminations').delete().eq('pool_season_id', saisonId)
  if (ePe) return { error: ePe.message }
  const { error: ePsc } = await supabase.from('playoff_pool_standings_cache').delete().eq('pool_season_id', saisonId)
  if (ePsc) return { error: ePsc.message }

  // Supprimer la saison (cascade: pooler_rosters, pool_draft_picks)
  const { error } = await supabase.from('pool_seasons').delete().eq('id', saisonId)
  if (error) return { error: error.message }

  revalidateAll()
  return {}
}

export async function addRookieOverrideAction(
  poolerId: string,
  playerId: number,
  seasonId: number,
  rookieType: 'repeche' | 'agent_libre',
  poolDraftYear?: number,
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  // Vérifier que le joueur n'est pas déjà dans la banque de ce pooler cette saison
  const { data: existing } = await supabase
    .from('pooler_rosters')
    .select('id')
    .eq('pooler_id', poolerId)
    .eq('player_id', playerId)
    .eq('pool_season_id', seasonId)
    .eq('is_active', true)
    .maybeSingle()
  if (existing) return { error: 'Ce joueur est déjà dans le roster de ce pooler.' }

  const { error } = await supabase.from('pooler_rosters').insert({
    pooler_id: poolerId,
    player_id: playerId,
    pool_season_id: seasonId,
    player_type: 'recrue',
    rookie_type: rookieType,
    pool_draft_year: rookieType === 'repeche' ? (poolDraftYear ?? null) : null,
    is_active: true,
  })

  if (error) return { error: error.message }

  revalidatePath('/admin/config')
  revalidatePath(`/poolers`)
  revalidatePath('/admin/recrues')
  return {}
}

export async function removeRookieOverrideAction(
  entryId: number,
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { error } = await supabase
    .from('pooler_rosters')
    .update({ is_active: false })
    .eq('id', entryId)

  if (error) return { error: error.message }

  revalidatePath('/admin/config')
  revalidatePath('/poolers')
  revalidatePath('/admin/recrues')
  return {}
}

export async function updatePickOwnerAction(
  pickId: number,
  newOwnerId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { error } = await supabase
    .from('pool_draft_picks')
    .update({ current_owner_id: newOwnerId })
    .eq('id', pickId)

  if (error) return { error: error.message }

  revalidatePath('/admin/config')
  revalidatePath('/poolers')
  revalidatePath('/repechage')
  return {}
}

export async function updateScoringAction(
  updates: { id: number; points: number; points_playoffs: number | null }[],
): Promise<{ error?: string }> {
  if (updates.some(u => u.points < 0 || (u.points_playoffs !== null && u.points_playoffs < 0)))
    return { error: 'Les points ne peuvent pas être négatifs.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  for (const u of updates) {
    const { error } = await supabase
      .from('scoring_config')
      .update({ points: u.points, points_playoffs: u.points_playoffs })
      .eq('id', u.id)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/config')
  return {}
}

export async function updateCapAction(
  saisonId: number,
  nhlCap: number,
  capMultiplier: number,
  nextNhlCap?: number | null,
  opts?: {
    delaiReactivationJours?: number
    maxSignaturesAl?: number
    maxSignaturesLtir?: number
    dureeMinLtirJours?: number
    gestionEffectifsOuvert?: boolean
    isPlayoff?: boolean
    playoffSubmissionDeadline?: string | null
    playoffMaxChanges?: number
    playoffMaxElimChanges?: number
    playoffMaxF?: number
    playoffMaxD?: number
    playoffMaxG?: number
    indicatorStreakChaud?: number
    indicatorStreakForme?: number
    indicatorStreakFroid?: number
    indicatorStreakCrise?: number
    indicatorFenetreTendance?: number
    indicatorGoalieWinsStreak?: number
    indicatorGoalieSvPct?: number
    indicatorGoalieGaa?: number
    indicatorGoalieMinGames?: number
    draftRounds?: number
    saisonStartDate?: string | null
    saisonEndDate?: string | null
  },
): Promise<{ error?: string }> {
  if (!nhlCap || nhlCap < 1_000_000) return { error: 'Cap NHL invalide.' }
  if (!capMultiplier || capMultiplier <= 0) return { error: 'Facteur invalide.' }

  const supabase = await createClient()
  const updates: Record<string, unknown> = { nhl_cap: nhlCap, cap_multiplier: capMultiplier }
  if (nextNhlCap !== undefined) updates.next_nhl_cap = nextNhlCap ?? null
  if (opts?.delaiReactivationJours !== undefined) updates.delai_reactivation_jours = opts.delaiReactivationJours
  if (opts?.maxSignaturesAl !== undefined) updates.max_signatures_al = opts.maxSignaturesAl
  if (opts?.maxSignaturesLtir !== undefined) updates.max_signatures_ltir = opts.maxSignaturesLtir
  if (opts?.dureeMinLtirJours !== undefined) updates.duree_min_ltir_jours = opts.dureeMinLtirJours
  if (opts?.gestionEffectifsOuvert !== undefined) updates.gestion_effectifs_ouvert = opts.gestionEffectifsOuvert
  if (opts?.isPlayoff !== undefined) updates.is_playoff = opts.isPlayoff
  if (opts?.playoffSubmissionDeadline !== undefined) updates.playoff_submission_deadline = opts.playoffSubmissionDeadline ?? null
  if (opts?.playoffMaxChanges !== undefined) updates.playoff_max_changes = opts.playoffMaxChanges
  if (opts?.playoffMaxElimChanges !== undefined) updates.playoff_max_elim_changes = opts.playoffMaxElimChanges
  if (opts?.playoffMaxF !== undefined) updates.playoff_max_f = opts.playoffMaxF
  if (opts?.playoffMaxD !== undefined) updates.playoff_max_d = opts.playoffMaxD
  if (opts?.playoffMaxG !== undefined) updates.playoff_max_g = opts.playoffMaxG
  if (opts?.indicatorStreakChaud !== undefined) updates.indicator_streak_chaud = opts.indicatorStreakChaud
  if (opts?.indicatorStreakForme !== undefined) updates.indicator_streak_forme = opts.indicatorStreakForme
  if (opts?.indicatorStreakFroid !== undefined) updates.indicator_streak_froid = opts.indicatorStreakFroid
  if (opts?.indicatorStreakCrise !== undefined) updates.indicator_streak_crise = opts.indicatorStreakCrise
  if (opts?.indicatorFenetreTendance !== undefined) updates.indicator_fenetre_tendance = opts.indicatorFenetreTendance
  if (opts?.indicatorGoalieWinsStreak !== undefined) updates.indicator_goalie_wins_streak = opts.indicatorGoalieWinsStreak
  if (opts?.indicatorGoalieSvPct !== undefined) updates.indicator_goalie_sv_pct = opts.indicatorGoalieSvPct
  if (opts?.indicatorGoalieGaa !== undefined) updates.indicator_goalie_gaa = opts.indicatorGoalieGaa
  if (opts?.indicatorGoalieMinGames !== undefined) updates.indicator_goalie_min_games = opts.indicatorGoalieMinGames
  if (opts?.draftRounds !== undefined) updates.draft_rounds = opts.draftRounds
  if (opts?.saisonStartDate !== undefined) updates.saison_start_date = opts.saisonStartDate ?? null
  if (opts?.saisonEndDate !== undefined) updates.saison_end_date = opts.saisonEndDate ?? null

  const { error } = await supabase
    .from('pool_seasons')
    .update(updates)
    .eq('id', saisonId)

  if (error) return { error: error.message }

  revalidatePath('/admin/config')
  revalidatePath('/')
  revalidatePath('/poolers')
  return {}
}

export async function initPicksAction(
  saisonId: number,
  draftRounds: number,
): Promise<{ error?: string; created?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { data: poolers } = await supabase.from('poolers').select('id').order('id')
  if (!poolers || poolers.length === 0) return { error: 'Aucun pooler trouvé.' }

  const rows = poolers.flatMap(p =>
    Array.from({ length: draftRounds }, (_, i) => ({
      pool_season_id:    saisonId,
      original_owner_id: p.id,
      current_owner_id:  p.id,
      round:             i + 1,
      is_used:           false,
    }))
  )

  const { error, count } = await supabase
    .from('pool_draft_picks')
    .insert(rows, { count: 'exact' })

  if (error) return { error: error.message }
  revalidatePath('/admin/presaison')
  return { created: count ?? rows.length }
}
