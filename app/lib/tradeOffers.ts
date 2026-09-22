import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers, sendPushToAdmins } from '@/lib/push'
import { sendEmailToIds } from '@/lib/email'
import { checkFutureRosterConflict } from '@/lib/rosterTypeChange'
import { getEffectiveCap } from '@/lib/capUtils'
import { validateRosterLimits, type RosterLimitEntry } from '@/lib/rosterLimits'

// Transactions proposées entre poolers, avec approbation admin (David, 2026-09-21) — voir
// schema.sql (migration trade_offers/trade_offer_items) pour le détail du flux complet.
// Volontairement scopé à la saison démarrée (season_started=true) : les échanges pré-saison
// passent par le filet de sécurité admin existant (/admin/transactions, action_type='transfer'),
// pas encore couvert ici.
//
// Rien n'est jamais écrit dans pooler_rosters/pool_draft_picks avant que les DEUX poolers aient
// confirmé leur part — un délai manqué annule tout pour les deux (aucun rollback nécessaire,
// puisque rien n'a été touché). Comme pour le ballotage, la résolution automatique (expiration)
// tourne côté serveur avec le client admin, jamais via les Server Actions session-based de
// /admin/transactions (pensées pour un admin en train de naviguer) — voir le commentaire en
// tête de waiverClaims.ts pour la même distinction.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? ''
const TRADE_TAB_PATH = '/gestion-effectifs?tab=echanges'

function linkHtml(path: string): string {
  return `<p><a href="${SITE_URL}${path}">Voir sur Cap Crunch</a></p>`
}

async function poolerName(admin: ReturnType<typeof createAdminClient>, poolerId: string): Promise<string> {
  const { data } = await admin.from('poolers').select('name').eq('id', poolerId).single()
  return data?.name ?? 'un pooler'
}

export type TradeItemInput = {
  itemType: 'player' | 'pick'
  fromPoolerId: string
  playerId?: number
  pickId?: number
}

// ─── Création ───────────────────────────────────────────────────────────────

export async function createTradeOffer(
  saisonId: number, proposerPoolerId: string, targetPoolerId: string, items: TradeItemInput[],
): Promise<{ error?: string; id?: number }> {
  if (proposerPoolerId === targetPoolerId) return { error: 'Tu ne peux pas proposer un échange à toi-même.' }
  if (items.length === 0) return { error: 'Ajoute au moins un joueur ou un choix des deux côtés.' }

  const admin = createAdminClient()
  const { data: saison } = await admin.from('pool_seasons').select('season_started').eq('id', saisonId).single()
  if (!saison?.season_started) return { error: "La saison n'a pas encore démarré — les échanges pré-saison passent par l'admin." }

  const validPoolers = new Set([proposerPoolerId, targetPoolerId])
  for (const item of items) {
    if (!validPoolers.has(item.fromPoolerId)) return { error: 'Item invalide (pooler source hors échange).' }

    if (item.itemType === 'player') {
      if (!item.playerId) return { error: 'Joueur manquant sur un item.' }
      const { data: row } = await admin
        .from('pooler_rosters').select('player_type')
        .eq('pooler_id', item.fromPoolerId).eq('player_id', item.playerId).eq('pool_season_id', saisonId).eq('is_active', true)
        .maybeSingle()
      if (!row) return { error: `Un joueur proposé n'appartient plus à ${await poolerName(admin, item.fromPoolerId)}.` }
    } else {
      if (!item.pickId) return { error: 'Choix manquant sur un item.' }
      const { data: pick } = await admin
        .from('pool_draft_picks').select('current_owner_id, is_used')
        .eq('id', item.pickId).maybeSingle()
      if (!pick || pick.current_owner_id !== item.fromPoolerId || pick.is_used) {
        return { error: `Un choix proposé n'appartient plus à ${await poolerName(admin, item.fromPoolerId)} ou a déjà été utilisé.` }
      }
    }
  }

  const { data: tradeOffer, error } = await admin.from('trade_offers').insert({
    pool_season_id: saisonId, proposer_pooler_id: proposerPoolerId, target_pooler_id: targetPoolerId, status: 'pending_target',
  }).select('id').single()
  if (error) return { error: error.message }

  const itemRows = items.map(item => ({
    trade_offer_id: tradeOffer.id,
    from_pooler_id: item.fromPoolerId,
    to_pooler_id: item.fromPoolerId === proposerPoolerId ? targetPoolerId : proposerPoolerId,
    item_type: item.itemType,
    player_id: item.itemType === 'player' ? item.playerId : null,
    pick_id: item.itemType === 'pick' ? item.pickId : null,
  }))
  const { error: itemsError } = await admin.from('trade_offer_items').insert(itemRows)
  if (itemsError) {
    await admin.from('trade_offers').delete().eq('id', tradeOffer.id)
    return { error: itemsError.message }
  }

  const proposerLabel = await poolerName(admin, proposerPoolerId)
  after(() => Promise.all([
    sendPushToUsers([targetPoolerId], {
      title: 'Cap Crunch — Proposition de transaction',
      body: `${proposerLabel} te propose un échange.`,
      url: TRADE_TAB_PATH,
    }).catch(() => {}),
    sendEmailToIds([targetPoolerId], {
      subject: 'Cap Crunch — Proposition de transaction',
      html: `<p><strong>${proposerLabel}</strong> te propose un échange — consulte le détail et accepte ou refuse dans l'onglet Échanges de Gestion d'effectifs.</p>${linkHtml(TRADE_TAB_PATH)}`,
    }).catch(() => {}),
  ]))

  return { id: tradeOffer.id }
}

