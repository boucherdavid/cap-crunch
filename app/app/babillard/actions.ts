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

export async function createPostAction(title: string, body: string): Promise<{ error?: string }> {
  const check = await requireAdmin()
  if ('error' in check) return check
  const { supabase, user } = check

  const trimmedTitle = title.trim()
  const trimmedBody = body.trim()
  if (!trimmedTitle) return { error: 'Le titre est vide.' }
  if (!trimmedBody) return { error: 'Le message est vide.' }

  const { error } = await supabase.from('bulletin_posts').insert({
    author_id: user.id,
    title: trimmedTitle,
    body: trimmedBody,
  })
  if (error) return { error: error.message }

  const { data: author } = await supabase.from('poolers').select('name').eq('id', user.id).single()

  const { sendPushToAll } = await import('@/lib/push')
  sendPushToAll({
    title: `Babillard — ${trimmedTitle}`,
    body: trimmedBody.slice(0, 150),
    url: '/babillard',
  }).catch(() => {})

  const { sendEmailToAll, escapeHtml } = await import('@/lib/email')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  sendEmailToAll({
    subject: `Babillard — ${trimmedTitle}`,
    html: `
      <p>Publié par <strong>${escapeHtml(author?.name ?? 'Admin')}</strong></p>
      <p>${escapeHtml(trimmedBody).replace(/\n/g, '<br>')}</p>
      <p><a href="${siteUrl}/babillard">Voir sur Cap Crunch</a></p>
    `,
  }).catch(() => {})

  revalidatePath('/babillard')
  revalidatePath('/admin/communaute')
  return {}
}

export async function deletePostAction(postId: number): Promise<{ error?: string }> {
  const check = await requireAdmin()
  if ('error' in check) return check
  const { supabase } = check

  const { error } = await supabase.from('bulletin_posts').delete().eq('id', postId)
  if (error) return { error: error.message }

  revalidatePath('/babillard')
  revalidatePath('/admin/communaute')
  return {}
}

export async function addCommentAction(postId: number, body: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const trimmed = body.trim()
  if (!trimmed) return { error: 'Le commentaire est vide.' }

  const { data: pooler } = await supabase.from('poolers').select('name').eq('id', user.id).single()

  const { data: priorComments } = await supabase
    .from('bulletin_comments')
    .select('pooler_id')
    .eq('post_id', postId)

  const { error } = await supabase.from('bulletin_comments').insert({
    post_id: postId,
    pooler_id: user.id,
    body: trimmed,
  })
  if (error) return { error: error.message }

  const { escapeHtml } = await import('@/lib/email')
  const { notifyThreadParticipants } = await import('@/lib/threadNotify')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const participantIds = [...new Set((priorComments ?? []).map(c => c.pooler_id as string))]
  notifyThreadParticipants(
    participantIds,
    user.id,
    {
      title: 'Babillard — Nouveau commentaire',
      body: `${pooler?.name ?? 'Un pooler'} : ${trimmed.slice(0, 120)}`,
      url: '/babillard',
    },
    {
      subject: 'Babillard — Nouveau commentaire',
      html: `
        <p><strong>${escapeHtml(pooler?.name ?? 'Un pooler')}</strong> a commenté :</p>
        <p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>
        <p><a href="${siteUrl}/babillard">Voir sur Cap Crunch</a></p>
      `,
    },
  ).catch(() => {})

  revalidatePath('/babillard')
  return {}
}

export async function deleteCommentAction(commentId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { data: comment } = await supabase.from('bulletin_comments').select('pooler_id').eq('id', commentId).single()
  if (!comment) return { error: 'Commentaire introuvable.' }

  if (comment.pooler_id !== user.id) {
    const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
    if (!me?.is_admin) return { error: 'Accès refusé.' }
  }

  const { error } = await supabase.from('bulletin_comments').delete().eq('id', commentId)
  if (error) return { error: error.message }

  revalidatePath('/babillard')
  return {}
}
