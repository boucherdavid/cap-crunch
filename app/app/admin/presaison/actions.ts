'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { computeReverseStandingsOrder } from '@/lib/draftOrder'
import { getEffectiveCap } from '@/lib/capUtils'
import { isRookieProtectionExpired, isElcActiveForSeason } from '@/lib/rookieProtection'
import { applyTransactionItems, type TxItemPayload } from '../transactions/actions'
import { DEFAULT_NHL_MINIMUM_SALARY } from './types'
import type { PoolerCapInfo, DraftState } from './types'

const TURN_DURATION_DEFAULT = 90

function eligibleQueueIds(poolers: PoolerCapInfo[], order: string[], threshold: number): string[] {
  return order.filter(id => {
    const p = poolers.find(pp => pp.id === id)
    return p !== undefined && p.capSpace >= threshold
  })
}

function getPlayerBucket(position: string | null): 'forward' | 'defense' | 'goalie' {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

// Recrue dont la protection (ELC, ou plafond 5 saisons pour un repêché) a expiré : la perte
// du statut recrue devient permanente et automatique, sans étape de décision séparée (David,
// 2026-09-07 — remplace le passage par la banque de recrues + activation manuelle du
// 2026-09-03, jugé trop de friction : le pooler gère son surplus de salaire lui-même, de A à
// Z, via le libre-service actif↔réserviste/libération déjà en place sur
// /repechage-agents-libres, plutôt que d'attendre une action de l'admin ou de cliquer
// "Activer"). Deux cas, selon où le joueur se trouve au moment de l'expiration :
// - déjà actif/réserviste : reste exactement où il est, seuls rookie_type/pool_draft_year
//   sont effacés (aucun changement de player_type, donc pas de transaction/roster_change_log
//   — simple retrait d'un tag de protection devenu caduc).
// - encore en banque (jamais promu) : promotion automatique en 'actif', via le même chemin
//   que le bouton "Activer" manuel (submitTransactionAction/applyTransactionItems,
//   action_type='promote') pour hériter gratuitement de toute sa logique (added_at,
//   checkFutureRosterConflict, effacement des champs recrue) — avec le client admin, puisque
//   cette fonction tourne aussi depuis /repechage-agents-libres (page pooler, pas admin) où le
//   client de la requête n'a pas accès en écriture à transactions/transaction_items (RLS
//   admin-only, voir repechage-agents-libres/actions.ts).
// Appelée en tout début de loadPresaisonDataAction, à chaque chargement — pas seulement à la
// transition annuelle — pour capter les cas qui y échapperaient (ex: un agent libre recrue
// dont l'ELC se termine alors qu'il était déjà actif depuis une saison antérieure).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncExpiredRookieProtection(supabase: any, saisonId: number, season: string, seasonStartYear: number) {
  const { data: rows } = await supabase
    .from('pooler_rosters')
    .select('id, player_type, pooler_id, player_id, rookie_type, pool_draft_year, players(player_contracts(season, is_elc))')
    .eq('pool_season_id', saisonId)
    .eq('is_active', true)
    .in('player_type', ['actif', 'reserviste', 'recrue'])
    .not('rookie_type', 'is', null)

  const promoteItems: TxItemPayload[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (rows ?? []) as any[]) {
    const contracts: any[] = row.players?.player_contracts ?? []
    const expired = isRookieProtectionExpired(row.rookie_type, row.pool_draft_year ?? null, isElcActiveForSeason(contracts, season), seasonStartYear)
    if (!expired) continue

    if (row.player_type === 'recrue') {
      promoteItems.push({
        action_type: 'promote',
        from_pooler_id: row.pooler_id,
        to_pooler_id: row.pooler_id,
        player_id: row.player_id,
        old_player_type: 'recrue',
        new_player_type: 'actif',
      })
    } else {
      await supabase.from('pooler_rosters').update({ rookie_type: null, pool_draft_year: null }).eq('id', row.id)
    }
  }

  if (promoteItems.length > 0) {
    const result = await applyTransactionItems(createAdminClient(), null, saisonId, 'Ajustement pré-saison', promoteItems)
    // Ne bloque jamais le chargement de la page si l'activation auto échoue (ex: conflit de
    // roster) — l'admin garde le bouton "Activer" manuel de la banque de recrues en filet de
    // sécurité (BanqueRecruesManager.tsx). On journalise pour pouvoir diagnostiquer.
    if (result.error) console.error('syncExpiredRookieProtection: échec activation auto —', result.error)
  }
}

