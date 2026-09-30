import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: pooler } = await supabase
    .from('poolers')
    .select('id, name, is_admin')
    .eq('id', user.id)
    .single()

  if (!pooler) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Ton compte n&apos;est pas encore lié à un pooler.</p>
        <p className="text-gray-400 text-sm mt-2">Contacte l&apos;administrateur du pool.</p>
      </div>
    )
  }

  redirect(`/poolers/${pooler.id}`)
}
