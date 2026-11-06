'use server'

/**
 * Corrections de mouvements déjà faits par les poolers (David, 2026-11-05) — onglet « Corrections »
 * de /admin/effectifs. Un lot = une transaction « Gestion d'effectifs » ou « Ballotage » du journal
 * (écrite par submitBatchAction, ou reconstituée par backfill_journal_gestion.py), avec ses lignes
 * roster_change_log de même date effective. Les échanges entre poolers ne sont pas couverts.
 *
 * Trois corrections, toujours répercutées sur pooler_rosters (jamais seulement le journal —
 * buildStandings() compte les points sur added_at/removed_at et sur roster_change_log) :
 *   - changer la date effective du lot ;
 *   - changer le statut de destination d'un mouvement (ex. réserviste au lieu de banque) ;
 *   - annuler le lot : chaque joueur revient à son état d'avant, lignes du journal retirées.
 * Garde-fou commun : refusé dès qu'un joueur du lot a bougé depuis chez ce pooler (sinon on
 * écraserait un état plus récent), ou est passé chez un autre pooler.
 */

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/push'
import { CHANGE_LABEL } from '@/lib/rosterChangeLabels'
import { journalActionType, JOURNAL_NOTES_BALLOTAGE, JOURNAL_NOTES_GESTION } from '@/lib/transactionJournal'
import { isRookieProtected, type RookieTag } from '@/lib/rookieProtection'
import { getEffectiveCap } from '@/lib/capUtils'
import { validateRosterLimits } from '@/lib/rosterLimits'

type Db = ReturnType<typeof createAdminClient>

export type CorrectionStatus = 'actif' | 'reserviste' | 'recrue' | 'ltir'

export type CorrectionMove = {
  logId: number
  playerId: number
  playerName: string
  position: string | null
  changeType: string
  changeLabel: string
  oldType: string | null
  newType: string | null
  /** Ce mouvement est le dernier du joueur chez ce pooler (sinon : rien n'est modifiable). */
  isLatest: boolean
  /** Statuts possibles pour « changer le statut » (vide si impossible). */
  statusOptions: CorrectionStatus[]
}

export type CorrectionLot = {
  transactionId: number
  notes: string
  effectiveAt: string   // changed_at commun du lot
  loggedAt: string      // moment réel de la saisie (created_at du journal des statuts)
  moves: CorrectionMove[]
  /** Raison pour laquelle le lot ne peut pas être annulé ou redaté, sinon null. */
  blockedReason: string | null
}

const TYPE_LABEL: Record<string, string> = { actif: 'actif', reserviste: 'réserviste', recrue: 'banque', ltir: 'LTIR' }

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }
  return { userId: user.id }
}

type LogRow = {
  id: number; player_id: number; change_type: string; old_type: string | null; new_type: string | null
  changed_at: string; created_at: string
}

async function loadPoolerLog(db: Db, poolerId: string, saisonId: number): Promise<LogRow[]> {
  const { data } = await db
    .from('roster_change_log')
    .select('id, player_id, change_type, old_type, new_type, changed_at, created_at')
    .eq('pooler_id', poolerId)
    .eq('pool_season_id', saisonId)
    .not('player_id', 'is', null)
    .order('changed_at')
    .order('id')
    .range(0, 4999)
  return (data ?? []) as LogRow[]
}

/** Dernier événement de chaque joueur chez ce pooler (date effective, puis ordre de saisie). */
function latestByPlayer(rows: LogRow[]): Map<number, LogRow> {
  const latest = new Map<number, LogRow>()
  for (const r of rows) latest.set(r.player_id, r)  // rows triées par changed_at puis id
  return latest
}

