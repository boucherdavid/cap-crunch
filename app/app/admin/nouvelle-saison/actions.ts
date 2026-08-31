'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { checkSeasonConformity, type ConformityIssue } from '@/lib/seasonConformity'

export async function previewConformityAction(
  saisonId: number,
): Promise<{ error?: string; issues: ConformityIssue[]; totalPoolers: number }> {
  const supabase = await createClient()
  return checkSeasonConformity(supabase, saisonId)
}

export async function demarrerSaisonAction(saisonId: number): Promise<{
  error?: string
  issues?: ConformityIssue[]
  summary?: string
}> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await userClient.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const db = createAdminClient()

  const { data: saison } = await db
    .from('pool_seasons')
    .select('season_started, saison_start_date')
    .eq('id', saisonId)
    .single()
  if (!saison) return { error: 'Saison introuvable.' }
  if (saison.season_started) return { error: 'Cette saison est déjà démarrée.' }
  if (!saison.saison_start_date) {
    return { error: "Aucune date de début de saison définie (Configuration → Pool Saison) — requis avant de démarrer." }
  }

  const { issues, totalPoolers } = await checkSeasonConformity(db, saisonId)
  if (issues.length > 0) return { issues }

  const newAddedAt = `${saison.saison_start_date}T12:00:00Z`

  // Nettoyage défensif : un roster_change_log antérieur à la nouvelle added_at ferait planter
  // silencieusement statusAt()/activeSegments() dans buildStandings() (segment ignoré, joueur
  // à 0 point sans erreur visible) — voir app/lib/standings.ts.
  const { error: cleanupErr } = await db
    .from('roster_change_log')
    .delete()
    .eq('pool_season_id', saisonId)
    .lt('changed_at', newAddedAt)
  if (cleanupErr) return { error: cleanupErr.message }

  const { error: updateErr, count } = await db
    .from('pooler_rosters')
    .update({ added_at: newAddedAt }, { count: 'exact' })
    .eq('pool_season_id', saisonId)
    .eq('is_active', true)
  if (updateErr) return { error: updateErr.message }

  const { error: flagErr } = await db
    .from('pool_seasons')
    .update({ season_started: true })
    .eq('id', saisonId)
  if (flagErr) return { error: flagErr.message }

  revalidatePath('/poolers')
  revalidatePath('/poolers/[id]', 'page')
  revalidatePath('/classement')
  revalidatePath('/dashboard')
  revalidatePath('/gestion-effectifs')
  revalidatePath('/admin/nouvelle-saison')

  return { summary: `Saison démarrée — ${totalPoolers} pooler(s) validés, ${count ?? 0} ligne(s) d'alignement datées au ${saison.saison_start_date}.` }
}
