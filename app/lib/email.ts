import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? 'Cap Crunch <onboarding@resend.dev>'

export type EmailPayload = {
  subject: string
  html: string
}

async function sendToEmails(emails: string[], payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || emails.length === 0) return
  const resend = new Resend(apiKey)

  await Promise.allSettled(
    emails.map(email =>
      resend.emails.send({ from: FROM_ADDRESS, to: email, subject: payload.subject, html: payload.html }),
    ),
  )
}

// Poolers ayant activé notif_email — email récupéré via auth.admin (pas stocké sur poolers).
async function optedInEmails(excludeUserId?: string): Promise<string[]> {
  const supabase = createAdminClient()

  const { data: poolers } = await supabase.from('poolers').select('id').eq('notif_email', true)
  if (!poolers || poolers.length === 0) return []
  const ids = new Set(poolers.map(p => p.id).filter(id => id !== excludeUserId))
  if (ids.size === 0) return []

  const { data } = await supabase.auth.admin.listUsers()
  return (data?.users ?? [])
    .filter(u => ids.has(u.id) && !!u.email)
    .map(u => u.email as string)
}

export async function sendEmailToAll(payload: EmailPayload, excludeUserId?: string) {
  const emails = await optedInEmails(excludeUserId)
  await sendToEmails(emails, payload)
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
