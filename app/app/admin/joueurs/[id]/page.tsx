import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ModifierJoueurPage({ params }: { params: Promise<{ id: string }> }) {
  await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pooler } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!pooler?.is_admin) redirect('/')

  redirect('/admin/donnees?tab=pipeline')
}