export async function loadPresaisonDataAction(saisonId: number): Promise<{
  error?: string
  poolers?: PoolerCapInfo[]
  draftOrder?: string[]
  poolCap?: number
  season?: string
  nhlMinimumSalary?: number
}> {
  const supabase = await createClient()

  const { data: saisonRow } = await supabase.from('pool_seasons').select('season').eq('id', saisonId).single()
  if (!saisonRow) return { error: 'Saison introuvable.' }
  const seasonStartYear = parseInt(saisonRow.season.split('-')[0], 10)

  await syncExpiredRookieProtection(supabase, saisonId, saisonRow.season, seasonStartYear)

  const [{ data: saison }, { data: poolers }, { data: rosters }, { data: settings }] = await Promise.all([
    supabase
      .from('pool_seasons')
      .select('season, pool_cap, presaison_draft_order')
      .eq('id', saisonId)
      .single(),
    supabase.from('poolers').select('id, name').order('name'),
    supabase
      .from('pooler_rosters')
      .select(`id, pooler_id, player_id, player_type, rookie_type, pool_draft_year,
        players (first_name, last_name, position,
          player_contracts (season, cap_number, is_elc))`)
      .eq('pool_season_id', saisonId)
      .eq('is_active', true),
    supabase.from('app_settings').select('unsigned_player_cap_multiplier, nhl_minimum_salary').eq('id', 1).maybeSingle(),
  ])

  if (!saison) return { error: 'Saison introuvable.' }
  const unsignedMultiplier = settings?.unsigned_player_cap_multiplier ?? 1.20
  const nhlMinimumSalary = settings?.nhl_minimum_salary ?? DEFAULT_NHL_MINIMUM_SALARY

  const poolerMap = new Map<string, PoolerCapInfo>()
  for (const p of (poolers ?? [])) {
    poolerMap.set(p.id, {
      id: p.id,
      name: p.name,
      capUsed: 0,
      capSpace: saison.pool_cap,
      isCompliant: false,
      counts: { forward: 0, defense: 0, goalie: 0, reserviste: 0 },
      roster: [],
      isOverLimits: false,
      slotsManquants: 0,
      capNeededForReady: 0,
      isReadyForDraft: true,
    })
  }

  for (const entry of (rosters ?? []) as any[]) {
    const info = poolerMap.get(entry.pooler_id)
    if (!info) continue

    const contracts: any[] = entry.players?.player_contracts ?? []
    const { cap: capNum, isEstimated: capIsEstimated } = getEffectiveCap(contracts, saison.season, unsignedMultiplier)
    const pos: string | null = entry.players?.position ?? null
    let type: string = entry.player_type

    // Recrue encore en banque → syncExpiredRookieProtection() ci-dessus vient de promouvoir
    // automatiquement toute recrue à protection expirée ; une ligne 'recrue' encore présente
    // ici est donc toujours protégée, hors du repêchage pré-saison.
    if (type === 'recrue') continue

    info.roster.push({
      roster_id: entry.id,
      player_id: entry.player_id,
      player_type: type,
      playerName: `${entry.players?.last_name}, ${entry.players?.first_name}`,
      position: pos,
      cap_number: capNum,
      isEstimatedCap: capIsEstimated,
    })

    if (type === 'actif' || type === 'reserviste') info.capUsed += capNum
    if (type === 'actif') info.counts[getPlayerBucket(pos)]++
    if (type === 'reserviste') info.counts.reserviste++
  }

  for (const info of poolerMap.values()) {
    info.capSpace = saison.pool_cap - info.capUsed
    info.isCompliant =
      info.counts.forward <= 12 &&
      info.counts.defense <= 6 &&
      info.counts.goalie <= 2 &&
      info.counts.reserviste >= 2 &&
      info.capSpace >= 0

    // Uniquement le dépassement de plafond salarial — un surplus de joueurs actifs à une
    // position (ex: 15/12 attaquants) n'est PAS en soi un problème "à libérer" : un réserviste
    // compte encore dans capUsed, donc reclasser suffit (voir demoteSurplusToReserveAction) et
    // ne coûte rien. Seul le vrai dépassement de cap force une vraie libération.
    // David, 2026-09-06 — remplace l'ancienne version qui incluait aussi les compteurs de
    // position, ce qui donnait un message trompeur ("3 attaquants de trop").
    info.isOverLimits = info.capSpace < 0

    // Indicateur de préparation : postes manquants pour atteindre 12A/6D/2G actifs + 2
    // réservistes min, au salaire minimum LNH chacun — informationnel, pas un blocage.
    const missingForward = Math.max(0, 12 - info.counts.forward)
    const missingDefense = Math.max(0, 6 - info.counts.defense)
    const missingGoalie = Math.max(0, 2 - info.counts.goalie)
    const missingReserviste = Math.max(0, 2 - info.counts.reserviste)
    info.slotsManquants = missingForward + missingDefense + missingGoalie + missingReserviste
    info.capNeededForReady = info.slotsManquants * nhlMinimumSalary
    info.isReadyForDraft = !info.isOverLimits && info.capSpace >= info.capNeededForReady
  }

  const draftOrder = (saison.presaison_draft_order as string[] | null) ?? []

  return {
    poolers: Array.from(poolerMap.values()),
    draftOrder,
    poolCap: saison.pool_cap,
    season: saison.season,
    nhlMinimumSalary,
  }
}

