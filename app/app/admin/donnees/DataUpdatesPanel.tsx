'use client'

import { useEffect, useState } from 'react'
import { DATA_UPDATES } from '@/lib/dataUpdates'
import type { WorkflowRunStatus } from '@/lib/githubDispatch'
import { getDataUpdateRunsAction, triggerDataUpdateAction } from './data-update-actions'

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' })
}

function statusLabel(run: WorkflowRunStatus | undefined): { text: string; cls: string } {
  if (!run || run.status === 'unknown') return { text: 'Inconnu', cls: 'text-gray-400' }
  if (run.status === 'queued') return { text: 'En attente…', cls: 'text-amber-700' }
  if (run.status === 'in_progress') return { text: 'En cours…', cls: 'text-amber-700' }
  if (run.conclusion === 'success') return { text: 'Réussie', cls: 'text-green-700' }
  return { text: `Échec (${run.conclusion ?? 'inconnu'})`, cls: 'text-red-600 font-semibold' }
}

/**
 * Panneau « Mises à jour automatiques » (David, 2026-10-06) — dernière exécution de chaque tâche
 * et bouton pour la relancer quand l'horaire automatique n'a pas fonctionné.
 */
export default function DataUpdatesPanel({ initialRuns, canTrigger }: { initialRuns: Record<string, WorkflowRunStatus>; canTrigger: boolean }) {
  const [runs, setRuns] = useState(initialRuns)
  // Heure du clic par tâche : GitHub met quelques secondes à créer l'exécution, on attend d'en
  // voir une démarrée après ce moment avant de considérer la demande comme prise en compte.
  const [triggered, setTriggered] = useState<Record<string, number>>({})
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')

  const isWaiting = (workflow: string) => {
    const at = triggered[workflow]
    const startedAt = runs[workflow]?.startedAt
    return at !== undefined && (!startedAt || new Date(startedAt).getTime() < at - 60_000)
  }
  const isRunning = (workflow: string) => runs[workflow]?.status === 'queued' || runs[workflow]?.status === 'in_progress'
  const polling = DATA_UPDATES.some(u => isRunning(u.workflow) || isWaiting(u.workflow))

  useEffect(() => {
    if (!polling) return
    const id = setInterval(async () => setRuns(await getDataUpdateRunsAction()), 10_000)
    return () => clearInterval(id)
  }, [polling])

  const handleTrigger = async (workflow: string) => {
    setError('')
    setPending(workflow)
    const res = await triggerDataUpdateAction(workflow)
    setPending(null)
    if (res.error) { setError(res.error); return }
    setTriggered(t => ({ ...t, [workflow]: Date.now() }))
  }

  return (
    <section className="bg-white rounded-lg shadow p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Mises à jour automatiques</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">
            Chaque mise à jour tourne toute seule selon son horaire. Si l&apos;une d&apos;elles n&apos;a pas tourné ou a échoué, relance-la ici.
            Une relance ne crée jamais de doublons.
          </p>
        </div>
        <button type="button" onClick={async () => setRuns(await getDataUpdateRunsAction())} className="text-sm text-blue-600 hover:underline shrink-0">Actualiser</button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2 pr-4 font-medium">Mise à jour</th>
            <th className="py-2 pr-4 font-medium">Horaire</th>
            <th className="py-2 pr-4 font-medium">Dernière exécution</th>
            <th className="py-2 pr-4 font-medium">Résultat</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {DATA_UPDATES.map(u => {
            const run = runs[u.workflow]
            const waiting = isWaiting(u.workflow)
            const busy = waiting || isRunning(u.workflow)
            const label = waiting && !isRunning(u.workflow) ? { text: 'Demande envoyée…', cls: 'text-amber-700' } : statusLabel(run)
            return (
              <tr key={u.workflow} className="border-b last:border-0 align-top">
                <td className="py-3 pr-4">
                  <p className="font-medium text-gray-800">{u.label}</p>
                  <p className="text-xs text-gray-400">{u.detail}</p>
                </td>
                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">{u.schedule}</td>
                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">
                  {run?.url
                    ? <a href={run.url} target="_blank" rel="noopener noreferrer" className="hover:underline" title="Voir le détail sur GitHub">{fmt(run.startedAt)}</a>
                    : fmt(run?.startedAt ?? null)}
                </td>
                <td className={`py-3 pr-4 whitespace-nowrap ${label.cls}`}>{label.text}</td>
                <td className="py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleTrigger(u.workflow)}
                    disabled={!canTrigger || busy || pending !== null}
                    className="bg-gray-100 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40 whitespace-nowrap"
                  >
                    {pending === u.workflow ? 'Lancement…' : busy ? 'En cours…' : 'Lancer maintenant'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {!canTrigger && (
        <p className="text-sm text-gray-500">Boutons désactivés : la variable <code>GITHUB_WORKFLOW_TOKEN</code> manque dans ce projet Vercel.</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-gray-400">Heures affichées : heure de l&apos;Est. Clique sur une date pour voir le détail de l&apos;exécution sur GitHub.</p>
    </section>
  )
}
