import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers, type PushPayload } from '@/lib/push'
import { sendEmailToIds, type EmailPayload } from '@/lib/email'

// Notifie les admins + les poolers ayant déjà participé à un fil de commentaires (pas tous
// les poolers — évite le bruit sur des babillards à fort volume). `participantIds` vient de
// l'appelant (ex: pooler_id distincts des commentaires existants sur ce post/sondage).
//
// Enveloppé dans after() (David, 2026-09-12) : un push/courriel envoyé sans attendre
// (fire-and-forget classique) risque d'être coupé en plein vol sur Vercel — la fonction
// serverless peut être arrêtée dès que la réponse est renvoyée au navigateur, avant que
// l'envoi réel (surtout le courriel SMTP, plus lent) ait eu le temps de se terminer. Repéré
// après qu'un commentaire de planification n'ait généré ni push ni courriel pour un admin qui
// avait pourtant les deux activés. after() garde la fonction vivante jusqu'à la fin de ce
// callback, sans faire attendre l'utilisateur (la réponse HTTP part quand même immédiatement).
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

  after(() => Promise.all([
    sendPushToUsers(ids, pushPayload).catch(() => {}),
    sendEmailToIds(ids, emailPayload).catch(() => {}),
  ]))
}
