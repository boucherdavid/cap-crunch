/**
 * Demandes de mise sur LTIR en attente d'approbation admin (David, 2026-09-23) — un pooler
 * peut initier la mise sur LTIR d'un actif (et optionnellement signer un remplaçant en même
 * temps), mais rien ne bouge dans `pooler_rosters` avant que l'admin approuve. Même patron que
 * `waiverClaims.ts`/`tradeOffers.ts` : écriture directe via `createAdminClient()`, notifications
 * push/courriel via `after()`.
 *
 * À l'approbation, réutilise `submitBatchAction` (gestion-effectifs/actions.ts) plutôt que de
 * dupliquer la logique LTIR/LTIR+signature — s'exécute avec les droits admin (la Server Action
 * appelante tourne dans la session de l'admin qui clique "Approuver"), donc `validateRosterLimits`
 * est sautée comme pour toute action admin (même comportement que partout ailleurs dans l'app —
 * l'admin n'est jamais bloqué).
 *
 * Reste du panier (David, 2026-10-11) : les autres mouvements du panier sont joints à la demande
 * (`extra_actions`) et appliqués avec le LTIR dans un seul lot à l'approbation, validé sur l'état
 * final (`enforceLimits`, même pour l'admin qui approuve) ; déjà validés à la soumission
 * (`dryRun`). Le statut de l'agent libre signé est au choix du pooler (`new_player_type`).
 *
 * Date effective = la date de SOUMISSION par le pooler, pas celle de l'approbation (David,
 * 2026-09-23) — passée à `submitBatchAction` via `forcedDate`, même mécanisme que les autres
 * dates historiques de l'app (voir CLAUDE.md section 6).
 */

import { emailLinkHtml } from '@/lib/siteUrl'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser, sendPushToAdmins } from '@/lib/push'
import { sendEmailToIds } from '@/lib/email'
import { submitBatchAction, type BatchActionInput } from '@/app/gestion-effectifs/actions'
import { fetchInjuriesByPlayerId, type InjuryInfo } from '@/lib/injuries'

const APPROBATION_PATH = '/admin/effectifs?tab=approbation'
const MOUVEMENTS_PATH = '/gestion-effectifs'

function linkHtml(path: string): string {
  return emailLinkHtml(path)
}

type AdminDb = ReturnType<typeof createAdminClient>

async function poolerName(admin: AdminDb, poolerId: string): Promise<string> {
  const { data } = await admin.from('poolers').select('name').eq('id', poolerId).single()
  return data?.name ?? 'Un pooler'
}

async function playerName(admin: AdminDb, playerId: number): Promise<string> {
  const { data } = await admin.from('players').select('first_name, last_name').eq('id', playerId).single()
  return data ? `${data.first_name} ${data.last_name}` : 'un joueur'
}

export type LtirRequestView = {
  id: number
  poolerId: string
  poolerName: string
  ltirPlayerId: number
  ltirPlayerName: string
  newPlayerName: string | null
  newPlayerType: 'actif' | 'reserviste' | null
  extraLabels: string[]  // autres mouvements du panier, appliqués avec le LTIR
  submittedAt: string
  injury: InjuryInfo | null  // aide à la décision admin — voir app/lib/ltirEligibility.ts
}

export type LtirExtraAction = { label: string; action: BatchActionInput }

function buildBatch(
  ltirEntryId: number, newPlayerId: number | null | undefined, newPlayerType: 'actif' | 'reserviste',
  extras: LtirExtraAction[],
): BatchActionInput[] {
  return [
    {
      type: newPlayerId ? 'ltir_sign' : 'ltir',
      ltirEntryId,
      newPlayerId: newPlayerId ?? undefined,
      newPlayerType: newPlayerId ? newPlayerType : undefined,
    },
    ...extras.map(e => e.action),
  ]
}

