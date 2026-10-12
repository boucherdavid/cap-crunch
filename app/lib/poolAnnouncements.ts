import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers } from '@/lib/push'
import { sendEmailToIds, escapeHtml } from '@/lib/email'
import { emailLinkHtml } from '@/lib/siteUrl'

// Annonce à tout le pool d'une signature d'agent libre ou d'un échange entre poolers (David,
// 2026-10-12) — push + courriel (selon notif_email) à tous les poolers, sauf ceux qui ont fait
// le mouvement (ils le savent déjà). Saison démarrée seulement : le repêchage des agents libres
// se suit en direct sur /repechage-agents-libres. Toujours appeler dans after().
export async function announceToPool(input: {
  title: string
  body: string
  excludeIds?: string[]
  url?: string
}): Promise<void> {
  const admin = createAdminClient()
  const exclude = new Set(input.excludeIds ?? [])
  const { data } = await admin.from('poolers').select('id')
  const ids = (data ?? []).map(p => p.id as string).filter(id => !exclude.has(id))
  if (ids.length === 0) return
  const url = input.url ?? '/journal-transactions'
  await Promise.all([
    sendPushToUsers(ids, { title: input.title, body: input.body, url }).catch(() => {}),
    sendEmailToIds(ids, {
      subject: input.title,
      html: `<p>${escapeHtml(input.body)}</p>${emailLinkHtml(url)}`,
    }).catch(() => {}),
  ])
}

// Noms des joueurs pour le texte des annonces.
export async function playerNames(playerIds: number[]): Promise<Map<number, string>> {
  if (playerIds.length === 0) return new Map()
  const admin = createAdminClient()
  const { data } = await admin.from('players').select('id, first_name, last_name').in('id', playerIds)
  return new Map((data ?? []).map(p => [p.id as number, `${p.first_name} ${p.last_name}`]))
}

export async function poolerName(poolerId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin.from('poolers').select('name').eq('id', poolerId).maybeSingle()
  return (data?.name as string | undefined) ?? 'Un pooler'
}