function statusOptionsFor(row: LogRow, isLatest: boolean, recrueEligible: boolean): CorrectionStatus[] {
  if (!isLatest || row.new_type === null) return []  // départ (libération) : rien à choisir
  const all: CorrectionStatus[] = ['actif', 'reserviste', 'recrue', 'ltir']
  return all.filter(s =>
    s !== row.new_type
    && s !== row.old_type  // revenir à l'ancien statut = annuler, pas corriger
    && (s !== 'recrue' || recrueEligible)
    // Une arrivée (signature, ballotage) ne commence ni en banque ni sur LTIR par ce chemin.
    && (row.old_type !== null || s === 'actif' || s === 'reserviste'))
}

export async function getCorrectionLotsAction(poolerId: string, saisonId: number): Promise<{ lots?: CorrectionLot[]; error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()

  const [{ data: items }, log, { data: saison }] = await Promise.all([
    db.from('transaction_items')
      .select('transaction_id, transactions!inner (id, notes, created_at, pool_season_id)')
      .or(`from_pooler_id.eq.${poolerId},to_pooler_id.eq.${poolerId}`)
      .eq('transactions.pool_season_id', saisonId)
      .in('transactions.notes', [JOURNAL_NOTES_GESTION, JOURNAL_NOTES_BALLOTAGE])
      .range(0, 4999),
    loadPoolerLog(db, poolerId, saisonId),
    db.from('pool_seasons').select('season').eq('id', saisonId).single(),
  ])
  const txById = new Map<number, { id: number; notes: string; created_at: string }>()
  for (const it of (items ?? []) as unknown as { transactions: { id: number; notes: string; created_at: string } }[]) {
    txById.set(it.transactions.id, it.transactions)
  }
  const latest = latestByPlayer(log)

  const playerIds = [...new Set(log.map(r => r.player_id))]
  const players = new Map<number, { name: string; position: string | null }>()
  const recrueOk = new Map<number, boolean>()
  if (playerIds.length > 0) {
    const [{ data: pl }, { data: rosters }] = await Promise.all([
      db.from('players').select('id, first_name, last_name, position, player_contracts (season, is_elc)').in('id', playerIds),
      db.from('pooler_rosters').select('player_id, rookie_type, pool_draft_year')
        .eq('pooler_id', poolerId).eq('pool_season_id', saisonId).in('player_id', playerIds),
    ])
    const rosterBy = new Map((rosters ?? []).map(r => [r.player_id as number, r]))
    for (const p of (pl ?? []) as unknown as { id: number; first_name: string; last_name: string; position: string | null; player_contracts: { season: string; is_elc: boolean | null }[] }[]) {
      players.set(p.id, { name: `${p.last_name}, ${p.first_name}`, position: p.position })
      const r = rosterBy.get(p.id)
      recrueOk.set(p.id, !!saison && isRookieProtected((r?.rookie_type ?? null) as RookieTag, (r?.pool_draft_year as number | null) ?? null, p.player_contracts, saison.season))
    }
  }

  const lots: CorrectionLot[] = []
  for (const tx of txById.values()) {
    const rows = log.filter(r => r.changed_at === tx.created_at || Date.parse(r.changed_at) === Date.parse(tx.created_at))
    if (rows.length === 0) continue
    const moves = rows.map(r => {
      const isLatest = latest.get(r.player_id)?.id === r.id
      return {
        logId: r.id,
        playerId: r.player_id,
        playerName: players.get(r.player_id)?.name ?? `Joueur ${r.player_id}`,
        position: players.get(r.player_id)?.position ?? null,
        changeType: r.change_type,
        changeLabel: CHANGE_LABEL[r.change_type] ?? r.change_type,
        oldType: r.old_type,
        newType: r.new_type,
        isLatest,
        statusOptions: statusOptionsFor(r, isLatest, recrueOk.get(r.player_id) ?? false),
      }
    })
    const moved = moves.filter(m => !m.isLatest).map(m => m.playerName)
    lots.push({
      transactionId: tx.id,
      notes: tx.notes,
      effectiveAt: rows[0].changed_at,
      loggedAt: rows.reduce((min, r) => (r.created_at < min ? r.created_at : min), rows[0].created_at),
      moves,
      blockedReason: moved.length > 0
        ? `${moved.join(', ')} ${moved.length > 1 ? 'ont' : 'a'} bougé depuis : annule ou corrige d'abord les mouvements plus récents.`
        : null,
    })
  }
  lots.sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt) || b.transactionId - a.transactionId)
  return { lots }
}

