import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers } from '@/lib/push'
import { sendEmailToIds } from '@/lib/email'
import { buildStandings } from '@/lib/standings'
import { checkFutureRosterConflict } from '@/lib/rosterTypeChange'
import { getEffectiveCap } from '@/lib/capUtils'
import { validateRosterLimits } from '@/lib/rosterLimits'

// Ballotage en cours de saison — file de réclamation par priorité quand un pooler libère un
// joueur (saison démarrée seulement, voir CLAUDE.md section 6). Pas d'import depuis
// admin/transactions/actions.ts ici délibérément : ce fichier-là importera
// createWaiverClaimForRelease pour brancher la création sur son propre chemin de libération
// ('release' dans applyTransactionItems) — un import dans l'autre sens créerait un cycle.
// La résolution (signature du joueur au gagnant) est donc écrite directement ici plutôt que
// réutiliser applyTransactionItems, en dupliquant le strict minimum de sa logique 'sign'.

// Avant le 1er novembre de l'année de début de saison, le classement réel n'a pas encore de
// sens (peu ou pas de matchs joués) — David, 2026-09-21. Coupure volontairement approximative
// (pas d'heure de l'Est à la seconde près comme dateRanges.ts) : une différence de quelques
// heures autour de minuit n'a aucune conséquence réelle sur l'équité du ballotage ici.
function isBeforeNovemberFirst(season: string): boolean {
  const startYear = parseInt(season.split('-')[0], 10)
  return new Date() < new Date(startYear, 10, 1) // mois 0-indexé : 10 = novembre
}

// Ordre de priorité du ballotage (David, 2026-09-21) — avant le 1er novembre, utilise
// `pool_seasons.presaison_draft_order` (même ordre, même convention "pire en premier", déjà
// utilisé pour le repêchage des recrues et des agents libres, déjà ajustable manuellement via
// l'éditeur d'ordre existant — DraftOrderEditor.tsx) plutôt que le classement réel de la saison
// en cours, qui n'a pas encore de sens en tout début de saison (buildStandings() retournerait
// un tableau vide tant qu'aucun match n'est joué). À partir du 1er novembre, le classement réel
// prévaut ; s'il est encore indisponible à ce moment-là (cas limite), on retombe sur
// presaison_draft_order plutôt que de bloquer complètement le ballotage.
async function computeWaiverPriority(
  admin: ReturnType<typeof createAdminClient>,
  saisonId: number,
  season: string,
  presaisonDraftOrder: string[] | null,
): Promise<string[] | null> {
  if (isBeforeNovemberFirst(season) && presaisonDraftOrder && presaisonDraftOrder.length > 0) {
    return presaisonDraftOrder
  }
  const standings = await buildStandings(admin, saisonId)
  if (standings.length > 0) return standings.map(s => s.poolerId).reverse()
  return presaisonDraftOrder && presaisonDraftOrder.length > 0 ? presaisonDraftOrder : null
}

async function playerLabel(admin: ReturnType<typeof createAdminClient>, playerId: number): Promise<string> {
  const { data } = await admin.from('players').select('first_name, last_name').eq('id', playerId).single()
  return data ? `${data.last_name}, ${data.first_name}` : `joueur #${playerId}`
}

async function notifyAllPoolersExcept(excludePoolerId: string | null, title: string, body: string, subject: string, html: string) {
  const admin = createAdminClient()
  const { data: poolers } = await admin.from('poolers').select('id')
  const ids = (poolers ?? []).map(p => p.id).filter(id => id !== excludePoolerId)
  if (ids.length === 0) return
  after(() => Promise.all([
    sendPushToUsers(ids, { title, body, url: '/gestion-effectifs' }).catch(() => {}),
    sendEmailToIds(ids, { subject, html }).catch(() => {}),
  ]))
}

// Appelé depuis les deux chemins de libération existants (gestion-effectifs/actions.ts,
// admin/transactions/actions.ts) après que la libération soit appliquée avec succès. No-op si
// la saison n'est pas démarrée (ménage pré-saison, hors scope du ballotage — David, 2026-09-15).
export async function createWaiverClaimForRelease(saisonId: number, playerId: number, releasedByPoolerId: string) {
  const admin = createAdminClient()

  const { data: saison } = await admin.from('pool_seasons').select('season, season_started, presaison_draft_order').eq('id', saisonId).single()
  if (!saison?.season_started) return

  const [prioritySnapshot, { data: settings }, { data: releaser }] = await Promise.all([
    computeWaiverPriority(admin, saisonId, saison.season, saison.presaison_draft_order),
    admin.from('app_settings').select('waiver_claim_hours').eq('id', 1).maybeSingle(),
    admin.from('poolers').select('name').eq('id', releasedByPoolerId).single(),
  ])
  if (!prioritySnapshot) return // ni classement réel ni ordre pré-saison disponible — pas de ballotage possible sans ordre de priorité

  const windowHours = settings?.waiver_claim_hours ?? 72
  const now = new Date()
  const expiresAt = new Date(now.getTime() + windowHours * 3_600_000)

  const { error } = await admin.from('waiver_claims').insert({
    pool_season_id: saisonId,
    player_id: playerId,
    released_by_pooler_id: releasedByPoolerId,
    released_at: now.toISOString(),
    priority_snapshot: prioritySnapshot,
    window_hours: windowHours,
    expires_at: expiresAt.toISOString(),
    status: 'open',
  })
  if (error) {
    console.error('createWaiverClaimForRelease: échec insertion —', error)
    return
  }

  const label = await playerLabel(admin, playerId)
  const deadline = expiresAt.toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto' })
  await notifyAllPoolersExcept(
    releasedByPoolerId,
    'Cap Crunch — Ballotage',
    `${label} a été libéré par ${releaser?.name ?? 'un pooler'} — réclamable jusqu'au ${deadline}.`,
    'Cap Crunch — Ballotage',
    `<p><strong>${label}</strong> a été libéré par ${releaser?.name ?? 'un pooler'}.</p>
     <p>Réclamable jusqu'au ${deadline} dans l'onglet Ballotage de Gestion d'effectifs.</p>`,
  )
}

