'use client'

import { useState, useTransition } from 'react'
import { adminDecideLtirRequestAction } from './cap-watch-actions'
import type { LtirRequestView } from '@/lib/ltirRequests'
import InjuryBadge from '@/components/InjuryBadge'

export default function LtirApprovalManager({ initialRequests }: { initialRequests: LtirRequestView[] }) {
  const [requests, setRequests] = useState(initialRequests)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function decide(id: number, approve: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await adminDecideLtirRequestAction(id, approve)
      if (result.error) { setError(result.error); return }
      setRequests(prev => prev.filter(r => r.id !== id))
    })
  }

  if (requests.length === 0) {
    return <p className="text-sm text-gray-400">Aucune demande de LTIR en attente d&apos;approbation.</p>
  }

  return (
    <div className="space-y-3">
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
      {requests.map(r => (
        <div key={r.id} className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {r.poolerName} — {r.ltirPlayerName}
                {r.injury && <InjuryBadge injury={r.injury} />}
              </p>
              {r.newPlayerName && (
                <p className="text-xs text-gray-600 mt-0.5">+ signature de {r.newPlayerName}</p>
              )}
              {r.injury && (
                <p className="text-xs text-gray-400 mt-0.5">{r.injury.injuryType} — {r.injury.status}</p>
              )}
            </div>
            <span className="text-xs text-gray-400 shrink-0">
              Soumis le {new Date(r.submittedAt).toLocaleDateString('fr-CA')}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            La date effective sera celle de la soumission ci-dessus, pas celle de ton approbation.
          </p>
          <div className="flex gap-2">
            <button onClick={() => decide(r.id, true)} disabled={pending}
              className="bg-green-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              Approuver
            </button>
            <button onClick={() => decide(r.id, false)} disabled={pending}
              className="border border-gray-300 text-gray-600 px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              Rejeter
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
