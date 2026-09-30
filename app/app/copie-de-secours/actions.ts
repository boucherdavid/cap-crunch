'use server'

import { createClient } from '@/lib/supabase/server'
import { fetchLastBackupRun, triggerBackupWorkflow, type BackupRunStatus } from '@/lib/backupTool'

async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Non authentifié.'
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return 'Accès refusé.'
  return null
}

export async function triggerBackupAction(): Promise<{ error?: string }> {
  const denied = await requireAdmin()
  if (denied) return { error: denied }
  return triggerBackupWorkflow()
}

export async function getBackupRunAction(): Promise<BackupRunStatus> {
  return fetchLastBackupRun()
}
