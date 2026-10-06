'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkflowRunStatus } from '@/lib/githubDispatch'
import { getStagingSyncRunAction, triggerStagingSyncAction } from './staging-sync-actions'

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto' })
}

function statusLabel(run: WorkflowRunStatus): { text: string; cls: string } {
  if (run.status === 'queued') return { text: 'En attente de démarrage…', cls: 'text-amber-700' }
  if (run.status === 'in_progress') return { text: 'Copie en cours…', cls: 'text-amber-700' }
  if (run.status === 'completed' && run.conclusion === 'success') return { text: 'Réussie', cls: 'text-green-700' }
  if (run.status === 'completed') return { text: `Échec (${run.conclusion ?? 'inconnu'})`, cls: 'text-red-600' }
  return { text: 'Jamais lancée', cls: 'text-gray-500' }
}

/**
 * Panneau « Copier la prod vers staging » (David, 2026-10-06) — affiché seulement hors prod, sur
 * /admin/donnees. Même mécanique que le panneau de la copie de secours (BackupAdminPanel) : la
 * tâche tourne sur GitHub, on sonde son état toutes les 10 secondes.
 */
export default function StagingSyncPanel({ initialRun, canTrigger }: { initialRun: WorkflowRunStatus; canTrigger: boolean }) {
  const router = useRouter()
  const [run, setRun] = useState(initialRun)
  // Heure du clic : GitHub met quelques secondes à créer l'exécution, on attend d'en voir une
  // démarrée après ce moment avant de conclure qu'elle est terminée.
  const [triggeredAt, setTriggeredAt] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const running = run.status === 'queued' || run.status === 'in_progress'
  const waitingForNewRun = triggeredAt !== null && (!run.startedAt || new Date(run.startedAt).getTime() < triggeredAt - 60_000)
  const polling = running || waitingForNewRun

  useEffect(() => {
    if (!polling) return
    const id = setInterval(async () => {
      const next = await getStagingSyncRunAction()
      setRun(next)
      const isNew = triggeredAt === null || (next.startedAt !== null && new Date(next.startedAt).getTime() >= triggeredAt - 60_000)
      if (isNew && next.status === 'completed') {
        setTriggeredAt(null)
        router.refresh()
      }
    }, 10_000)
    return () => clearInterval(id)
  }, [polling, triggeredAt, router])

  const handleTrigger = async () => {
    setError('')
    setPending(true)
    const res = await triggerStagingSyncAction()
    setPending(false)
    setConfirming(false)
    if (res.error) { setError(res.error); return }
    setTriggeredAt(Date.now())
  }

  const label = waitingForNewRun && !running ? { text: 'Demande envoyée à GitHub…', cls: 'text-amber-700' } : statusLabel(run)

  return (
    <section className="bg-white rounded-lg shadow p-6 space-y-3 border-l-4 border-amber-400">
      <h2 className="text-lg font-semibold text-gray-800">Copier la prod vers staging</h2>
      <p className="text-sm text-gray-600 max-w-3xl">
        Remplace dans staging les alignements, l&apos;historique des mouvements, le journal des transactions, les réglages,
        les blessures et les demandes de LTIR par ceux de la prod, pour tester sur les vraies données. La prod n&apos;est jamais modifiée.
      </p>
      <p className="text-sm text-amber-700">
        Tout test en cours dans staging est écrasé. Les ballotages, les échanges proposés et le marché ne sont pas touchés.
      </p>
      <p className="text-sm text-gray-600">
        Dernière copie : <span className={`font-medium ${label.cls}`}>{label.text}</span>
        {run.startedAt && <> — {fmt(run.startedAt)}</>}
        {run.url && <> · <a href={run.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">détail sur GitHub</a></>}
      </p>
      {!canTrigger ? (
        <p className="text-sm text-gray-500">
          Bouton désactivé : la variable <code>GITHUB_WORKFLOW_TOKEN</code> manque dans ce projet Vercel.
        </p>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-700">Écraser les données de staging ?</span>
          <button onClick={handleTrigger} disabled={pending}
            className="bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-40">
            {pending ? 'Lancement…' : 'Oui, copier'}
          </button>
          <button onClick={() => setConfirming(false)} disabled={pending} className="text-sm text-gray-600 hover:underline">Annuler</button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} disabled={polling}
          className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-40">
          {polling ? 'Copie en cours…' : 'Copier la prod vers staging'}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  )
}
