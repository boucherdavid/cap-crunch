import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CompteForm from './CompteForm'

export const metadata = { title: 'Mon compte' }
export const dynamic = 'force-dynamic'

export default async function ComptePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pooler } = await supabase
    .from('poolers')
    .select('name, notif_email')
    .eq('id', user.id)
    .single()

  if (!pooler) redirect('/')

  return (
    <CompteForm
      profile={{
        name: pooler.name,
        email: user.email ?? '',
        notif_email: pooler.notif_email ?? true,
      }}
    />
  )
}
