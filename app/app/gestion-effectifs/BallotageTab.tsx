'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { getWaiverClaimsAction, submitWaiverClaimAction, refuseWaiverClaimAction } from './waiver-actions'
import type { WaiverClaimView, WaiverHistoryEntry } from './waiver-actions'

const STATUS_LABEL: Record<string, string> = {
  resolved_claimed: 'Remporté',
  resolved_unclaimed: 'Non réclamé — redevenu agent libre',
  blocked: 'Résolution bloquée — contacte l\'admin',
}

const STATUS_COLOR: Record<string, string> = {
  resolved_claimed: 'text-green-700',
  resolved_unclaimed: 'text-gray-500',
  blocked: 'text-red-700',
}

function formatExpiry(iso: string) {
  const d = new Date(iso)
  const diffMs = d.getTime() - Date.now()
  if (diffMs <= 0) return 'Expire sous peu'
  const hours = Math.round(diffMs / 3_600_000)
  const when = d.toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto' })
  return hours < 48 ? `${when} (dans ${hours}h)` : when
}

export default function BallotageTab({ saisonId }: { saisonId: number }) {
  const [claims, setClaims] = useState<WaiverClaimView[]>([])
  const [history, setHistory] = useState<WaiverHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const load = useCallback(() => {
    setLoading(true)
    getWaiverClaimsAction(saisonId).then(res => {
      if (res.error) setError(res.error)
      else {
        setClaims(res.claims ?? [])
        setHistory(res.history ?? [])
      }
      setLoading(false)
    })
  }, [saisonId])

  useEffect(() => { load() }, [load])

  function handleClaim(id: number) {
    setError(null)
    startTransition(async () => {
      const res = await submitWaiverClaimAction(saisonId, id)
      if (res.error) setError(res.error)
      load()
    })
  }

  function handleRefuse(id: number) {
    setError(null)
    startTransition(async () => {
      const res = await refuseWaiverClaimAction(saisonId, id)
      if (res.error) setError(res.error)
      load()
    })
  }

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>

  return (
    <div className="max-w-3xl space-y-6">
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>}

      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Joueurs au ballotage</h2>
        <p className="text-sm text-gray-500 mb-4">
          Quand un joueur est libéré en cours de saison, il devient réclamable ici pendant un
          délai — la priorité va au pooler le moins bien classé au moment de la libération.
          Refuser est optionnel, mais si tout le monde plus prioritaire que toi refuse, tu es
          averti par notification que tu vas l&apos;obtenir, sans attendre la fin du délai.
        </p>
        {claims.length === 0 && <p className="text-sm text-gray-400">Aucun joueur au ballotage en ce moment.</p>}
        <div className="space-y-2">
          {claims.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3">
              <div className="min-w-0">
                <div className="font-medium text-gray-800">
                  {c.playerName}
                  {(c.position || c.teamCode) && (
                    <span className="text-gray-400 font-normal"> ({[c.position, c.teamCode].filter(Boolean).join(', ')})</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  Libéré par {c.releasedByName} — {formatExpiry(c.expiresAt)}
                  {c.claimCount > 0 && ` — ${c.claimCount} réclamation${c.claimCount > 1 ? 's' : ''}`}
                  {c.refusedCount > 0 && ` · ${c.refusedCount} refus`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.myStatus === 'claimed' && <span className="text-sm text-green-700 font-medium">Déjà réclamé ✓</span>}
                {c.myStatus === 'refused' && <span className="text-sm text-gray-400 font-medium">Refusé</span>}
                {c.canClaim && (
                  <button onClick={() => handleClaim(c.id)} disabled={isPending}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    Réclamer
                  </button>
                )}
                {c.canRefuse && (
                  <button onClick={() => handleRefuse(c.id)} disabled={isPending}
                    className="border border-gray-300 text-gray-600 px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                    Refuser
                  </button>
                )}
                {!c.canClaim && !c.canRefuse && c.myStatus === null && (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-2">Activité récente</h3>
          <div className="space-y-1">
            {history.map(h => (
              <div key={h.id} className="text-xs text-gray-500 border-b border-gray-100 pb-1">
                {h.playerName} (libéré par {h.releasedByName}) — <span className={STATUS_COLOR[h.status] ?? ''}>{STATUS_LABEL[h.status] ?? h.status}</span>
                {h.awardedToName && ` par ${h.awardedToName}`}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