export async function resetLtirToActifAction(
  saisonId: number,
): Promise<{ error?: string; updated?: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { data, error } = await supabase
    .from('pooler_rosters')
    .update({ player_type: 'actif' })
    .eq('pool_season_id', saisonId)
    .eq('player_type', 'ltir')
    .eq('is_active', true)
    .select('id')
  if (error) return { error: error.message }

  revalidatePath('/admin/presaison')
  return { updated: (data ?? []).length }
}

// Reclasse en réserviste le surplus de joueurs actifs à une position (au-delà de 12A/6D/2G),
// tous poolers confondus en un seul geste — David, 2026-09-06 : "3 attaquants de trop" ne veut
// pas dire libérer, juste reclasser (un réserviste compte encore dans capUsed, donc ça ne
// touche pas au cap). Un seul bouton global (comme "Remettre tous les LTIR à Actif") plutôt
// qu'une action par pooler, pour ne pas réintroduire la redondance retirée de ComplianceCard.
// Les moins chers d'abord (garde les meilleurs actifs par défaut) — le pooler ajustera de
// toute façon lui-même ensuite en libre-service.
export async function demoteSurplusToReserveAction(
  saisonId: number,
): Promise<{ error?: string; updated?: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { data: saison } = await supabase.from('pool_seasons').select('season').eq('id', saisonId).single()
  if (!saison) return { error: 'Saison introuvable.' }
  const { data: settings } = await supabase.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle()
  const unsignedMultiplier = settings?.unsigned_player_cap_multiplier ?? 1.20

  // Requête directe sur le vrai player_type en base — PAS loadPresaisonDataAction(), dont le
  // roster relabellise en 'actif' (affichage seulement, jamais persisté) les recrues à
  // protection expirée. Un premier essai réutilisait ce roster relabellisé : une recrue comme
  // celle-ci se faisait passer en 'reserviste', puis syncExpiredRookieProtection() (au tout
  // début du prochain loadPresaisonDataAction) la repassait aussitôt en 'recrue' — gaspillant
  // une place de démotion sans jamais réduire le vrai surplus (bug trouvé par David,
  // 2026-09-06 : Räty, une recrue, avait été "démis" au lieu d'un vrai actif moins cher).
  const { data: rows } = await supabase
    .from('pooler_rosters')
    .select('id, pooler_id, players (position, player_contracts (season, cap_number))')
    .eq('pool_season_id', saisonId)
    .eq('is_active', true)
    .eq('player_type', 'actif')

  const MAX_BY_BUCKET = { forward: 12, defense: 6, goalie: 2 } as const
  const byPoolerBucket = new Map<string, { roster_id: number; cap: number }[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (rows ?? []) as any[]) {
    const bucket = getPlayerBucket(row.players?.position ?? null)
    const cap = getEffectiveCap(row.players?.player_contracts, saison.season, unsignedMultiplier).cap
    const key = `${row.pooler_id}:${bucket}`
    if (!byPoolerBucket.has(key)) byPoolerBucket.set(key, [])
    byPoolerBucket.get(key)!.push({ roster_id: row.id, cap })
  }

  const idsToDemote: number[] = []
  for (const [key, entries] of byPoolerBucket) {
    const bucket = key.split(':')[1] as keyof typeof MAX_BY_BUCKET
    const surplus = entries.length - MAX_BY_BUCKET[bucket]
    if (surplus > 0) {
      const cheapestFirst = [...entries].sort((a, b) => a.cap - b.cap)
      idsToDemote.push(...cheapestFirst.slice(0, surplus).map(e => e.roster_id))
    }
  }
  if (idsToDemote.length === 0) return { updated: 0 }

  const { error } = await supabase
    .from('pooler_rosters')
    .update({ player_type: 'reserviste' })
    .in('id', idsToDemote)
  if (error) return { error: error.message }

  revalidatePath('/admin/presaison')
  revalidatePath('/repechage-agents-libres')
  return { updated: idsToDemote.length }
}

