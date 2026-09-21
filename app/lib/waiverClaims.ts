import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers } from '@/lib/push'
import { sendEmailToIds } from '@/lib/email'
import { buildStandings } from '@/lib/standings'
import { getTodayET, addDaysToDate } from '@/lib/daily-recap'
import { localMidnightUTC } from '@/lib/dateRanges'

// Délai laissé au gagnant pour compléter lui-même sa transaction (voir resolveExpiredWaiverClaims
// et resolveExpiredAwardedClaims plus bas) — même ordre de grandeur que les autres délais de
// grâce de l'app (48h), pas besoin d'en faire un réglage admin distinct pour l'instant.
const COMPLETION_GRACE_HOURS = 48

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

// Fenêtre de réclamation par jour civil (heure de l'Est), pas par nombre d'heures fixe (David,
// 2026-09-21) — un joueur libéré n'importe quand un jour J reste réclamable jusqu'à 23h59 ET
// du jour J+`days` (ex: libéré lundi, `days=2` → réclamable jusqu'à mercredi 23h59, attribué le
// jeudi), plutôt qu'un délai roulant en heures dont l'heure limite exacte dépend de l'heure de
// la libération — plus simple à retenir pour les poolers. `deadlineDay` (dernier jour où on peut
// réclamer) sert à l'affichage humain ; `expiresAt` est le début du jour SUIVANT (minuit ET),
// le moment exact où resolveExpiredWaiverClaims() peut résoudre le claim.
function computeWaiverWindow(days: number): { deadlineDay: string; expiresAt: Date } {
  const releaseDay = getTodayET()
  const deadlineDay = addDaysToDate(releaseDay, days)
  const resolvableDay = addDaysToDate(deadlineDay, 1)
  return { deadlineDay, expiresAt: localMidnightUTC(resolvableDay) }
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
    admin.from('app_settings').select('waiver_claim_days').eq('id', 1).maybeSingle(),
    admin.from('poolers').select('name').eq('id', releasedByPoolerId).single(),
  ])
  if (!prioritySnapshot) return // ni classement réel ni ordre pré-saison disponible — pas de ballotage possible sans ordre de priorité

  const windowDays = settings?.waiver_claim_days ?? 2
  const now = new Date()
  const { deadlineDay, expiresAt } = computeWaiverWindow(windowDays)

  const { error } = await admin.from('waiver_claims').insert({
    pool_season_id: saisonId,
    player_id: playerId,
    released_by_pooler_id: releasedByPoolerId,
    released_at: now.toISOString(),
    priority_snapshot: prioritySnapshot,
    window_days: windowDays,
    window_hours: windowDays * 24, // legacy, conservé pour compat — plus utilisé pour le calcul
    expires_at: expiresAt.toISOString(),
    status: 'open',
  })
  if (error) {
    console.error('createWaiverClaimForRelease: échec insertion —', error)
    return
  }

  const label = await playerLabel(admin, playerId)
  const deadline = `${new Date(`${deadlineDay}T12:00:00Z`).toLocaleDateString('fr-CA', { dateStyle: 'medium', timeZone: 'America/Toronto' })} 23h59`
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
//
// David, 2026-09-21 — ne signe plus le gagnant automatiquement (l'ancien ajout direct en
// réserviste pouvait dépasser son cap et finir 'blocked', obligeant l'admin à intervenir à
// chaque fois). Le claim passe plutôt à 'awarded' : le gagnant est notifié et complète lui-même
// sa transaction depuis Gestion d'effectifs (bouton "Ballotage" pré-rempli, voir
// gestion-effectifs/actions.ts addNewPlayer/getAwardedWaiverClaimsAction) — soumise comme
// n'importe quel lot, donc revalidée par validateRosterLimits à ce moment-là, ce qui force le
// pooler à ajouter lui-même une libération si besoin plutôt que de bloquer l'admin.
export async function resolveExpiredWaiverClaims(saisonId: number) {
  const admin = createAdminClient()

  const { data: expired } = await admin
    .from('waiver_claims')
    .select('id, player_id, released_by_pooler_id, priority_snapshot')
    .eq('pool_season_id', saisonId)
    .eq('status', 'open')
    .lte('expires_at', new Date().toISOString())
  if (!expired || expired.length === 0) return

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
    const now = new Date().toISOString()

    await admin.from('waiver_claims').update({
      status: 'awarded', awarded_to_pooler_id: winnerId, awarded_at: now,
    }).eq('id', claim.id)

    const label = await playerLabel(admin, claim.player_id)
    after(() => Promise.all([
      sendPushToUsers([winnerId], {
        title: 'Cap Crunch — Ballotage',
        body: `Tu as remporté le ballotage pour ${label} — complète ta transaction dans Gestion d'effectifs (48h).`,
        url: '/gestion-effectifs',
      }).catch(() => {}),
      sendEmailToIds([winnerId], {
        subject: 'Cap Crunch — Ballotage remporté',
        html: `<p>Tu as remporté le ballotage pour <strong>${label}</strong>.</p>
               <p>Rends-toi dans Gestion d'effectifs (onglet Mouvements) pour l'ajouter à ton alignement — un bouton "Ballotage" pré-rempli t'attend. Ajoute au besoin une libération pour rester conforme. Tu as 48h, après quoi l'admin devra intervenir manuellement.</p>`,
      }).catch(() => {}),
    ]))
  }
}

// Filet de sécurité (David, 2026-09-21) — si le gagnant n'a pas complété sa transaction dans le
// délai (COMPLETION_GRACE_HOURS), le claim passe 'blocked' pour que l'admin le traite
// manuellement via /admin/transactions, même philosophie que cap_signing_watch. Appelé
// paresseusement au chargement de l'onglet Ballotage, comme resolveExpiredWaiverClaims.
export async function resolveExpiredAwardedClaims(saisonId: number) {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - COMPLETION_GRACE_HOURS * 3_600_000).toISOString()

  const { data: stale } = await admin
    .from('waiver_claims')
    .select('id')
    .eq('pool_season_id', saisonId)
    .eq('status', 'awarded')
    .lte('awarded_at', cutoff)
  if (!stale || stale.length === 0) return

  await admin.from('waiver_claims').update({
    status: 'blocked',
    error_message: "Le gagnant n'a pas complété sa transaction dans le délai de 48h — à traiter manuellement.",
  }).in('id', stale.map(c => c.id))
}

// Garde-fou contre une signature normale d'un joueur présentement au ballotage (David,
// 2026-09-21) — 'open' (réclamation en cours) et 'awarded' (gagné, en attente que le gagnant
// complète sa transaction) sont tous deux exclus : le joueur n'est un agent libre normal que
// s'il n'a jamais été réclamé ou une fois le claim résolu/expiré.
export async function isPlayerUnderActiveWaiverClaim(
  admin: ReturnType<typeof createAdminClient>, saisonId: number, playerId: number,
): Promise<boolean> {
  const { data } = await admin
    .from('waiver_claims')
    .select('id')
    .eq('pool_season_id', saisonId)
    .eq('player_id', playerId)
    .in('status', ['open', 'awarded'])
    .maybeSingle()
  return !!data
}
