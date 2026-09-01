'use server'

import { createClient } from '@/lib/supabase/server'
import { sendPushToAdmins } from '@/lib/push'

export async function submitFeedbackAction(
  type: string,
  description: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  if (!description.trim()) return { error: 'La description est requise.' }
  if (!['bug', 'suggestion', 'autre'].includes(type)) return { error: 'Type invalide.' }

  const { data: pooler } = await supabase.from('poolers').select('name').eq('id', user.id).single()

  const { error } = await supabase.from('feedback').insert({
    pooler_id: user.id,
    type,
    description: description.trim(),
  })

  if (error) return { error: 'Erreur lors de l\'envoi. Réessayez.' }

  const TYPE_LABEL: Record<string, string> = { bug: 'Bug', suggestion: 'Suggestion', autre: 'Commentaire' }
  sendPushToAdmins({
    title: `Cap Crunch — ${TYPE_LABEL[type] ?? 'Retour'}`,
    body:  `${pooler?.name ?? 'Un pooler'} a soumis un retour : ${description.trim().slice(0, 80)}${description.length > 80 ? '…' : ''}`,
    url:   '/admin/communaute?tab=communication',
  }).catch(() => {})

  return {}
}