// ── Chargement d'un lot et contrôles communs ─────────────────────────────────────────────────

type LoadedLot = {
  db: Db
  tx: { id: number; notes: string; created_at: string; pool_season_id: number }
  rows: LogRow[]
  poolerId: string
  log: LogRow[]
}

async function loadLot(transactionId: number, poolerId: string): Promise<LoadedLot | { error: string }> {
  const db = createAdminClient()
  const { data: tx } = await db.from('transactions').select('id, notes, created_at, pool_season_id').eq('id', transactionId).maybeSingle()
  if (!tx) return { error: 'Lot introuvable.' }
  if (tx.notes !== JOURNAL_NOTES_GESTION && tx.notes !== JOURNAL_NOTES_BALLOTAGE) {
    return { error: 'Seuls les lots de Gestion d\'effectifs et du ballotage se corrigent ici.' }
  }
  const log = await loadPoolerLog(db, poolerId, tx.pool_season_id as number)
  const rows = log.filter(r => Date.parse(r.changed_at) === Date.parse(tx.created_at as string))
  if (rows.length === 0) return { error: 'Aucun mouvement de ce pooler ne correspond à ce lot.' }
  return { db, tx: tx as LoadedLot['tx'], rows, poolerId, log }
}

function notLatestError(lot: LoadedLot): string | null {
  const latest = latestByPlayer(lot.log)
  const moved = lot.rows.filter(r => latest.get(r.player_id)?.id !== r.id)
  return moved.length > 0
    ? 'Un joueur de ce lot a bougé depuis chez ce pooler : corrige d\'abord les mouvements plus récents.'
    : null
}

function revalidateAll() {
  for (const p of ['/admin/effectifs', '/classement', '/poolers', '/journal-transactions', '/gestion-effectifs', '/dashboard']) revalidatePath(p)
  revalidatePath('/poolers/[id]', 'page')
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', timeZone: 'America/Toronto' })
}

function notifyPooler(poolerId: string, adminId: string, body: string) {
  if (poolerId === adminId) return
  after(() => sendPushToUser(poolerId, { title: 'Cap Crunch — Correction', body, url: `/poolers/${poolerId}` }).catch(() => {}))
}

/** Avertissement (jamais bloquant pour l'admin) si l'alignement résultant n'est pas conforme. */
async function conformityWarning(db: Db, poolerId: string, saisonId: number): Promise<string | null> {
  const [{ data: rosters }, { data: saison }, { data: settings }] = await Promise.all([
    db.from('pooler_rosters')
      .select('player_type, players (position, player_contracts (season, cap_number, contract_status))')
      .eq('pooler_id', poolerId).eq('pool_season_id', saisonId).eq('is_active', true),
    db.from('pool_seasons').select('season, pool_cap').eq('id', saisonId).single(),
    db.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle(),
  ])
  if (!saison) return null
  const entries = ((rosters ?? []) as unknown as { player_type: string; players: { position: string | null; player_contracts: { season: string; cap_number: number | null; contract_status: string | null }[] } | null }[])
    .map(r => ({
      player_type: r.player_type,
      position: r.players?.position ?? null,
      capNumber: getEffectiveCap(r.players?.player_contracts, saison.season, settings?.unsigned_player_cap_multiplier ?? 1.2).cap,
    }))
  const err = validateRosterLimits(entries, saison.pool_cap)
  return err ? `Alignement non conforme après la correction : ${err}.` : null
}

// ── 1. Changer la date effective ────────────────────────────────────────────────────────────

