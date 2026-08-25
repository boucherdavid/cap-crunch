import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminPlanificationManager from './AdminPlanificationManager'

export const metadata = { title: 'Planification — Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminPlanificationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) redirect('/admin')

  const { data: settings } = await supabase
    .from('app_settings')
    .select('nav_planification_only')
    .eq('id', 1)
    .maybeSingle()

  const { data: poll } = await supabase
    .from('meeting_polls')
    .select('id, title')
    .eq('is_active', true)
    .maybeSingle()

  const { data: dates } = poll
    ? await supabase.from('meeting_poll_dates').select('id, candidate_date').eq('poll_id', poll.id).order('candidate_date')
    : { data: [] as { id: number; candidate_date: string }[] }

  return (
    <AdminPlanificationManager
      poll={poll ?? null}
      dates={dates ?? []}
      navPlanificationOnly={settings?.nav_planification_only ?? false}
    />
  )
}
