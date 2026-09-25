import { createClient } from '@/lib/supabase/server'
import { fetchLtirSettings } from '@/lib/injuries'
import AideTabs from './AideTabs'

export const metadata = { title: 'Aide — Cap Crunch' }

export default async function AidePage() {
  const supabase = await createClient()
  const ltirSettings = await fetchLtirSettings(supabase)
  return <AideTabs ltirSettings={ltirSettings} />
}
