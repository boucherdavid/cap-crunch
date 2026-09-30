'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BackupRunStatus } from '@/lib/backupTool'
import { getBackupRunAction, triggerBackupAction } from './actions'

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto' })
}

function statusLabel(run: BackupRunStatus): { text: string; cls: string } {
  if (run.status === 'queued') return { text: 'En attente de démarrage…', cls: 'text-amber-700' }
  if (run.status === 'in_progress') return { text: 'Génération en cours…', cls: 'text-amber-700' }
  if (run.status === 'completed' && run.conclusion === 'success') return { text: 'Réussie', cls: 'text-green-700' }
  if (run.status === 'completed') return { text: `Échec (${run.conclusion ?? 'inconnu'})`, cls: 'text-red-600' }
  return { text: 'Inconnu', cls: 'text-gray-500' }
}

export default function BackupAdminPanel({ initialRun, canTrigger }: { initialRun: BackupRunStatus; canTrigger: boolean }) {
  const router = useRouter()
  const [run, setRun] = useState(initialRun)
  // Heure du clic : GitHub met quelques secondes à créer l'exécution, on attend d'en voir une
  // démarrée après ce moment avant de conclure qu'elle est terminée.
  const [triggeredAt, setTriggeredAt] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const running = run.status === 'queued' || run.status === 'in_progress'
  const waitingForNewRun = triggeredAt !== null && (!run.startedAt || new Date(run.startedAt).getTime() < triggeredAt - 60_000)
  const polling = running || waitingForNewRun

  useEffect(() => {
    if (!polling) return
    const id = setInterval(async () => {
      const next = await getBackupRunAction()
      setRun(next)
      const isNew = triggeredAt === null || (next.startedAt !== null && new Date(next.startedAt).getTime() >= triggeredAt - 60_000)
      if (isNew && next.status === 'completed') {
        setTriggeredAt(null)
        router.refresh()   // met à jour la date de dernière génération affichée plus haut
      }
    }, 10_000)
    return () => clearInterval(id)
  }, [polling, triggeredAt, router])

  const handleTrigger = async () => {
    setError('')
    setPending(true)
    const res = await triggerBackupAction()
    setPending(false)
    if (res.error) { setError(res.error); return }
    setTriggeredAt(Date.now())
  }

  const label = statusLabel(run)

  return (
    <section className="bg-white rounded-lg shadow p-5 border-l-4 border-slate-400">
      <h2 className="font-semibold text-gray-800 mb-1">Admin — mettre à jour la copie</h2>
      <p className="text-sm text-gray-600 mb-3">
        Relance la génération (la même que celle du dimanche) à partir des données de la prod. Compte
        environ 2 minutes ; la page se met à jour d&apos;elle-même à la fin.
      </p>
      <p className="text-sm text-gray-600 mb-3">
        Dernière exécution : {fmt(run.startedAt)} —{' '}
        <span className={`font-medium ${label.cls}`}>{waitingForNewRun ? 'Démarrage…' : label.text}</span>
        {run.url && (
          <>
            {' '}·{' '}
            <a href={run.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Détails sur GitHub</a>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={handleTrigger}
        disabled={!canTrigger || pending || polling}
        className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? 'Envoi…' : polling ? 'Génération en cours…' : 'Mettre à jour maintenant'}
      </button>
      {!canTrigger && (
        <p className="text-xs text-amber-700 mt-2">
          Jeton GitHub absent (variable GITHUB_WORKFLOW_TOKEN dans Vercel) — le bouton reste désactivé
          d&apos;ici là.
        </p>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </section>
  )
}
