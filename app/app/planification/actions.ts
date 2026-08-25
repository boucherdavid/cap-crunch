'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' } as const
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' } as const
  return { supabase, user } as const
}

export async function createPollAction(title: string): Promise<{ error?: string }> {
  const check = await requireAdmin()
  if ('error' in check) return check
  const { supabase } = check

  await supabase.from('meeting_polls').update({ is_active: false }).eq('is_active', true)

  const { error } = await supabase.from('meeting_polls').insert({ title, is_active: true })
  if (error) return { error: error.message }

  revalidatePath('/planification')
  return {}
}

export async function addCandidateDateAction(pollId: number, date: string): Promise<{ error?: string }> {
  const check = await requireAdmin()
  if ('error' in check) return check
  const { supabase } = check

  const { error } = await supabase
    .from('meeting_poll_dates')
    .insert({ poll_id: pollId, candidate_date: date })
  if (error && error.code !== '23505') return { error: error.message }

  revalidatePath('/planification')
  return {}
}

export async function removeCandidateDateAction(dateId: number, pollId: number, date: string): Promise<{ error?: string }> {
  const check = await requireAdmin()
  if ('error' in check) return check
  const { supabase } = check

  const { error } = await supabase.from('meeting_poll_dates').delete().eq('id', dateId)
  if (error) return { error: error.message }

  // Nettoie les réponses déjà soumises pour cette date (sinon elles restent orphelines —
  // meeting_poll_responses ne référence pas meeting_poll_dates par clé étrangère).
  await supabase
    .from('meeting_poll_responses')
    .delete()
    .eq('poll_id', pollId)
    .eq('candidate_date', date)

  revalidatePath('/planification')
  return {}
}

export async function resetPollAction(pollId: number): Promise<{ error?: string }> {
  const check = await requireAdmin()
  if ('error' in check) return check
  const { supabase } = check

  const { error } = await supabase.from('meeting_polls').delete().eq('id', pollId)
  if (error) return { error: error.message }

  revalidatePath('/planification')
  return {}
}

export async function setNavPlanificationOnlyAction(enabled: boolean): Promise<{ error?: string }> {
  const check = await requireAdmin()
  if ('error' in check) return check
  const { supabase } = check

  const { error } = await supabase
    .from('app_settings')
    .update({ nav_planification_only: enabled })
    .eq('id', 1)
  if (error) return { error: error.message }

  // Affecte la Navbar sur tout le site (elle vient du layout racine), pas juste /planification
  revalidatePath('/', 'layout')
  return {}
}

export async function submitAvailabilityAction(
  pollId: number,
  selectedDates: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { data: pooler } = await supabase.from('poolers').select('name').eq('id', user.id).single()

  const { error: delError } = await supabase
    .from('meeting_poll_responses')
    .delete()
    .eq('poll_id', pollId)
    .eq('pooler_id', user.id)
  if (delError) return { error: delError.message }

  if (selectedDates.length > 0) {
    const { error: insError } = await supabase.from('meeting_poll_responses').insert(
      selectedDates.map(date => ({ poll_id: pollId, pooler_id: user.id, candidate_date: date })),
    )
    if (insError) return { error: insError.message }
  }

  const { sendPushToAdmins } = await import('@/lib/push')
  sendPushToAdmins({
    title: 'Planification — Nouvelle réponse',
    body: selectedDates.length > 0
      ? `${pooler?.name ?? 'Un pooler'} a soumis ses disponibilités (${selectedDates.length} date${selectedDates.length > 1 ? 's' : ''}).`
      : `${pooler?.name ?? 'Un pooler'} n'est disponible à aucune des dates proposées.`,
    url: '/planification',
  }, user.id).catch(() => {})

  revalidatePath('/planification')
  return {}
}

export async function addCommentAction(pollId: number, body: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const trimmed = body.trim()
  if (!trimmed) return { error: 'Le commentaire est vide.' }

  const { data: pooler } = await supabase.from('poolers').select('name').eq('id', user.id).single()

  const { error } = await supabase.from('meeting_poll_comments').insert({
    poll_id: pollId,
    pooler_id: user.id,
    body: trimmed,
  })
  if (error) return { error: error.message }

  const { sendPushToAdmins } = await import('@/lib/push')
  sendPushToAdmins({
    title: 'Planification — Nouveau commentaire',
    body: `${pooler?.name ?? 'Un pooler'} : ${trimmed.slice(0, 120)}`,
    url: '/planification',
  }, user.id).catch(() => {})

  revalidatePath('/planification')
  return {}
}

export async function deleteCommentAction(commentId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { data: comment } = await supabase.from('meeting_poll_comments').select('pooler_id').eq('id', commentId).single()
  if (!comment) return { error: 'Commentaire introuvable.' }

  if (comment.pooler_id !== user.id) {
    const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
    if (!me?.is_admin) return { error: 'Accès refusé.' }
  }

  const { error } = await supabase.from('meeting_poll_comments').delete().eq('id', commentId)
  if (error) return { error: error.message }

  revalidatePath('/planification')
  return {}
}