export async function resetPresaisonDraftAction(
  saisonId: number,
): Promise<{ error?: string; reversed?: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  // 1. Find all pre-season draft transactions for this season
  const { data: txs, error: txErr } = await supabase
    .from('transactions')
    .select('id')
    .eq('pool_season_id', saisonId)
    .eq('notes', 'Repêchage pré-saison')
  if (txErr) return { error: txErr.message }
  if (!txs || txs.length === 0) return { reversed: 0 }

  const txIds = txs.map(t => t.id)

  // 2. Get the sign items to know which players to deactivate
  const { data: items, error: itemErr } = await supabase
    .from('transaction_items')
    .select('player_id, to_pooler_id')
    .in('transaction_id', txIds)
    .eq('action', 'sign')
  if (itemErr) return { error: itemErr.message }

  // 3. Deactivate those pooler_roster entries
  if (items && items.length > 0) {
    const playerIds = items.map((i: any) => i.player_id)
    const { error: rosterErr } = await supabase
      .from('pooler_rosters')
      .update({ is_active: false, removed_at: new Date().toISOString() })
      .eq('pool_season_id', saisonId)
      .in('player_id', playerIds)
      .eq('is_active', true)
    if (rosterErr) return { error: rosterErr.message }
  }

  // 4. Delete transaction_items then transactions
  const { error: delItemErr } = await supabase
    .from('transaction_items')
    .delete()
    .in('transaction_id', txIds)
  if (delItemErr) return { error: delItemErr.message }

  const { error: delTxErr } = await supabase
    .from('transactions')
    .delete()
    .in('id', txIds)
  if (delTxErr) return { error: delTxErr.message }

  // Remet aussi la file d'attente partagée à plat — un reset de test doit permettre de
  // relancer "Démarrer le repêchage" proprement, pas juste vider les transactions.
  await supabase.from('presaison_draft_state').upsert({
    pool_season_id: saisonId,
    is_active: false,
    queue: [],
    turn_started_at: null,
    turn_duration_seconds: TURN_DURATION_DEFAULT,
    ended_at: null,
    updated_at: new Date().toISOString(),
  })

  revalidatePath('/admin/presaison')
  revalidatePath('/repechage-agents-libres')
  return { reversed: txIds.length }
}

