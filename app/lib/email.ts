import nodemailer from 'nodemailer'
import { createAdminClient } from '@/lib/supabase/admin'

// Envoi via SMTP Gmail (compte personnel de David) plutôt que Resend (David, 2026-09-10) —
// Resend en mode sandbox (aucun domaine vérifié) ne livrait qu'à l'adresse du propriétaire du
// compte Resend, ce qui rendait les notifications inutilisables pour les autres poolers ; David
// ne souhaite ni acheter ni gérer un domaine. Gmail permet un envoi SMTP simple via un "mot de
// passe d'application" (nécessite la validation en deux étapes), sans domaine à vérifier — le
// `from` doit obligatoirement être l'adresse Gmail authentifiée (contrainte Gmail, pas
// contournable sans un domaine "Send As" vérifié).
const GMAIL_USER = process.env.GMAIL_USER
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD
const FROM_ADDRESS = GMAIL_USER ? `Cap Crunch <${GMAIL_USER}>` : undefined

function getTransporter() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  })
}

export type EmailPayload = {
  subject: string
  html: string
}

async function sendToEmails(emails: string[], payload: EmailPayload) {
  const transporter = getTransporter()
  if (!transporter || !FROM_ADDRESS) {
    console.warn('[email] GMAIL_USER/GMAIL_APP_PASSWORD absents — envoi ignoré.')
    return
  }
  if (emails.length === 0) {
    console.warn('[email] Aucun destinataire opt-in trouvé — envoi ignoré.')
    return
  }

  const text = htmlToText(payload.html)
  const results = await Promise.allSettled(
    emails.map(email =>
      transporter.sendMail({ from: FROM_ADDRESS, to: email, subject: payload.subject, html: payload.html, text }),
    ),
  )
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[email] Échec d'envoi vers ${emails[i]} :`, r.reason)
    }
  })
}

// Poolers ayant activé notif_email — email récupéré via auth.admin (pas stocké sur poolers).
// `ids` restreint aux poolers donnés (ex: participants à un fil de commentaires) ; omis = tous.
async function optedInEmails(ids?: string[], excludeUserId?: string): Promise<string[]> {
  const supabase = createAdminClient()

  let query = supabase.from('poolers').select('id').eq('notif_email', true)
  if (ids) query = query.in('id', ids)
  const { data: poolers } = await query
  if (!poolers || poolers.length === 0) return []
  const optedIds = new Set(poolers.map(p => p.id).filter(id => id !== excludeUserId))
  if (optedIds.size === 0) return []

  const { data } = await supabase.auth.admin.listUsers()
  return (data?.users ?? [])
    .filter(u => optedIds.has(u.id) && !!u.email)
    .map(u => u.email as string)
}

export async function sendEmailToAll(payload: EmailPayload, excludeUserId?: string) {
  const emails = await optedInEmails(undefined, excludeUserId)
  await sendToEmails(emails, payload)
}

// Sous-ensemble explicite de poolers (ex: participants à un fil de commentaires).
export async function sendEmailToIds(ids: string[], payload: EmailPayload) {
  if (ids.length === 0) return
  const emails = await optedInEmails(ids)
  await sendToEmails(emails, payload)
}

// Envoi direct pour le bouton "Tester" de /compte (David, 2026-09-10) — contrairement à
// sendEmailToAll/sendEmailToIds, ne filtre pas sur notif_email (un test manuel doit fonctionner
// même si les alertes automatiques sont désactivées) et renvoie l'erreur réelle plutôt que de
// seulement la logger — utile pour diagnostiquer en direct (identifiants Gmail absents/invalides,
// etc.) sans avoir à aller fouiller les logs Vercel.
export async function sendTestEmail(toEmail: string): Promise<{ error?: string }> {
  const transporter = getTransporter()
  if (!transporter || !FROM_ADDRESS) {
    return { error: 'GMAIL_USER / GMAIL_APP_PASSWORD absents des variables d\'environnement (ce déploiement).' }
  }

  const html = '<p>Les courriels fonctionnent correctement — ce message confirme que l\'envoi est bien configuré pour cet environnement.</p>'
  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: 'Cap Crunch — Test de courriel',
      html,
      text: htmlToText(html),
    })
    return {}
  } catch (e: unknown) {
    return { error: `Erreur d'envoi : ${e instanceof Error ? e.message : String(e)}` }
  }
}

// Version texte brut à côté du HTML — un courriel HTML-only est un signal antispam classique.
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
