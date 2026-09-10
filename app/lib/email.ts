import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? 'Cap Crunch <onboarding@resend.dev>'

export type EmailPayload = {
  subject: string
  html: string
}

async function sendToEmails(emails: string[], payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY absente — envoi ignoré.')
    return
  }
  if (emails.length === 0) {
    console.warn('[email] Aucun destinataire opt-in trouvé — envoi ignoré.')
    return
  }
  const resend = new Resend(apiKey)

  const results = await Promise.allSettled(
    emails.map(email =>
      resend.emails.send({ from: FROM_ADDRESS, to: email, subject: payload.subject, html: payload.html }),
    ),
  )
  // Le SDK Resend ne lance pas d'exception sur une erreur API (clé invalide, domaine non
  // vérifié, etc.) — il retourne { data, error } sans throw — donc on doit vérifier `error`
  // explicitement, pas seulement le statut de la promesse.
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[email] Échec réseau vers ${emails[i]} :`, r.reason)
    } else if (r.value.error) {
      console.error(`[email] Erreur Resend vers ${emails[i]} :`, r.value.error)
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
// seulement la logger — utile pour diagnostiquer en direct (RESEND_API_KEY absente/invalide,
// domaine d'envoi non vérifié, adresse "onboarding@resend.dev" limitée à l'email du compte
// Resend, etc.) sans avoir à aller fouiller les logs Vercel.
export async function sendTestEmail(toEmail: string): Promise<{ error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { error: 'RESEND_API_KEY absente des variables d\'environnement (ce déploiement).' }

  const resend = new Resend(apiKey)
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: 'Cap Crunch — Test de courriel',
      html: '<p>Les courriels fonctionnent correctement — ce message confirme que Resend est bien configuré pour cet environnement.</p>',
    })
    if (error) return { error: `Erreur Resend : ${error.message ?? JSON.stringify(error)}` }
    return {}
  } catch (e: unknown) {
    return { error: `Exception : ${String(e)}` }
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