export async function saveDraftOrderAction(
  saisonId: number,
  poolerIds: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { error } = await supabase
    .from('pool_seasons')
    .update({ presaison_draft_order: poolerIds })
    .eq('id', saisonId)
  if (error) return { error: error.message }

  revalidatePath('/admin/presaison')
  return {}
}

// Initialise l'ordre du repêchage (agents libres ET recrues) à partir de
// l'ordre inverse du classement final de la saison régulière précédente.
export async function initDraftOrderFromStandingsAction(
  saisonId: number,
): Promise<{ error?: string; order?: string[]; previousSeason?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { poolerIds, previousSeason, error: orderErr } = await computeReverseStandingsOrder(supabase, saisonId)
  if (orderErr || !poolerIds) return { error: orderErr ?? 'Impossible de calculer l\'ordre.' }

  const { error: presaisonErr } = await supabase
    .from('pool_seasons')
    .update({ presaison_draft_order: poolerIds })
    .eq('id', saisonId)
  if (presaisonErr) return { error: presaisonErr.message }

  for (let i = 0; i < poolerIds.length; i++) {
    const { error } = await supabase
      .from('pool_draft_picks')
      .update({ draft_order: i + 1 })
      .eq('pool_season_id', saisonId)
      .eq('original_owner_id', poolerIds[i])
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/presaison')
  revalidatePath('/admin/repechage')
  return { order: poolerIds, previousSeason }
}

// ── File d'attente partagée du repêchage des agents libres ─────────────────
// Remplace l'ancien état 100% local (queue/draftActive/draftDone dans
// PresaisonManager.tsx) — persisté pour survivre à une navigation hors de la page et pour
// être visible côté pooler (/repechage-agents-libres).

export async function loadPresaisonDraftStateAction(saisonId: number): Promise<{ error?: string; state?: DraftState }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('presaison_draft_state')
    .select('pool_season_id, is_active, queue, turn_started_at, turn_duration_seconds, ended_at')
    .eq('pool_season_id', saisonId)
    .maybeSingle()
  if (error) return { error: error.message }

  if (!data) {
    return {
      state: {
        pool_season_id: saisonId,
        is_active: false,
        queue: [],
        turn_started_at: null,
        turn_duration_seconds: TURN_DURATION_DEFAULT,
        ended_at: null,
      },
    }
  }
  return { state: data as DraftState }
}

export async function startPresaisonDraftAction(saisonId: number): Promise<{ error?: string; state?: DraftState }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const fresh = await loadPresaisonDataAction(saisonId)
  if (fresh.error || !fresh.poolers) return { error: fresh.error ?? 'Impossible de charger les données.' }
  const queue = eligibleQueueIds(fresh.poolers, fresh.draftOrder ?? [], fresh.nhlMinimumSalary ?? DEFAULT_NHL_MINIMUM_SALARY)

  const nowIso = new Date().toISOString()
  const isActive = queue.length > 0
  const { error } = await supabase.from('presaison_draft_state').upsert({
    pool_season_id: saisonId,
    is_active: isActive,
    queue,
    turn_started_at: isActive ? nowIso : null,
    turn_duration_seconds: TURN_DURATION_DEFAULT,
    ended_at: isActive ? null : nowIso,
    updated_at: nowIso,
  })
  if (error) return { error: error.message }

  if (isActive) {
    const { sendPushToUser } = await import('@/lib/push')
    sendPushToUser(queue[0], {
      title: 'Repêchage agents libres',
      body: "C'est ton tour de signer un agent libre.",
      url: '/repechage-agents-libres',
    }).catch(() => {})
  }

  revalidatePath('/repechage-agents-libres')
  return loadPresaisonDraftStateAction(saisonId)
}

