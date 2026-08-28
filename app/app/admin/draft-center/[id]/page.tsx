import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import EditProspectForm from './EditProspectForm'

export default async function EditDraftProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pooler } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!pooler?.is_admin) redirect('/')

  const { data: prospect } = await supabase
    .from('draft_prospects')
    .select('*, draft_prospect_rankings(source, rank, source_url)')
    .eq('id', id)
    .single()

  if (!prospect) notFound()

  return (
    <div>
      <Link href="/admin/donnees?tab=prospects" className="text-sm text-gray-400 hover:text-gray-600">{'← Classement des prospects'}</Link>
      <h1 className="text-2xl font-bold text-gray-800 mt-1 mb-6">{prospect.first_name} {prospect.last_name}</h1>
      <EditProspectForm prospect={prospect} />
    </div>
  )
}
