import { createClient } from '@/lib/supabase/server'
import { getLiveNight } from '@/lib/liveNight'
import LiveNightDetail from './LiveNightDetail'

export const metadata = { title: 'En direct' }
export const dynamic = 'force-dynamic'

export default async function EnDirectPage() {
  const supabase = await createClient()
  const [{ data: { user } }, night] = await Promise.all([supabase.auth.getUser(), getLiveNight()])
  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-6 space-y-5">
      <LiveNightDetail initial={night} myId={user?.id ?? null} />
    </div>
  )
}