// Appelée après une signature réussie ("Signer") ou pour "Passer" (aucune transaction dans
// ce second cas) — fait tourner queue[0] en fin de file puis refiltre par cap frais, exactement
// comme l'ancien advanceQueue() local, mais persisté.
export async function advancePresaisonQueueAction(saisonId: number): Promise<{ error?: string; state?: DraftState }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { data: current } = await supabase
    .from('presaison_draft_state')
    .select('queue')
    .eq('pool_season_id', saisonId)
    .maybeSingle()
  const prevQueue = (current?.queue as string[] | undefined) ?? []
  if (prevQueue.length === 0) return loadPresaisonDraftStateAction(saisonId)

  const fresh = await loadPresaisonDataAction(saisonId)
  if (fresh.error || !fresh.poolers) return { error: fresh.error ?? 'Impossible de charger les données.' }

  const threshold = fresh.nhlMinimumSalary ?? DEFAULT_NHL_MINIMUM_SALARY
  const rotated = [...prevQueue.slice(1), prevQueue[0]]
  const nextQueue = rotated.filter(id => {
    const p = fresh.poolers!.find(pp => pp.id === id)
    return p !== undefined && p.capSpace >= threshold
  })

  const nowIso = new Date().toISOString()
  const isActive = nextQueue.length > 0
  const { error } = await supabase
    .from('presaison_draft_state')
    .update({
      is_active: isActive,
      queue: nextQueue,
      turn_started_at: isActive ? nowIso : null,
      turn_duration_seconds: TURN_DURATION_DEFAULT,
      ended_at: isActive ? null : nowIso,
      updated_at: nowIso,
    })
    .eq('pool_season_id', saisonId)
  if (error) return { error: error.message }

  if (isActive && nextQueue[0] !== prevQueue[0]) {
    const { sendPushToUser } = await import('@/lib/push')
    sendPushToUser(nextQueue[0], {
      title: 'Repêchage agents libres',
      body: "C'est ton tour de signer un agent libre.",
      url: '/repechage-agents-libres',
    }).catch(() => {})
  }

  revalidatePath('/repechage-agents-libres')
  return loadPresaisonDraftStateAction(saisonId)
}

export async function endPresaisonDraftAction(saisonId: number): Promise<{ error?: string; state?: DraftState }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const nowIso = new Date().toISOString()
  const { error } = await supabase.from('presaison_draft_state').upsert({
    pool_season_id: saisonId,
    is_active: false,
    queue: [],
    turn_started_at: null,
    turn_duration_seconds: TURN_DURATION_DEFAULT,
    ended_at: nowIso,
    updated_at: nowIso,
  })
  if (error) return { error: error.message }

  revalidatePath('/repechage-agents-libres')
  return loadPresaisonDraftStateAction(saisonId)
}

// "+30s" côté admin — n'affecte que le tour en cours, pas un réglage permanent.
export async function adjustPresaisonTimerAction(saisonId: number, deltaSeconds: number): Promise<{ error?: string; state?: DraftState }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const { data: current } = await supabase
    .from('presaison_draft_state')
    .select('turn_duration_seconds')
    .eq('pool_season_id', saisonId)
    .maybeSingle()
  const nextDuration = Math.max(0, (current?.turn_duration_seconds ?? TURN_DURATION_DEFAULT) + deltaSeconds)

  const { error } = await supabase
    .from('presaison_draft_state')
    .update({ turn_duration_seconds: nextDuration, updated_at: new Date().toISOString() })
    .eq('pool_season_id', saisonId)
  if (error) return { error: error.message }

  revalidatePath('/repechage-agents-libres')
  return loadPresaisonDraftStateAction(saisonId)
}

// Relance le chrono du tour en cours sans changer de tour (distinct de "Passer").
export async function resetPresaisonTimerAction(saisonId: number): Promise<{ error?: string; state?: DraftState }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('presaison_draft_state')
    .update({ turn_started_at: nowIso, turn_duration_seconds: TURN_DURATION_DEFAULT, updated_at: nowIso })
    .eq('pool_season_id', saisonId)
  if (error) return { error: error.message }

  revalidatePath('/repechage-agents-libres')
  return loadPresaisonDraftStateAction(saisonId)
}