// ─── Réponse du pooler visé ───────────────────────────────────────────────────

export async function respondToTradeOffer(tradeOfferId: number, poolerId: string, accept: boolean): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { data: offer } = await admin.from('trade_offers').select('id, status, proposer_pooler_id, target_pooler_id').eq('id', tradeOfferId).single()
  if (!offer) return { error: 'Proposition introuvable.' }
  if (offer.target_pooler_id !== poolerId) return { error: "Cette proposition ne t'est pas destinée." }
  if (offer.status !== 'pending_target') return { error: 'Cette proposition a déjà été traitée.' }

  const now = new Date().toISOString()
  if (!accept) {
    await admin.from('trade_offers').update({ status: 'declined', decided_at: now, resolved_at: now }).eq('id', tradeOfferId)
    const targetLabel = await poolerName(admin, poolerId)
    after(() => Promise.all([
      sendPushToUsers([offer.proposer_pooler_id], { title: 'Cap Crunch — Transaction refusée', body: `${targetLabel} a refusé ta proposition d'échange.`, url: TRADE_TAB_PATH }).catch(() => {}),
      sendEmailToIds([offer.proposer_pooler_id], { subject: 'Cap Crunch — Transaction refusée', html: `<p><strong>${targetLabel}</strong> a refusé ta proposition d'échange.</p>${linkHtml(TRADE_TAB_PATH)}` }).catch(() => {}),
    ]))
    return {}
  }

  await admin.from('trade_offers').update({ status: 'pending_admin', decided_at: now }).eq('id', tradeOfferId)
  after(() => sendPushToAdmins({
    title: 'Cap Crunch — Transaction à approuver',
    body: 'Un échange entre poolers attend ton approbation.',
    url: '/admin/effectifs?tab=approbation',
  }).catch(() => {}))
  return {}
}

// ─── Décision admin ───────────────────────────────────────────────────────────

