import { createClient } from '@/lib/supabase/server'
import { fetchLtirSettings } from '@/lib/injuries'
import AideTabs from './AideTabs'

export const metadata = { title: 'Aide — Cap Crunch' }

export default async function AidePage() {
  const supabase = await createClient()
  const [ltirSettings, { data: saison }] = await Promise.all([
    fetchLtirSettings(supabase),
    supabase
      .from('pool_seasons')
      .select('max_signatures_al, max_signatures_ltir')
      .eq('is_active', true)
      .eq('is_playoff', false)
      .maybeSingle(),
  ])
  // Mêmes replis que Gestion d'effectifs (10 et 2) si la saison n'a pas de valeur réglée.
  const signingLimits = saison
    ? { al: saison.max_signatures_al ?? 10, ltir: saison.max_signatures_ltir ?? 2 }
    : null
  return <AideTabs ltirSettings={ltirSettings} signingLimits={signingLimits} />
}