export async function changeLotDateAction(transactionId: number, poolerId: string, newDate: string): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return { error: 'Date invalide.' }
  const lot = await loadLot(transactionId, poolerId)
  if ('error' in lot) return { error: lot.error }
  const { db, tx, rows } = lot

  // Sans heure : 8 h, heure de l'Est — avant tous les matchs de cette date (même convention que
  // la date forcée de Gestion d'effectifs).
  const newTs = `${newDate}T12:00:00Z`
  const oldTs = tx.created_at
  if (Date.parse(newTs) === Date.parse(oldTs)) return { error: 'C\'est déjà la date de ce lot.' }
  if (Date.parse(newTs) > Date.now() + 86_400_000) return { error: 'La date ne peut pas être dans le futur.' }

  // Ne jamais faire passer un mouvement par-dessus un autre mouvement du même joueur.
  const [lo, hi] = [Math.min(Date.parse(oldTs), Date.parse(newTs)), Math.max(Date.parse(oldTs), Date.parse(newTs))]
  const lotIds = new Set(rows.map(r => r.id))
  const crossed = lot.log.filter(r =>
    !lotIds.has(r.id) && rows.some(x => x.player_id === r.player_id)
    && Date.parse(r.changed_at) >= lo && Date.parse(r.changed_at) <= hi)
  if (crossed.length > 0) {
    return { error: 'Un autre mouvement d\'un joueur de ce lot tombe entre l\'ancienne et la nouvelle date : la nouvelle date changerait l\'ordre des mouvements.' }
  }

  for (const r of rows) {
    const { error } = await db.from('roster_change_log').update({ changed_at: newTs }).eq('id', r.id)
    if (error) return { error: error.message }
    // added_at (arrivée, ou ligne reculée par computeTypeChangeAddedAt) et removed_at (départ)
    // qui valaient l'ancienne date suivent la nouvelle.
    for (const field of ['added_at', 'removed_at'] as const) {
      const { data: hits } = await db.from('pooler_rosters').select('id, ' + field)
        .eq('pooler_id', poolerId).eq('pool_season_id', tx.pool_season_id).eq('player_id', r.player_id)
      for (const h of (hits ?? []) as unknown as Record<string, string | number | null>[]) {
        const v = h[field] as string | null
        if (v && Date.parse(v) === Date.parse(oldTs)) {
          await db.from('pooler_rosters').update({ [field]: newTs }).eq('id', h.id as number)
        }
      }
    }
  }
  await db.from('transactions').update({ created_at: newTs }).eq('id', tx.id)

  notifyPooler(poolerId, auth.userId, `L'admin a corrigé la date de ton mouvement du ${fmtDay(oldTs)} : il prend maintenant effet le ${fmtDay(newTs)}.`)
  revalidateAll()
  return {}
}

// ── 2. Changer le statut de destination d'un mouvement ─────────────────────────────────────

function changeTypeFor(oldType: string | null, newType: CorrectionStatus, previous: string): string {
  if (oldType === null) return previous  // arrivée : signature/ballotage, on garde la nature
  if (newType === 'ltir') return 'ltir'
  if (newType === 'recrue') return 'changement_type'
  if (oldType === 'ltir') return 'retour_ltir'
  return newType === 'actif' ? 'activation' : 'deactivation'
}

