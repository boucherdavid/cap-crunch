/**
 * Lancement d'une tâche GitHub Actions par l'API (`workflow_dispatch`) — même jeton que la copie
 * de secours (`GITHUB_WORKFLOW_TOKEN`, voir lib/backupTool.ts). Un lancement par l'API démarre en
 * quelques secondes, contrairement aux tâches planifiées de GitHub, retardées de 3 à 8 heures
 * pour ce dépôt (constat du 2026-10-06).
 */
const REPO = 'boucherdavid/cap-crunch'

export type WorkflowRunStatus = {
  status: 'queued' | 'in_progress' | 'completed' | 'unknown'
  conclusion: string | null   // 'success' | 'failure' | ... quand status === 'completed'
  startedAt: string | null
  url: string | null
}

export function canDispatchWorkflows(): boolean {
  return !!process.env.GITHUB_WORKFLOW_TOKEN
}

/** Dernière exécution d'une tâche (le dépôt est public : fonctionne même sans jeton). */
export async function fetchLastWorkflowRun(workflowFile: string): Promise<WorkflowRunStatus> {
  const unknown: WorkflowRunStatus = { status: 'unknown', conclusion: null, startedAt: null, url: null }
  try {
    const token = process.env.GITHUB_WORKFLOW_TOKEN
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflowFile}/runs?per_page=1`, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: 'no-store',
    })
    if (!res.ok) return unknown
    const data = (await res.json()) as {
      workflow_runs?: { status: string; conclusion: string | null; run_started_at: string | null; html_url: string }[]
    }
    const run = data.workflow_runs?.[0]
    if (!run) return unknown
    const status = run.status === 'completed' ? 'completed' : run.status === 'in_progress' ? 'in_progress' : 'queued'
    return { status, conclusion: run.conclusion, startedAt: run.run_started_at, url: run.html_url }
  } catch {
    return unknown
  }
}

export async function dispatchWorkflow(workflowFile: string): Promise<{ error?: string }> {
  const token = process.env.GITHUB_WORKFLOW_TOKEN
  if (!token) return { error: 'GITHUB_WORKFLOW_TOKEN absent.' }
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflowFile}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
      cache: 'no-store',
    })
    return res.status === 204 ? {} : { error: `GitHub a refusé la demande (${res.status}).` }
  } catch {
    return { error: 'GitHub est injoignable.' }
  }
}
