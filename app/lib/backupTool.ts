// Copie de secours hors ligne (backup/pool_backup.html) — David, 2026-09-30.
//
// Le fichier est généré par python_script/generate_backup_tool.py dans GitHub Actions
// (.github/workflows/backup_tool.yml, chaque dimanche + déclenchement manuel) et commité dans le
// dépôt public : l'app va le chercher directement sur GitHub plutôt que de le stocker ailleurs.
// Il ne contient que des données déjà publiques dans le dépôt (noms des poolers, alignements,
// contrats) — aucun courriel ni identifiant.
//
// Le déclenchement manuel passe par l'API GitHub (workflow_dispatch) et exige un jeton :
// GITHUB_WORKFLOW_TOKEN (jeton « fine-grained » limité à ce dépôt, permission Actions en
// lecture/écriture), à définir dans les variables d'environnement Vercel. Sans lui, la lecture
// fonctionne quand même (dépôt public), mais le bouton admin est désactivé.

const REPO = 'boucherdavid/cap-crunch'
const WORKFLOW_FILE = 'backup_tool.yml'
const FILE_PATH = 'backup/pool_backup.html'
const API = 'https://api.github.com'

export type BackupRunStatus = {
  status: 'queued' | 'in_progress' | 'completed' | 'unknown'
  conclusion: string | null   // 'success' | 'failure' | ... quand status === 'completed'
  startedAt: string | null
  url: string | null
}

function headers(accept = 'application/vnd.github+json'): HeadersInit {
  const h: Record<string, string> = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' }
  const token = process.env.GITHUB_WORKFLOW_TOKEN
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

export function canTriggerBackup(): boolean {
  return !!process.env.GITHUB_WORKFLOW_TOKEN
}

/** Contenu HTML du dernier backup — via l'API contents plutôt que raw.githubusercontent.com,
 * dont le cache CDN peut servir une version vieille de quelques minutes juste après une
 * régénération manuelle. */
export async function fetchBackupHtml(): Promise<string | null> {
  try {
    const res = await fetch(`${API}/repos/${REPO}/contents/${FILE_PATH}?ref=main`, {
      headers: headers('application/vnd.github.raw'),
      cache: 'no-store',
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** Date du dernier commit du fichier = dernière génération qui a réellement changé son contenu. */
export async function fetchBackupUpdatedAt(): Promise<string | null> {
  try {
    const res = await fetch(`${API}/repos/${REPO}/commits?path=${FILE_PATH}&sha=main&per_page=1`, {
      headers: headers(),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { commit?: { committer?: { date?: string } } }[]
    return data[0]?.commit?.committer?.date ?? null
  } catch {
    return null
  }
}

/** Dernière exécution de la tâche GitHub (planifiée ou manuelle). */
export async function fetchLastBackupRun(): Promise<BackupRunStatus> {
  try {
    const res = await fetch(`${API}/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`, {
      headers: headers(),
      cache: 'no-store',
    })
    if (!res.ok) return { status: 'unknown', conclusion: null, startedAt: null, url: null }
    const data = (await res.json()) as {
      workflow_runs?: { status: string; conclusion: string | null; run_started_at: string | null; html_url: string }[]
    }
    const run = data.workflow_runs?.[0]
    if (!run) return { status: 'unknown', conclusion: null, startedAt: null, url: null }
    const status = run.status === 'completed' ? 'completed' : run.status === 'in_progress' ? 'in_progress' : 'queued'
    return { status, conclusion: run.conclusion, startedAt: run.run_started_at, url: run.html_url }
  } catch {
    return { status: 'unknown', conclusion: null, startedAt: null, url: null }
  }
}

/** Lance la tâche GitHub sur main (même tâche que la génération du dimanche). */
export async function triggerBackupWorkflow(): Promise<{ error?: string }> {
  if (!canTriggerBackup()) return { error: 'Jeton GitHub absent (GITHUB_WORKFLOW_TOKEN) — impossible de lancer la génération.' }
  try {
    const res = await fetch(`${API}/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }),
      cache: 'no-store',
    })
    if (res.status === 204) return {}
    return { error: `GitHub a refusé la demande (${res.status}).` }
  } catch {
    return { error: 'GitHub est injoignable pour le moment — réessaie plus tard.' }
  }
}