export async function changeMoveStatusAction(transactionId: number, poolerId: string, logId: number, newType: CorrectionStatus): Promise<{ error?: string; warning?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  const lot = await loadLot(transactionId, poolerId)
  if ('error' in lot) return { error: lot.error }
  const { db, tx, rows } = lot
  const row = rows.find(r => r.id === logId)
  if (!row) return { error: 'Mouvement introuvable dans ce lot.' }
  if (latestByPlayer(lot.log).get(row.player_id)?.id !== row.id) {
    return { error: 'Ce joueur a bougé depuis : corrige d\'abord le mouvement plus récent.' }
  }
  if (row.new_type === null) return { error: 'Une libération n\'a pas de statut de destination : annule le lot au besoin.' }

  const { data: entry } = await db.from('pooler_rosters')
    .select('id, player_type, rookie_type, pool_draft_year, players (player_contracts (season, is_elc))')
    .eq('pooler_id', poolerId).eq('pool_season_id', tx.pool_season_id).eq('player_id', row.player_id)
    .eq('is_active', true).maybeSingle()
  if (!entry || entry.player_type !== row.new_type) {
    return { error: 'Le statut actuel du joueur ne correspond plus à ce mouvement — rien n\'a été modifié.' }
  }

  const { data: saison } = await db.from('pool_seasons').select('season').eq('id', tx.pool_season_id).single()
  const contracts = (entry.players as unknown as { player_contracts: { season: string; is_elc: boolean | null }[] } | null)?.player_contracts
  const options = statusOptionsFor(row, true, !!saison && isRookieProtected(entry.rookie_type as RookieTag, entry.pool_draft_year as number | null, contracts, saison.season))
  if (!options.includes(newType)) return { error: 'Ce statut n\'est pas permis pour ce mouvement.' }

  const update: Record<string, unknown> = { player_type: newType }
  if (newType === 'recrue' && !entry.rookie_type) update.rookie_type = 'agent_libre'
  const { error: rosterErr } = await db.from('pooler_rosters').update(update).eq('id', entry.id)
  if (rosterErr) return { error: rosterErr.message }

  const changeType = changeTypeFor(row.old_type, newType, row.change_type)
  await db.from('roster_change_log').update({ new_type: newType, change_type: changeType }).eq('id', row.id)
  await db.from('transaction_items')
    .update({ new_player_type: newType, action_type: journalActionType(changeType, row.old_type, newType) })
    .eq('transaction_id', tx.id).eq('player_id', row.player_id)

  notifyPooler(poolerId, auth.userId, `L'admin a corrigé ton mouvement du ${fmtDay(tx.created_at)} : statut ${TYPE_LABEL[row.new_type] ?? row.new_type} → ${TYPE_LABEL[newType]}.`)
  revalidateAll()
  const warning = await conformityWarning(db, poolerId, tx.pool_season_id)
  return warning ? { warning } : {}
}

// ── 3. Annuler le lot ───────────────────────────────────────────────────────────────────────

