import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PlanificationManager from './PlanificationManager'

export const metadata = { title: 'Planification' }
export const dynamic = 'force-dynamic'

export default async function PlanificationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('poolers').select('name, is_admin').eq('id', user.id).single()
  if (!me) redirect('/')

  const { data: poolers } = await supabase.from('poolers').select('id, name').order('name')

  const { data: poll } = await supabase
    .from('meeting_polls')
    .select('id, title')
    .eq('is_active', true)
    .maybeSingle()

  const [{ data: dates }, { data: responses }] = await Promise.all([
    poll
      ? supabase.from('meeting_poll_dates').select('id, candidate_date').eq('poll_id', poll.id).order('candidate_date')
      : Promise.resolve({ data: [] as { id: number; candidate_date: string }[] }),
    poll
      ? supabase.from('meeting_poll_responses').select('pooler_id, candidate_date').eq('poll_id', poll.id)
      : Promise.resolve({ data: [] as { pooler_id: string; candidate_date: string }[] }),
  ])

  return (
    <PlanificationManager
      me={{ id: user.id, name: me.name, isAdmin: me.is_admin }}
      poolers={poolers ?? []}
      poll={poll ?? null}
      dates={dates ?? []}
      responses={responses ?? []}
    />
  )
}