export async function adminDecideTradeOffer(tradeOfferId: number, approve: boolean): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { data: offer } = await admin.from('trade_offers').select('id, status, proposer_pooler_id, target_pooler_id, pool_season_id').eq('id', tradeOfferId).single()
  if (!offer) return { error: 'Proposition introuvable.' }
  if (offer.status !== 'pending_admin') return { error: "Cette proposition n'attend pas d'approbation." }

  const now = new Date().toISOString()
  if (!approve) {
    await admin.from('trade_offers').update({ status: 'rejected_admin', admin_decided_at: now, resolved_at: now }).eq('id', tradeOfferId)
    after(() => Promise.all([
      sendPushToUsers([offer.proposer_pooler_id, offer.target_pooler_id], { title: 'Cap Crunch — Transaction rejetée', body: "L'admin a rejeté cet échange.", url: TRADE_TAB_PATH }).catch(() => {}),
      sendEmailToIds([offer.proposer_pooler_id, offer.target_pooler_id], { subject: 'Cap Crunch — Transaction rejetée', html: `<p>L'admin a rejeté cet échange.</p>${linkHtml(TRADE_TAB_PATH)}` }).catch(() => {}),
    ]))
    return {}
  }

  const { data: settings } = await admin.from('app_settings').select('trade_completion_days').eq('id', 1).maybeSingle()
  const days = settings?.trade_completion_days ?? 3
  const deadline = new Date(Date.now() + days * 24 * 3_600_000).toISOString()

  await admin.from('trade_offers').update({ status: 'pending_completion', admin_decided_at: now, completion_deadline: deadline }).eq('id', tradeOfferId)

  const deadlineLabel = new Date(deadline).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto' })
  after(() => Promise.all([
    sendPushToUsers([offer.proposer_pooler_id, offer.target_pooler_id], {
      title: 'Cap Crunch — Transaction approuvée',
      body: `Approuvée par l'admin — confirme ta part avant le ${deadlineLabel}, sinon l'échange sera annulé pour les deux.`,
      url: TRADE_TAB_PATH,
    }).catch(() => {}),
    sendEmailToIds([offer.proposer_pooler_id, offer.target_pooler_id], {
      subject: 'Cap Crunch — Transaction approuvée',
      html: `<p>L'admin a approuvé cet échange.</p>
             <p>Confirme ta part dans l'onglet Échanges de Gestion d'effectifs avant le <strong>${deadlineLabel}</strong> — si l'un des deux ne confirme pas à temps, l'échange est annulé pour les deux (rien n'aura changé).</p>${linkHtml(TRADE_TAB_PATH)}`,
    }).catch(() => {}),
  ]))
  return {}
}

// ─── Confirmation de conformité + exécution ───────────────────────────────────

// Ajustements supplémentaires soumis par un pooler en même temps que sa confirmation (David,
// 2026-09-22) — Mouvements exige TOUJOURS exactement 12/6/2 à la soumission
// (validateRosterLimits), donc libérer un joueur "pour faire de la place" avant que l'échange
// ne s'exécute y serait refusé (11 attaquants, par exemple). Ces actions sont donc appliquées
// avec les items de l'échange dans le MÊME geste, validées comme un seul état final, jamais
// séparément — même principe que le panier de Mouvements.
export type TradeExtraAction = { playerId: number; action: 'release' | 'change_status'; newType?: 'actif' | 'reserviste' }