export async function undoLotAction(transactionId: number, poolerId: string): Promise<{ error?: string; warning?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  const lot = await loadLot(transactionId, poolerId)
  if ('error' in lot) return { error: lot.error }
  const { db, tx, rows } = lot
  const notLatest = notLatestError(lot)
  if (notLatest) return { error: notLatest }
  const saisonId = tx.pool_season_id

  // Tout vérifier avant d'écrire quoi que ce soit.
  type Plan = () => Promise<string | null>
  const plans: Plan[] = []
  for (const r of rows) {
    const { data: entries } = await db.from('pooler_rosters')
      .select('id, player_type, is_active, added_at, removed_at')
      .eq('pooler_id', poolerId).eq('pool_season_id', saisonId).eq('player_id', r.player_id)
    const entry = (entries ?? [])[0] as { id: number; player_type: string; is_active: boolean; added_at: string | null; removed_at: string | null } | undefined
    if (!entry) return { error: `Ligne d'alignement introuvable pour le joueur ${r.player_id}.` }

    if (r.old_type === null) {
      // Arrivée (signature, ballotage) : retirer la ligne créée. Une ligne réutilisée (joueur déjà
      // passé chez ce pooler cette saison) ne se défait pas proprement.
      if (lot.log.some(x => x.player_id === r.player_id && x.id !== r.id)) {
        return { error: 'Un joueur signé dans ce lot était déjà passé chez ce pooler cette saison : corrige-le à la main.' }
      }
      if (!entry.is_active || entry.player_type !== r.new_type) {
        return { error: 'Un joueur signé dans ce lot a changé de statut depuis — rien n\'a été modifié.' }
      }
      let claimId: number | null = null
      if (r.change_type === 'ballotage') {
        const { data: claim } = await db.from('waiver_claims').select('id')
          .eq('pool_season_id', saisonId).eq('player_id', r.player_id)
          .eq('awarded_to_pooler_id', poolerId).eq('status', 'resolved_claimed')
          .order('awarded_at', { ascending: false }).limit(1).maybeSingle()
        claimId = (claim?.id as number | undefined) ?? null
      }
      plans.push(async () => {
        await db.from('pooler_rosters').delete().eq('id', entry.id)
        // Ballotage remporté : il redevient à compléter par le gagnant, avec un nouveau délai.
        if (claimId) {
          await db.from('waiver_claims')
            .update({ status: 'awarded', awarded_at: new Date().toISOString(), error_message: null })
            .eq('id', claimId)
        }
        return null
      })
      continue
    }

    if (r.new_type === null) {
      // Départ (libération) : le joueur ne doit pas être passé chez un autre pooler, et un
      // ballotage ouvert par cette libération doit être vide.
      if (entry.is_active || !entry.removed_at || Date.parse(entry.removed_at) !== Date.parse(r.changed_at)) {
        return { error: 'Un joueur libéré dans ce lot est revenu dans l\'alignement depuis — rien n\'a été modifié.' }
      }
      const { data: elsewhere } = await db.from('pooler_rosters').select('id')
        .eq('pool_season_id', saisonId).eq('player_id', r.player_id).eq('is_active', true).neq('pooler_id', poolerId).limit(1)
      if ((elsewhere ?? []).length > 0) return { error: 'Un joueur libéré dans ce lot a été pris par un autre pooler : impossible d\'annuler.' }
      const { data: claims } = await db.from('waiver_claims').select('id, status')
        .eq('pool_season_id', saisonId).eq('player_id', r.player_id).eq('released_by_pooler_id', poolerId)
        .gte('released_at', new Date(Date.parse(r.created_at) - 120_000).toISOString())
      const claimIds: number[] = []
      for (const c of (claims ?? []) as { id: number; status: string }[]) {
        if (c.status === 'open') {
          const { count } = await db.from('waiver_claim_requests').select('id', { count: 'exact', head: true })
            .eq('waiver_claim_id', c.id).eq('status', 'claimed')
          if ((count ?? 0) > 0) return { error: 'Un joueur libéré dans ce lot a déjà été réclamé au ballotage : impossible d\'annuler.' }
        } else if (c.status !== 'resolved_unclaimed') {
          return { error: 'Le ballotage d\'un joueur libéré dans ce lot est déjà attribué : impossible d\'annuler.' }
        }
        claimIds.push(c.id)
      }
      plans.push(async () => {
        if (claimIds.length > 0) {
          await db.from('waiver_claim_requests').delete().in('waiver_claim_id', claimIds)
          await db.from('waiver_claims').delete().in('id', claimIds)
        }
        await db.from('pooler_rosters').update({ is_active: true, removed_at: null, player_type: r.old_type }).eq('id', entry.id)
        return null
      })
      continue
    }

    // Changement de statut : revenir à l'ancien.
    if (!entry.is_active || entry.player_type !== r.new_type) {
      return { error: 'Le statut actuel d\'un joueur ne correspond plus à ce lot — rien n\'a été modifié.' }
    }
    plans.push(async () => {
      await db.from('pooler_rosters').update({ player_type: r.old_type }).eq('id', entry.id)
      return null
    })
  }

  for (const run of plans) await run()
  await db.from('roster_change_log').delete().in('id', rows.map(r => r.id))
  await db.from('transaction_items').delete().eq('transaction_id', tx.id)
  await db.from('transactions').delete().eq('id', tx.id)

  notifyPooler(poolerId, auth.userId, `L'admin a annulé ton mouvement du ${fmtDay(tx.created_at)} : ton alignement est revenu à son état d'avant. Tu peux refaire le bon changement.`)
  revalidateAll()
  const warning = await conformityWarning(db, poolerId, saisonId)
  return warning ? { warning } : {}
}
