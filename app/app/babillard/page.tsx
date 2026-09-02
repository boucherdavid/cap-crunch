import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BabillardManager from './BabillardManager'

export const metadata = { title: 'Babillard' }
export const dynamic = 'force-dynamic'

export default async function BabillardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('poolers').select('name, is_admin').eq('id', user.id).single()
  if (!me) redirect('/')

  const { data: poolers } = await supabase.from('poolers').select('id, name').order('name')

  const { data: posts } = await supabase
    .from('bulletin_posts')
    .select('id, author_id, title, body, created_at')
    .order('created_at', { ascending: false })

  const postIds = (posts ?? []).map(p => p.id)
  const { data: comments } = postIds.length > 0
    ? await supabase
        .from('bulletin_comments')
        .select('id, post_id, pooler_id, body, created_at')
        .in('post_id', postIds)
        .order('created_at', { ascending: true })
    : { data: [] as { id: number; post_id: number; pooler_id: string; body: string; created_at: string }[] }

  return (
    <BabillardManager
      me={{ id: user.id, name: me.name, isAdmin: me.is_admin }}
      poolers={poolers ?? []}
      posts={posts ?? []}
      comments={comments ?? []}
    />
  )
}