// Construit l'état viruel du roster ACTIF/RÉSERVISTE d'un pooler après application des items
// de cet échange qui le concernent (retire ce qu'il donne, ajoute ce qu'il reçoit avec le type
// choisi) et des ajustements supplémentaires qu'il a choisis — pour revalider 12/6/2 + cap avant
// de le laisser confirmer. Les recrues/choix ne comptent pas dans cette validation (comme
// partout ailleurs dans l'app).
async function simulatePostTradeRoster(
  admin: ReturnType<typeof createAdminClient>, poolerId: string, saisonId: number, season: string, unsignedMultiplier: number,
  items: { from_pooler_id: string; to_pooler_id: string; item_type: string; player_id: number | null }[],
  chosenTypes: Record<number, 'actif' | 'reserviste'>,
  extraActions: TradeExtraAction[],
): Promise<RosterLimitEntry[]> {
  const { data: currentRows } = await admin
    .from('pooler_rosters')
    .select('player_id, player_type, players (position, player_contracts (season, cap_number))')
    .eq('pooler_id', poolerId).eq('pool_season_id', saisonId).eq('is_active', true)

  const entries = new Map<number, RosterLimitEntry>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (currentRows ?? []) as any[]) {
    if (row.player_type !== 'actif' && row.player_type !== 'reserviste') continue
    entries.set(row.player_id, {
      player_type: row.player_type,
      position: row.players?.position ?? null,
      capNumber: getEffectiveCap(row.players?.player_contracts, season, unsignedMultiplier).cap,
    })
  }

  for (const extra of extraActions) {
    if (extra.action === 'release') entries.delete(extra.playerId)
    else if (extra.action === 'change_status' && extra.newType) {
      const existing = entries.get(extra.playerId)
      if (existing) entries.set(extra.playerId, { ...existing, player_type: extra.newType })
    }
  }

  const givenPlayerIds = items.filter(i => i.item_type === 'player' && i.from_pooler_id === poolerId).map(i => i.player_id!)
  for (const id of givenPlayerIds) entries.delete(id)

  const receivedPlayerIds = items.filter(i => i.item_type === 'player' && i.to_pooler_id === poolerId).map(i => i.player_id!)
  if (receivedPlayerIds.length > 0) {
    const { data: incoming } = await admin
      .from('players').select('id, position, player_contracts (season, cap_number)')
      .in('id', receivedPlayerIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (incoming ?? []) as any[]) {
      const chosen = chosenTypes[p.id]
      if (!chosen) continue // recrue reçue (pas de choix actif/réserviste) — ignorée ici, sans impact cap/composition
      entries.set(p.id, {
        player_type: chosen,
        position: p.position ?? null,
        capNumber: getEffectiveCap(p.player_contracts, season, unsignedMultiplier).cap,
      })
    }
  }

  return Array.from(entries.values())
}

export async function confirmTradeReady(
  tradeOfferId: number, poolerId: string, chosenTypes: Record<number, 'actif' | 'reserviste'>,
  extraActions: TradeExtraAction[] = [],
): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { data: offer } = await admin
    .from('trade_offers')
    .select('id, status, pool_season_id, proposer_pooler_id, target_pooler_id, proposer_ready_at, target_ready_at, completion_deadline')
    .eq('id', tradeOfferId).single()
  if (!offer) return { error: 'Échange introuvable.' }
  if (offer.status !== 'pending_completion') return { error: "Cet échange n'attend pas de confirmation." }
  if (offer.proposer_pooler_id !== poolerId && offer.target_pooler_id !== poolerId) return { error: "Cet échange ne te concerne pas." }
  if (new Date(offer.completion_deadline) <= new Date()) return { error: 'Le délai de confirmation est expiré.' }

  const { data: items } = await admin
    .from('trade_offer_items')
    .select('from_pooler_id, to_pooler_id, item_type, player_id')
    .eq('trade_offer_id', tradeOfferId)
  if (!items) return { error: 'Items introuvables.' }

  // Un ajustement supplémentaire ne peut pas viser un joueur déjà donné dans l'échange lui-même
  // (déjà géré par l'item) — évite un double traitement incohérent.
  const givenByThisPooler = new Set(items.filter(i => i.item_type === 'player' && i.from_pooler_id === poolerId).map(i => i.player_id))
  for (const extra of extraActions) {
    if (givenByThisPooler.has(extra.playerId)) return { error: 'Un ajustement supplémentaire ne peut pas viser un joueur déjà inclus dans l\'échange.' }
  }

  const { data: saison } = await admin.from('pool_seasons').select('season, pool_cap').eq('id', offer.pool_season_id).single()
  const { data: settingsRow } = await admin.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle()
  const unsignedMultiplier = settingsRow?.unsigned_player_cap_multiplier ?? 1.20

  const virtual = await simulatePostTradeRoster(admin, poolerId, offer.pool_season_id, saison?.season ?? '', unsignedMultiplier, items, chosenTypes, extraActions)
  const limitError = validateRosterLimits(virtual, saison?.pool_cap ?? 0)
  if (limitError) return { error: `Ton alignement ne serait pas conforme après cet échange : ${limitError}. Ajoute un ajustement supplémentaire (libération ou changement de statut) avant de confirmer.` }

  // Enregistre le type choisi pour chaque joueur reçu par CE pooler (pas de type pour une
  // recrue ou un choix, ignoré silencieusement).
  for (const [playerIdStr, type] of Object.entries(chosenTypes)) {
    const playerId = Number(playerIdStr)
    await admin.from('trade_offer_items')
      .update({ chosen_type: type })
      .eq('trade_offer_id', tradeOfferId).eq('to_pooler_id', poolerId).eq('player_id', playerId).eq('item_type', 'player')
  }

  const now = new Date().toISOString()
  const isProposer = offer.proposer_pooler_id === poolerId
  await admin.from('trade_offers').update(
    isProposer
      ? { proposer_ready_at: now, proposer_extra_actions: extraActions }
      : { target_ready_at: now, target_extra_actions: extraActions },
  ).eq('id', tradeOfferId)

  const bothReady = isProposer ? !!offer.target_ready_at : !!offer.proposer_ready_at
  if (bothReady) {
    const result = await executeTradeOffer(admin, tradeOfferId)
    if (result.error) return result
  } else {
    const otherPoolerId = isProposer ? offer.target_pooler_id : offer.proposer_pooler_id
    const readyLabel = await poolerName(admin, poolerId)
    after(() => sendPushToUsers([otherPoolerId], {
      title: 'Cap Crunch — Transaction',
      body: `${readyLabel} a confirmé sa part de l'échange — à ton tour.`,
      url: TRADE_TAB_PATH,
    }).catch(() => {}))
  }

  return {}
}

