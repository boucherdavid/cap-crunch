'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { sendPushToUser } from '@/lib/push'
import { sendEmailToIds, escapeHtml } from '@/lib/email'
import { emailLinkHtml } from '@/lib/siteUrl'

async function ensureAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.', supabase: null }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.', supabase: null }
  return { error: null, supabase }
}

// `notify` (David, 2026-10-11) : en marquant une demande « traité », avise le pooler par push et
// courriel, avec la réponse facultative de l'admin. La réponse n'est pas conservée.
export async function updateFeedbackStatusAction(
  id: number,
  status: 'nouveau' | 'traité' | 'archivé',
  notify?: { reply: string },
): Promise<{ error?: string }> {
  const { error: authError, supabase } = await ensureAdmin()
  if (authError || !supabase) return { error: authError ?? 'Erreur.' }

  const { data: fb, error } = await supabase.from('feedback').update({ status }).eq('id', id)
    .select('pooler_id, description').single()
  if (error) return { error: error.message }

  if (notify && status === 'traité' && fb?.pooler_id) {
    const poolerId = fb.pooler_id as string
    const excerpt = (fb.description as string).trim().slice(0, 100) + ((fb.description as string).trim().length > 100 ? '…' : '')
    const reply = notify.reply.trim().slice(0, 1000)
    after(() => Promise.all([
      sendPushToUser(poolerId, {
        title: 'Cap Crunch — Ta demande a été traitée',
        body: reply ? reply.slice(0, 140) : `« ${excerpt.slice(0, 80)} »`,
        url: '/signaler',
      }).catch(() => {}),
      sendEmailToIds([poolerId], {
        subject: 'Cap Crunch — Ta demande a été traitée',
        html: `<p>Ta demande a été traitée :</p>
               <blockquote style="border-left:3px solid #ccc;margin:8px 0;padding-left:8px;color:#666">${escapeHtml(excerpt)}</blockquote>
               ${reply ? `<p><strong>Réponse de l'admin :</strong></p><p>${escapeHtml(reply).replace(/\n/g, '<br>')}</p>` : ''}
               <p>Merci de nous aider à améliorer Cap Crunch !</p>${emailLinkHtml('/signaler')}`,
      }).catch(() => {}),
    ]))
  }

  revalidatePath('/admin/feedback')
  return {}
}

export async function deleteFeedbackAction(id: number): Promise<{ error?: string }> {
  const { error: authError, supabase } = await ensureAdmin()
  if (authError || !supabase) return { error: authError ?? 'Erreur.' }

  const { error } = await supabase.from('feedback').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/feedback')
  return {}
}
