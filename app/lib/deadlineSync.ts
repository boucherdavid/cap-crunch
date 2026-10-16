/**
 * Dates limites des poolers (David, 2026-10-16) — règle et rappelle ce qui arrive à échéance,
 * sans dépendre de l'ouverture d'un onglet précis.
 *
 * Avant : le ballotage et les échanges ne se réglaient qu'au chargement de leur onglet de
 * Gestion d'effectifs. Si personne ne l'ouvrait, le gagnant d'un ballotage n'était pas avisé à
 * minuit et son délai de 48 h ne commençait pas. Lancé maintenant aussi depuis l'accueil
 * (`after()`, au plus aux 5 minutes par instance), comme le retour de LTIR (lib/ltirReturns.ts).
 *
 * Rappels, un seul par délai (colonnes de deadline_reminders.sql) :
 * - ballotage : le dernier jour, aux poolers qui n'ont ni réclamé ni refusé ;
 * - ballotage remporté : 24 h avant la fin des 48 h ; avis aux admins quand il est bloqué ;
 * - échange approuvé : 1 jour avant la fin, au pooler qui n'a pas confirmé ;
 * - plafond dépassé après une signature : 2 jours avant la date limite.
 *
 * Lectures bornées aux dossiers ouverts de la saison active (quelques lignes).
 */

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveExpiredWaiverClaims, resolveExpiredAwardedClaims, sendWaiverReminders } from '@/lib/waiverClaims'
import { resolveExpiredTradeOffers, sendTradeReminders } from '@/lib/tradeOffers'
import { sendPushToUsers } from '@/lib/push'
import { sendEmailToIds } from '@/lib/email'
import { emailLinkHtml } from '@/lib/siteUrl'

const SYNC_THROTTLE_MS = 5 * 60_000
const CAP_REMINDER_DAYS_BEFORE = 2

let lastSyncAt = 0

export async function syncDeadlines(force = false): Promise<void> {
  if (!force && Date.now() - lastSyncAt < SYNC_THROTTLE_MS) return
  lastSyncAt = Date.now()
  try {
    const admin = createAdminClient()
    const { data: season } = await admin
      .from('pool_seasons').select('id, season_started')
      .eq('is_active', true).eq('is_playoff', false).maybeSingle()
    if (!season?.season_started) return
    const saisonId = season.id as number

    // Chaque étape est indépendante : une erreur dans l'une n'empêche pas les autres.
    const steps: [string, () => Promise<void>][] = [
      ['ballotage', () => resolveExpiredWaiverClaims(saisonId)],
      ['ballotage remporté', () => resolveExpiredAwardedClaims(saisonId)],
      ['rappels ballotage', () => sendWaiverReminders(saisonId)],
      ['échanges', () => resolveExpiredTradeOffers(saisonId)],
      ['rappels échanges', () => sendTradeReminders(saisonId)],
      ['rappels plafond', () => sendCapReminders(saisonId)],
    ]
    for (const [name, step] of steps) {
      try { await step() } catch (e) { console.error(`syncDeadlines (${name}) —`, e) }
    }
  } catch (e) {
    console.error('syncDeadlines —', e)
  }
}

/** Plafond dépassé après une signature (cap_signing_watch) : rappel 2 jours avant la date limite. */
async function sendCapReminders(saisonId: number): Promise<void> {
  const admin = createAdminClient()
  const now = Date.now()
  const { data: flagged } = await admin
    .from('cap_signing_watch')
    .select('id, pooler_id, deadline_at, players (first_name, last_name)')
    .eq('pool_season_id', saisonId)
    .eq('status', 'flagged')
    .is('reminder_sent_at', null)
  for (const w of flagged ?? []) {
    if (!w.deadline_at) continue
    const deadlineMs = new Date(w.deadline_at).getTime()
    if (deadlineMs <= now || deadlineMs - now > CAP_REMINDER_DAYS_BEFORE * 86_400_000) continue
    const { data: marked } = await admin.from('cap_signing_watch')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', w.id).eq('status', 'flagged').is('reminder_sent_at', null).select('id')
    if (!marked || marked.length === 0) continue
    const p = w.players as unknown as { first_name: string; last_name: string } | null
    const label = p ? `${p.first_name} ${p.last_name}` : 'un joueur'
    const day = new Date(w.deadline_at).toLocaleDateString('fr-CA', { timeZone: 'America/Toronto' })
    const body = `Rappel : depuis la signature de ${label}, ta masse salariale dépasse le plafond. Ajuste ton alignement d'ici le ${day}, sinon l'admin pourra libérer le joueur.`
    const poolerId = w.pooler_id as string
    after(() => Promise.all([
      sendPushToUsers([poolerId], { title: 'Cap Crunch — Plafond dépassé', body, url: '/gestion-effectifs' }).catch(() => {}),
      sendEmailToIds([poolerId], {
        subject: 'Cap Crunch — Plafond dépassé',
        html: `<p>${body}</p>${emailLinkHtml('/gestion-effectifs')}`,
      }).catch(() => {}),
    ]))
  }
}