// Exécute l'échange au complet (joueurs, recrues, choix) une fois les deux poolers prêts —
// écriture directe (comme waiverClaims.ts, pas de réutilisation d'applyTransactionItems pour
// éviter un cycle avec admin/transactions/actions.ts) en dupliquant le strict minimum de la
// logique 'transfer' déjà en place là-bas, pour un résultat cohérent avec les échanges
// admin-initiés (même vocabulaire roster_change_log).
async function executeTradeOffer(admin: ReturnType<typeof createAdminClient>, tradeOfferId: number): Promise<{ error?: string }> {
  const { data: offer } = await admin
    .from('trade_offers')
    .select('id, pool_season_id, proposer_pooler_id, target_pooler_id, proposer_extra_actions, target_extra_actions')
    .eq('id', tradeOfferId).single()
  if (!offer) return { error: 'Échange introuvable.' }

  const { data: items } = await admin
    .from('trade_offer_items')
    .select('id, from_pooler_id, to_pooler_id, item_type, player_id, pick_id, chosen_type')
    .eq('trade_offer_id', tradeOfferId)
  if (!items) return { error: 'Items introuvables.' }

  const now = new Date().toISOString()
  const saisonId = offer.pool_season_id

  async function log(playerId: number, poolerId: string, oldType: string | null, newType: string | null) {
    await admin.from('roster_change_log').insert({
      player_id: playerId, pooler_id: poolerId, pool_season_id: saisonId,
      change_type: newType ? (oldType ? 'changement_type' : (newType === 'recrue' ? 'ajout_recrue' : newType === 'actif' ? 'activation' : 'ajout_reserviste')) : (oldType === 'actif' ? 'deactivation' : 'retrait'),
      old_type: oldType, new_type: newType, changed_by: null, changed_at: now, is_admin_override: true,
    })
  }

  // Un seul en-tête `transactions` pour tout l'échange, un `transaction_items` par item —
  // même patron que submitTransactionAction (admin/transactions/actions.ts), pour que
  // /journal-transactions affiche l'échange comme un tout plutôt que des lignes éparses.
  const { data: tx, error: txErr } = await admin.from('transactions')
    .insert({ pool_season_id: saisonId, notes: 'Échange entre poolers', created_by: null }).select('id').single()
  if (txErr) return { error: txErr.message }

  for (const item of items) {
    if (item.item_type === 'pick' && item.pick_id) {
      const { error } = await admin.from('pool_draft_picks').update({ current_owner_id: item.to_pooler_id }).eq('id', item.pick_id)
      if (error) return { error: error.message }
      await admin.from('transaction_items').insert({
        transaction_id: tx.id, action_type: 'transfer', from_pooler_id: item.from_pooler_id, to_pooler_id: item.to_pooler_id, pick_id: item.pick_id,
      })
      continue
    }

    if (item.item_type === 'player' && item.player_id) {
      const { data: srcRow } = await admin
        .from('pooler_rosters').select('id, player_type, rookie_type, pool_draft_year')
        .eq('pooler_id', item.from_pooler_id).eq('player_id', item.player_id).eq('pool_season_id', saisonId).eq('is_active', true)
        .maybeSingle()
      if (!srcRow) return { error: `Joueur (id: ${item.player_id}) introuvable chez le donneur — l'échange n'a pas pu être complété.` }

      const isRecrue = srcRow.player_type === 'recrue'
      const destType = isRecrue ? 'recrue' : (item.chosen_type ?? 'reserviste')

      const conflict = await checkFutureRosterConflict(admin, item.to_pooler_id, item.player_id, saisonId, now, destType)
      if (conflict.error) return conflict

      await admin.from('pooler_rosters').update({ is_active: false, removed_at: now }).eq('id', srcRow.id)
      await log(item.player_id, item.from_pooler_id, srcRow.player_type, null)

      const rookieFields = isRecrue ? { rookie_type: srcRow.rookie_type, pool_draft_year: srcRow.pool_draft_year } : { rookie_type: null, pool_draft_year: null }

      const { data: existingDest } = await admin.from('pooler_rosters').select('id')
        .eq('pooler_id', item.to_pooler_id).eq('player_id', item.player_id).eq('pool_season_id', saisonId).maybeSingle()
      if (existingDest) {
        const { error } = await admin.from('pooler_rosters')
          .update({ is_active: true, player_type: destType, removed_at: null, added_at: now, ...rookieFields }).eq('id', existingDest.id)
        if (error) return { error: error.message }
      } else {
        const { error } = await admin.from('pooler_rosters')
          .insert({ pooler_id: item.to_pooler_id, player_id: item.player_id, pool_season_id: saisonId, player_type: destType, is_active: true, added_at: now, ...rookieFields })
        if (error) return { error: error.message }
      }
      await log(item.player_id, item.to_pooler_id, null, destType)

      await admin.from('transaction_items').insert({
        transaction_id: tx.id, action_type: 'transfer', from_pooler_id: item.from_pooler_id, to_pooler_id: item.to_pooler_id,
        player_id: item.player_id, old_player_type: srcRow.player_type, new_player_type: destType,
      })
    }
  }

  // Ajustements supplémentaires choisis par chaque pooler à la confirmation (libération ou
  // changement de statut d'un joueur non impliqué dans l'échange lui-même, pour rester
  // conforme — David, 2026-09-22). Appliqués ici, dans le même geste que les items de
  // l'échange, jamais séparément (voir TradeExtraAction plus haut).
  const extraByPooler: [string, TradeExtraAction[]][] = [
    [offer.proposer_pooler_id, (offer.proposer_extra_actions as TradeExtraAction[] | null) ?? []],
    [offer.target_pooler_id, (offer.target_extra_actions as TradeExtraAction[] | null) ?? []],
  ]
  for (const [extraPoolerId, extraActions] of extraByPooler) {
    for (const extra of extraActions) {
      const { data: row } = await admin
        .from('pooler_rosters').select('id, player_type')
        .eq('pooler_id', extraPoolerId).eq('player_id', extra.playerId).eq('pool_season_id', saisonId).eq('is_active', true)
        .maybeSingle()
      if (!row) continue // déjà retiré/changé entre-temps — ignoré plutôt que d'échouer tout l'échange

      if (extra.action === 'release') {
        await admin.from('pooler_rosters').update({ is_active: false, removed_at: now }).eq('id', row.id)
        await log(extra.playerId, extraPoolerId, row.player_type, null)
        await admin.from('transaction_items').insert({
          transaction_id: tx.id, action_type: 'release', from_pooler_id: extraPoolerId, player_id: extra.playerId, old_player_type: row.player_type,
        })
      } else if (extra.action === 'change_status' && extra.newType && extra.newType !== row.player_type) {
        await admin.from('pooler_rosters').update({ player_type: extra.newType }).eq('id', row.id)
        await log(extra.playerId, extraPoolerId, row.player_type, extra.newType)
        await admin.from('transaction_items').insert({
          transaction_id: tx.id, action_type: 'type_change', from_pooler_id: extraPoolerId, player_id: extra.playerId,
          old_player_type: row.player_type, new_player_type: extra.newType,
        })
      }
    }
  }

  await admin.from('trade_offers').update({ status: 'completed', resolved_at: now }).eq('id', tradeOfferId)

  const { data: fullOffer } = await admin.from('trade_offers').select('proposer_pooler_id, target_pooler_id').eq('id', tradeOfferId).single()
  if (fullOffer) {
    after(() => Promise.all([
      sendPushToUsers([fullOffer.proposer_pooler_id, fullOffer.target_pooler_id], { title: 'Cap Crunch — Transaction complétée', body: "L'échange a été exécuté avec succès.", url: '/gestion-effectifs' }).catch(() => {}),
      sendEmailToIds([fullOffer.proposer_pooler_id, fullOffer.target_pooler_id], { subject: 'Cap Crunch — Transaction complétée', html: `<p>L'échange a été exécuté avec succès.</p>${linkHtml('/gestion-effectifs')}` }).catch(() => {}),
    ]))
  }

  return {}
}

