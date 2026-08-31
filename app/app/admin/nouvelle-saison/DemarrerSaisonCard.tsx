'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { previewConformityAction, demarrerSaisonAction } from './actions'
import type { ConformityIssue } from '@/lib/seasonConformity'

export default function DemarrerSaisonCard({
  saisonId,
  seasonStarted,
  saisonStartDate,
}: {
  saisonId: number
  seasonStarted: boolean
  saisonStartDate: string | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(!seasonStarted)
  const [issues, setIssues] = useState<ConformityIssue[]>([])
  const [totalPoolers, setTotalPoolers] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    const result = await previewConformityAction(saisonId)
    setLoading(false)
    if (result.error) { setPreviewError(result.error); return }
    setPreviewError(null)
    setIssues(result.issues)
    setTotalPoolers(result.totalPoolers)
  }

  useEffect(() => {
    if (!seasonStarted) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisonId, seasonStarted])

  const handleStart = async () => {
    if (!window.confirm(
      "Démarrer la saison ? Ça assigne la date de début de saison à tous les alignements actifs et " +
      "réactive la validation/journalisation normale partout (Transactions, Gestion d'effectifs). Cette action est irréversible.",
    )) return
    setSubmitting(true)
    setSubmitError(null)
    const result = await demarrerSaisonAction(saisonId)
    setSubmitting(false)
    if (result.issues) { setIssues(result.issues); return }
    if (result.error) { setSubmitError(result.error); return }
    setSummary(result.summary ?? 'Saison démarrée.')
    router.refresh()
  }

  if (seasonStarted) {
    return (
      <li className="bg-white rounded-lg shadow p-4 border-l-4 border-emerald-500">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center bg-emerald-600">7</span>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Démarrer la saison</p>
            <p className="text-sm text-gray-600 mt-0.5">
              Déjà démarrée{saisonStartDate ? ` le ${saisonStartDate}` : ''} — validation et journalisation normales partout.
            </p>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li className="bg-white rounded-lg shadow p-4 border-l-4 border-emerald-500">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center bg-emerald-600">7</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-800 text-sm">Démarrer la saison</p>
          <p className="text-sm text-gray-600 mt-0.5">
            Dernière étape, une fois l&apos;alignement de chaque pooler prêt — vérifie que tout est
            conforme (12/6/2 actifs, min. 2 réservistes, cap), puis assigne la date de début de
            saison à tous les actifs.
          </p>

          {previewError && (
            <p className="text-xs text-red-600 mt-2">{previewError}</p>
          )}

          {!previewError && loading && (
            <p className="text-xs text-gray-400 mt-2">Vérification en cours…</p>
          )}

          {!previewError && !loading && (
            issues.length === 0 ? (
              <p className="text-xs text-emerald-700 font-medium mt-2">{totalPoolers}/{totalPoolers} poolers conformes</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-red-600 font-medium">
                  {totalPoolers - issues.length}/{totalPoolers} poolers conformes
                </p>
                {issues.map(issue => (
                  <div key={issue.poolerId} className="text-xs bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
                    <span className="font-medium text-red-800">{issue.poolerName}</span>
                    <span className="text-red-700"> — {issue.reasons.join(' · ')}</span>
                  </div>
                ))}
              </div>
            )
          )}

          {submitError && <p className="text-xs text-red-600 mt-2">{submitError}</p>}
          {summary && <p className="text-xs text-emerald-700 font-medium mt-2">{summary}</p>}

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleStart}
              disabled={loading || submitting || issues.length > 0 || !!previewError}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Démarrage…' : 'Démarrer la saison'}
            </button>
            <button
              onClick={refresh}
              disabled={loading || submitting}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
            >
              Revérifier
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}