// Notification anticipée "tu vas gagner" (David, 2026-09-21) — appelée après chaque réclamation
// ET chaque refus (le refus n'est pas le seul déclencheur possible : le pooler le plus
// prioritaire de toute la liste est déjà garanti dès sa propre réclamation, sans attendre un
// refus de qui que ce soit). Pas de tâche planifiée — le déclencheur naturel est l'action
// elle-même (réclamer/refuser), cohérent avec le reste de ce fichier (résolution paresseuse).
// "Garanti" = tous les poolers plus prioritaires que le réclamant en tête ont explicitement
// refusé (silence ≠ refus : un pooler qui n'a pas encore répondu pourrait encore réclamer plus
// tard, donc pas de garantie possible tant qu'il n'a pas agi). `guaranteed_notified_at` évite
// de renotifier deux fois le même réclamant pour le même claim.
export async function checkGuaranteedWaiverWinner(waiverClaimId: number) {
  const admin = createAdminClient()

  const { data: claim } = await admin
    .from('waiver_claims')
    .select('id, player_id, status, priority_snapshot')
    .eq('id', waiverClaimId)
    .single()
  if (!claim || claim.status !== 'open') return

  const { data: requests } = await admin
    .from('waiver_claim_requests')
    .select('pooler_id, status, guaranteed_notified_at')
    .eq('waiver_claim_id', waiverClaimId)
  const claimedIds = new Set((requests ?? []).filter(r => r.status === 'claimed').map(r => r.pooler_id))
  const refusedIds = new Set((requests ?? []).filter(r => r.status === 'refused').map(r => r.pooler_id))

  const priority: string[] = claim.priority_snapshot
  const leaderId = priority.find(id => claimedIds.has(id))
  if (!leaderId) return // personne n'a encore réclamé — rien à garantir

  const leaderIndex = priority.indexOf(leaderId)
  const allAboveRefused = priority.slice(0, leaderIndex).every(id => refusedIds.has(id))
  if (!allAboveRefused) return

  const leaderRequest = (requests ?? []).find(r => r.pooler_id === leaderId && r.status === 'claimed')
  if (leaderRequest?.guaranteed_notified_at) return // déjà notifié pour ce claim

  await admin.from('waiver_claim_requests')
    .update({ guaranteed_notified_at: new Date().toISOString() })
    .eq('waiver_claim_id', waiverClaimId).eq('pooler_id', leaderId)

  const label = await playerLabel(admin, claim.player_id)
  after(() => Promise.all([
    sendPushToUsers([leaderId], {
      title: 'Cap Crunch — Ballotage',
      body: `Tout le monde devant toi a refusé ${label} — tu vas l'obtenir à la fin du délai.`,
      url: '/gestion-effectifs',
    }).catch(() => {}),
    sendEmailToIds([leaderId], {
      subject: 'Cap Crunch — Ballotage (résultat garanti)',
      html: `<p>Tout le monde devant toi au classement de priorité a refusé <strong>${label}</strong> — tu vas l'obtenir à la fin du délai de réclamation, même si quelqu'un d'autre le réclame encore après toi.</p>`,
    }).catch(() => {}),
  ]))
}