export async function createLtirRequest(
  poolSeasonId: number,
  poolerId: string,
  ltirPlayerId: number,
  newPlayerId?: number,
  newPlayerType?: 'actif' | 'reserviste',
  extraActions: LtirExtraAction[] = [],
): Promise<{ error?: string }> {
  const admin = createAdminClient()

  const { data: entry } = await admin
    .from('pooler_rosters')
    .select('id, player_type')
    .eq('pooler_id', poolerId)
    .eq('pool_season_id', poolSeasonId)
    .eq('player_id', ltirPlayerId)
    .eq('is_active', true)
    .maybeSingle()
  // Actif ou réserviste (David, 2026-10-01) : les deux comptent dans la masse salariale.
  if (!entry || (entry.player_type !== 'actif' && entry.player_type !== 'reserviste')) {
    return { error: "Ce joueur n'est ni actif ni réserviste dans cet alignement." }
  }

  const { data: existingRequest } = await admin
    .from('ltir_requests')
    .select('id')
    .eq('pooler_id', poolerId)
    .eq('ltir_player_id', ltirPlayerId)
    .eq('status', 'pending')
    .maybeSingle()
  if (existingRequest) return { error: 'Une demande est déjà en attente pour ce joueur.' }

  if (newPlayerId) {
    const { data: owned } = await admin
      .from('pooler_rosters')
      .select('id')
      .eq('pool_season_id', poolSeasonId)
      .eq('player_id', newPlayerId)
      .eq('is_active', true)
      .maybeSingle()
    if (owned) return { error: 'Ce joueur de remplacement est déjà dans un alignement.' }
  }

  // Le panier complet doit donner un alignement conforme (rien n'est écrit ici).
  const replType = newPlayerType ?? (entry.player_type === 'reserviste' ? 'reserviste' : 'actif')
  const check = await submitBatchAction({
    poolerId, saisonId: poolSeasonId, dryRun: true,
    actions: buildBatch(entry.id, newPlayerId, replType, extraActions),
  })
  if (check.error) return { error: check.error }

  const { error } = await admin.from('ltir_requests').insert({
    pool_season_id: poolSeasonId,
    pooler_id: poolerId,
    ltir_player_id: ltirPlayerId,
    new_player_id: newPlayerId ?? null,
    new_player_type: newPlayerId ? replType : null,
    extra_actions: extraActions.length > 0 ? extraActions : null,
    status: 'pending',
  })
  if (error) return { error: error.message }

  const [pName, lName] = await Promise.all([poolerName(admin, poolerId), playerName(admin, ltirPlayerId)])
  after(() => sendPushToAdmins({
    title: 'Cap Crunch — Demande LTIR à approuver',
    body: `${pName} demande à mettre ${lName} sur LTIR${extraActions.length > 0 ? ` (avec ${extraActions.length} autre${extraActions.length > 1 ? 's' : ''} mouvement${extraActions.length > 1 ? 's' : ''})` : ''}.`,
    url: APPROBATION_PATH,
  }).catch(() => {}))

  return {}
}

export async function cancelLtirRequest(requestId: number, poolerId: string): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { data: req } = await admin.from('ltir_requests').select('pooler_id, status').eq('id', requestId).single()
  if (!req || req.pooler_id !== poolerId) return { error: 'Demande introuvable.' }
  if (req.status !== 'pending') return { error: "Cette demande n'est plus en attente." }
  await admin.from('ltir_requests')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('id', requestId)
  return {}
}

export async function listPendingLtirRequestsForPooler(poolSeasonId: number, poolerId: string): Promise<LtirRequestView[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('ltir_requests')
    .select(`
      id, ltir_player_id, submitted_at, new_player_type, extra_actions,
      poolers!pooler_id (name),
      ltir_player:players!ltir_player_id (first_name, last_name),
      new_player:players!new_player_id (first_name, last_name)
    `)
    .eq('pool_season_id', poolSeasonId)
    .eq('pooler_id', poolerId)
    .eq('status', 'pending')
    .order('submitted_at')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(r => ({
    id: r.id,
    poolerId,
    poolerName: r.poolers?.name ?? '',
    ltirPlayerId: r.ltir_player_id,
    ltirPlayerName: r.ltir_player ? `${r.ltir_player.first_name} ${r.ltir_player.last_name}` : '',
    newPlayerName: r.new_player ? `${r.new_player.first_name} ${r.new_player.last_name}` : null,
    newPlayerType: r.new_player_type ?? null,
    extraLabels: ((r.extra_actions ?? []) as LtirExtraAction[]).map(e => e.label),
    submittedAt: r.submitted_at,
    injury: null,
  }))
}

