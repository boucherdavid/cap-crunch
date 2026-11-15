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

// Redirection de test (David, 2026-10-05) — définie seulement dans le projet Vercel de staging :
// tous les courriels partent vers cette adresse au lieu des vrais destinataires (les comptes
// `@staging.test` n'existent pas), avec les destinataires prévus en tête de l'objet.
// Jamais définie en prod.
const REDIRECT_TO = process.env.EMAIL_REDIRECT_TO?.trim() || null

async function sendRedirected(ids: string[], payload: EmailPayload) {
  const { data } = await createAdminClient().from('poolers').select('name').in('id', ids)
  const names = (data ?? []).map(p => p.name as string)
  if (names.length === 0) return
  await sendToEmails([REDIRECT_TO!], { ...payload, subject: `[Test → ${names.join(', ')}] ${payload.subject}` })
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
    console.warn('[email] Aucune adresse trouvée pour les destinataires — envoi ignoré.')
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

// Règle unique des courriels (David, 2026-11-15) : un pooler reçoit un courriel seulement s'il
// n'a la notification push sur aucun appareil (aucune ligne push_subscriptions). Avec la push, il
// reçoit la push seule. La case « courriels » de /compte (poolers.notif_email) n'est plus lue.
// Chaque envoi de courriel de l'app accompagne une push aux mêmes destinataires : personne ne
// reste sans avis. `ids` omis = tous les poolers.
async function recipientsWithoutPush(ids?: string[], excludeUserId?: string): Promise<string[]> {
  const supabase = createAdminClient()
  let poolersQuery = supabase.from('poolers').select('id')
  let subsQuery = supabase.from('push_subscriptions').select('user_id')
  if (ids) {
    poolersQuery = poolersQuery.in('id', ids)
    subsQuery = subsQuery.in('user_id', ids)
  }
  const [{ data: poolers }, { data: subs }] = await Promise.all([poolersQuery, subsQuery])
  const withPush = new Set((subs ?? []).map(s => s.user_id as string))
  return (poolers ?? []).map(p => p.id as string).filter(id => id !== excludeUserId && !withPush.has(id))
}

async function emailsOf(ids: string[]): Promise<string[]> {
  const wanted = new Set(ids)
  const { data } = await createAdminClient().auth.admin.listUsers()
  return (data?.users ?? [])
    .filter(u => wanted.has(u.id) && !!u.email)
    .map(u => u.email as string)
}

async function sendToPoolers(ids: string[], payload: EmailPayload) {
  if (ids.length === 0) return
  if (REDIRECT_TO) return sendRedirected(ids, payload)
  await sendToEmails(await emailsOf(ids), payload)
}

export async function sendEmailToAll(payload: EmailPayload, excludeUserId?: string) {
  await sendToPoolers(await recipientsWithoutPush(undefined, excludeUserId), payload)
}

// Sous-ensemble explicite de poolers (ex: participants à un fil de commentaires).
export async function sendEmailToIds(ids: string[], payload: EmailPayload) {
  if (ids.length === 0) return
  await sendToPoolers(await recipientsWithoutPush(ids), payload)
}

// Envoi direct pour le bouton "Tester" de /compte (David, 2026-09-10) — contrairement à
// sendEmailToAll/sendEmailToIds, envoie même si le pooler a la push (un test manuel doit fonctionner) et renvoie l'erreur réelle plutôt que de
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
      // Redirection de test : même règle que les envois automatiques (voir REDIRECT_TO).
      to: REDIRECT_TO ?? toEmail,
      subject: REDIRECT_TO ? `[Test → ${toEmail}] Cap Crunch — Test de courriel` : 'Cap Crunch — Test de courriel',
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
    // Un lien garde son adresse dans la version texte : « Voir sur Cap Crunch : https://… »
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 : $1')
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