// ─── Résolution des échanges expirés (paresseuse, comme le ballotage) ─────────

export async function resolveExpiredTradeOffers(saisonId: number): Promise<void> {
  const admin = createAdminClient()
  const { data: expired } = await admin
    .from('trade_offers')
    .select('id, proposer_pooler_id, target_pooler_id, proposer_ready_at, target_ready_at')
    .eq('pool_season_id', saisonId)
    .eq('status', 'pending_completion')
    .lte('completion_deadline', new Date().toISOString())
  if (!expired || expired.length === 0) return

  for (const offer of expired) {
    if (offer.proposer_ready_at && offer.target_ready_at) continue // exécuté entre-temps, ne devrait pas arriver mais évite une double annulation
    const now = new Date().toISOString()
    await admin.from('trade_offers').update({
      status: 'cancelled_expired', resolved_at: now,
      cancelled_reason: "Au moins un des deux poolers n'a pas confirmé sa part dans le délai — rien n'a été transféré.",
    }).eq('id', offer.id)

    after(() => Promise.all([
      sendPushToUsers([offer.proposer_pooler_id, offer.target_pooler_id], {
        title: 'Cap Crunch — Transaction annulée',
        body: "Le délai de confirmation est passé — l'échange est annulé, refaites une proposition au besoin.",
        url: TRADE_TAB_PATH,
      }).catch(() => {}),
      sendEmailToIds([offer.proposer_pooler_id, offer.target_pooler_id], {
        subject: 'Cap Crunch — Transaction annulée',
        html: `<p>Le délai de confirmation est passé sans que les deux poolers aient confirmé — l'échange est annulé, rien n'a changé de part et d'autre. Refaites une proposition si l'échange tient toujours.</p>${linkHtml(TRADE_TAB_PATH)}`,
      }).catch(() => {}),
    ]))
  }
}