export async function listPendingLtirRequestsForAdmin(poolSeasonId: number): Promise<LtirRequestView[]> {
  const admin = createAdminClient()
  const [{ data }, injuriesByPlayerId] = await Promise.all([
    admin
      .from('ltir_requests')
      .select(`
        id, pooler_id, ltir_player_id, submitted_at, new_player_type, extra_actions,
        poolers!pooler_id (name),
        ltir_player:players!ltir_player_id (first_name, last_name),
        new_player:players!new_player_id (first_name, last_name)
      `)
      .eq('pool_season_id', poolSeasonId)
      .eq('status', 'pending')
      .order('submitted_at'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchInjuriesByPlayerId(admin as any),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(r => ({
    id: r.id,
    poolerId: r.pooler_id,
    poolerName: r.poolers?.name ?? '',
    ltirPlayerId: r.ltir_player_id,
    ltirPlayerName: r.ltir_player ? `${r.ltir_player.first_name} ${r.ltir_player.last_name}` : '',
    newPlayerName: r.new_player ? `${r.new_player.first_name} ${r.new_player.last_name}` : null,
    newPlayerType: r.new_player_type ?? null,
    extraLabels: ((r.extra_actions ?? []) as LtirExtraAction[]).map(e => e.label),
    submittedAt: r.submitted_at,
    injury: injuriesByPlayerId.get(r.ltir_player_id) ?? null,
  }))
}

export async function decideLtirRequest(
  requestId: number,
  approve: boolean,
  adminId: string,
): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { data: req } = await admin.from('ltir_requests').select('*').eq('id', requestId).single()
  if (!req) return { error: 'Demande introuvable.' }
  if (req.status !== 'pending') return { error: "Cette demande n'est plus en attente." }

  const lName = await playerName(admin, req.ltir_player_id)

  if (!approve) {
    await admin.from('ltir_requests')
      .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: adminId })
      .eq('id', requestId)
    after(() => Promise.all([
      sendPushToUser(req.pooler_id, { title: 'Cap Crunch — Demande LTIR refusée', body: `Ta demande pour ${lName} a été refusée.`, url: MOUVEMENTS_PATH }).catch(() => {}),
      sendEmailToIds([req.pooler_id], { subject: 'Cap Crunch — Demande LTIR refusée', html: `<p>Ta demande pour <strong>${lName}</strong> a été refusée.</p>${linkHtml(MOUVEMENTS_PATH)}` }).catch(() => {}),
    ]))
    return {}
  }

  const { data: entry } = await admin
    .from('pooler_rosters')
    .select('id, player_type')
    .eq('pooler_id', req.pooler_id)
    .eq('pool_season_id', req.pool_season_id)
    .eq('player_id', req.ltir_player_id)
    .eq('is_active', true)
    .maybeSingle()
  if (!entry) return { error: "Ce joueur n'est plus dans l'alignement de ce pooler (probablement libéré ou échangé entre-temps) — rejette cette demande." }

  // Date effective = la date de soumission, pas celle de l'approbation (David, 2026-09-23).
  const effectiveDate = (req.submitted_at as string).slice(0, 10)

  const result = await submitBatchAction({
    poolerId: req.pooler_id,
    saisonId: req.pool_season_id,
    forcedDate: effectiveDate,
    // Tout le panier d'un coup, et l'état final doit être conforme même si c'est l'admin qui
    // approuve. Ancienne demande sans statut choisi : même statut que le joueur mis sur LTIR.
    enforceLimits: true,
    actions: buildBatch(
      entry.id, req.new_player_id,
      req.new_player_type ?? (entry.player_type === 'reserviste' ? 'reserviste' : 'actif'),
      (req.extra_actions ?? []) as LtirExtraAction[],
    ),
  })
  if (result.error) return { error: result.error }

  await admin.from('ltir_requests')
    .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: adminId })
    .eq('id', requestId)

  after(() => Promise.all([
    sendPushToUser(req.pooler_id, { title: 'Cap Crunch — Demande LTIR approuvée', body: `${lName} est maintenant sur LTIR.`, url: MOUVEMENTS_PATH }).catch(() => {}),
    sendEmailToIds([req.pooler_id], { subject: 'Cap Crunch — Demande LTIR approuvée', html: `<p><strong>${lName}</strong> est maintenant sur LTIR.</p>${linkHtml(MOUVEMENTS_PATH)}` }).catch(() => {}),
  ]))

  return {}
}
