'use server'

import { createClient } from '@/lib/supabase/server'
import { DATA_UPDATES } from '@/lib/dataUpdates'
import { dispatchWorkflow, fetchLastWorkflowRun, type WorkflowRunStatus } from '@/lib/githubDispatch'

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  return !!me?.is_admin
}

/** Lance une des mises à jour de DATA_UPDATES (liste blanche) — admin seulement. */
export async function triggerDataUpdateAction(workflow: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Accès refusé.' }
  if (!DATA_UPDATES.some(u => u.workflow === workflow)) return { error: 'Mise à jour inconnue.' }
  return dispatchWorkflow(workflow)
}

/** Dernière exécution de chaque mise à jour, par nom de tâche. */
export async function getDataUpdateRunsAction(): Promise<Record<string, WorkflowRunStatus>> {
  if (!(await isAdmin())) return {}
  const runs = await Promise.all(DATA_UPDATES.map(u => fetchLastWorkflowRun(u.workflow)))
  return Object.fromEntries(DATA_UPDATES.map((u, i) => [u.workflow, runs[i]]))
}
