'use server'

import { createClient } from '@/lib/supabase/server'
import { getAppEnv } from '@/lib/appEnv'
import { dispatchWorkflow, fetchLastWorkflowRun, type WorkflowRunStatus } from '@/lib/githubDispatch'

const WORKFLOW = 'sync_prod_to_staging.yml'

/**
 * Bouton « Copier la prod vers staging » (David, 2026-10-06) — lance la tâche GitHub qui exécute
 * python_script/sync_prod_to_staging.py. Refusé en prod par principe : la tâche n'écrit que dans
 * staging, mais le bouton n'a rien à faire sur le site des poolers.
 */
export async function triggerStagingSyncAction(): Promise<{ error?: string }> {
  if (getAppEnv() === 'production') return { error: 'Indisponible en production.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }
  return dispatchWorkflow(WORKFLOW)
}

export async function getStagingSyncRunAction(): Promise<WorkflowRunStatus> {
  return fetchLastWorkflowRun(WORKFLOW)
}