// Résout les claims dont la fenêtre est expirée — appelé paresseusement au chargement de
// l'onglet Ballotage (même patron que syncExpiredRookieProtection, admin/presaison/actions.ts) :
// pas de tâche planifiée, la résolution se fait au premier chargement de page qui suit
// l'expiration.
export async function resolveExpiredWaiverClaims(saisonId: number) {
  const admin = createAdminClient()

  const { data: expired } = await admin
    .from('waiver_claims')
    .select('id, player_id, released_by_pooler_id, priority_snapshot')
    .eq('pool_season_id', saisonId)
    .eq('status', 'open')
    .lte('expires_at', new Date().toISOString())
  if (!expired || expired.length === 0) return

  const { data: saison } = await admin.from('pool_seasons').select('season, pool_cap').eq('id', saisonId).single()
  const { data: settingsRow } = await admin.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle()
  const unsignedMultiplier = settingsRow?.unsigned_player_cap_multiplier ?? 1.20

  for (const claim of expired as { id: number; player_id: number; released_by_pooler_id: string; priority_snapshot: string[] }[]) {
    // status='claimed' seulement (David, 2026-09-21) — un refus explicite (bouton "Refuser",
    // voir checkGuaranteedWaiverWinner plus bas) ne doit jamais compter comme une réclamation.
    const { data: requests } = await admin
      .from('waiver_claim_requests')
      .select('pooler_id')
      .eq('waiver_claim_id', claim.id)
      .eq('status', 'claimed')

    if (!requests || requests.length === 0) {
      await admin.from('waiver_claims').update({ status: 'resolved_unclaimed', resolved_at: new Date().toISOString() }).eq('id', claim.id)
      continue
    }

    const requesterIds = new Set(requests.map(r => r.pooler_id))
    const winnerId = claim.priority_snapshot.find(id => requesterIds.has(id)) ?? requests[0].pooler_id

    const result = await resolveClaimToWinner(admin, saisonId, saison?.season ?? '', saison?.pool_cap ?? 0, unsignedMultiplier, claim.player_id, winnerId)
    if (result.error) {
      console.error('resolveExpiredWaiverClaims: résolution bloquée —', result.error)
      await admin.from('waiver_claims').update({ status: 'blocked', error_message: result.error }).eq('id', claim.id)
      continue
    }

    await admin.from('waiver_claims').update({
      status: 'resolved_claimed', resolved_at: new Date().toISOString(), awarded_to_pooler_id: winnerId,
    }).eq('id', claim.id)

    const label = await playerLabel(admin, claim.player_id)
    after(() => Promise.all([
      sendPushToUsers([winnerId], { title: 'Cap Crunch — Ballotage', body: `Tu as remporté le ballotage pour ${label}.`, url: '/gestion-effectifs' }).catch(() => {}),
      sendEmailToIds([winnerId], { subject: 'Cap Crunch — Ballotage remporté', html: `<p>Tu as remporté le ballotage pour <strong>${label}</strong>. Il est maintenant sur ton alignement (réserviste).</p>` }).catch(() => {}),
    ]))
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveClaimToWinner(admin: any, saisonId: number, season: string, poolCap: number, unsignedMultiplier: number, playerId: number, winnerId: string): Promise<{ error?: string }> {
  const [{ data: player }, { data: winnerRoster }] = await Promise.all([
    admin.from('players').select('position, player_contracts (season, cap_number)').eq('id', playerId).single(),
    admin.from('pooler_rosters').select('id, player_type, players (position, player_contracts (season, cap_number))')
      .eq('pooler_id', winnerId).eq('pool_season_id', saisonId).eq('is_active', true),
  ])
  if (!player) return { error: 'Joueur introuvable.' }

  const cap = getEffectiveCap(player.player_contracts, season, unsignedMultiplier).cap
  const virtualEntries = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(winnerRoster ?? []).map((r: any) => ({
      player_type: r.player_type, position: r.players?.position ?? null,
      capNumber: getEffectiveCap(r.players?.player_contracts, season, unsignedMultiplier).cap,
    })),
    { player_type: 'reserviste', position: player.position ?? null, capNumber: cap },
  ]
  const limitError = validateRosterLimits(virtualEntries, poolCap)
  if (limitError) return { error: limitError }

  const now = new Date().toISOString()
  const conflict = await checkFutureRosterConflict(admin, winnerId, playerId, saisonId, now, 'reserviste')
  if (conflict.error) return conflict

  const { data: existing } = await admin.from('pooler_rosters').select('id')
    .eq('pooler_id', winnerId).eq('player_id', playerId).eq('pool_season_id', saisonId).maybeSingle()
  if (existing) {
    const { error } = await admin.from('pooler_rosters')
      .update({ is_active: true, player_type: 'reserviste', removed_at: null, added_at: now }).eq('id', existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin.from('pooler_rosters')
      .insert({ pooler_id: winnerId, player_id: playerId, pool_season_id: saisonId, player_type: 'reserviste', is_active: true, added_at: now })
    if (error) return { error: error.message }
  }

  const { data: tx, error: txErr } = await admin.from('transactions')
    .insert({ pool_season_id: saisonId, notes: 'Ballotage', created_by: null }).select('id').single()
  if (txErr) return { error: txErr.message }
  await admin.from('transaction_items').insert({
    transaction_id: tx.id, action_type: 'sign', to_pooler_id: winnerId, player_id: playerId, new_player_type: 'reserviste',
  })

  await admin.from('roster_change_log').insert({
    player_id: playerId, pooler_id: winnerId, pool_season_id: saisonId,
    change_type: 'ballotage', old_type: null, new_type: 'reserviste',
    changed_by: null, changed_at: now, is_admin_override: true,
  })

  return {}
}
