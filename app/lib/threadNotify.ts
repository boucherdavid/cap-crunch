import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers, type PushPayload } from '@/lib/push'
import { sendEmailToIds, type EmailPayload } from '@/lib/email'

// Notifie les admins + les poolers ayant déjà participé à un fil de commentaires (pas tous
// les poolers — évite le bruit sur des babillards à fort volume). `participantIds` vient de
// l'appelant (ex: pooler_id distincts des commentaires existants sur ce post/sondage).
export async function notifyThreadParticipants(
  participantIds: string[],
  excludeUserId: string,
  pushPayload: PushPayload,
  emailPayload: EmailPayload,
) {
  const supabase = createAdminClient()
  const { data: admins } = await supabase.from('poolers').select('id').eq('is_admin', true)

  const ids = Array.from(new Set([...(admins ?? []).map(a => a.id), ...participantIds]))
    .filter(id => id !== excludeUserId)
  if (ids.length === 0) return

  await Promise.all([
    sendPushToUsers(ids, pushPayload).catch(() => {}),
    sendEmailToIds(ids, emailPayload).catch(() => {}),
  ])
}
