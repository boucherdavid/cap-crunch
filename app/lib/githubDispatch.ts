/**
 * Lancement d'une tâche GitHub Actions par l'API (`workflow_dispatch`) — même jeton que la copie
 * de secours (`GITHUB_WORKFLOW_TOKEN`, voir lib/backupTool.ts). Un lancement par l'API démarre en
 * quelques secondes, contrairement aux tâches planifiées de GitHub, retardées de 3 à 8 heures
 * pour ce dépôt (constat du 2026-10-06).
 */
const REPO = 'boucherdavid/cap-crunch'

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
