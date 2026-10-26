'use client'

import { useState, useTransition } from 'react'
import type { ContractChangeAlertView } from '@/lib/contractChangeAlerts'
import { markContractAlertsSeenAction } from './contract-alert-actions'

const fmt = (v: number | null) => (v === null ? 'vide' : `${Math.round(v).toLocaleString('fr-CA')} $`)
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'short' })

/**
 * Salaires modifiés d'un import à l'autre (David, 2026-10-26, lib/contractChangeAlerts.ts). Un
 * changement peut être légitime (échange avec salaire retenu, correction de PuckPedia) : c'est à
 * l'admin de juger, rien n'est annulé automatiquement.
 */
export default function ContractChangeAlertsPanel({ alerts }: { alerts: ContractChangeAlertView[] | null }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const unseen = (alerts ?? []).filter(a => !a.seenAt)
  const seen = (alerts ?? []).filter(a => a.seenAt)

  const markSeen = (ids?: number[]) => {
    setError(null)
    startTransition(async () => {
      const result = await markContractAlertsSeenAction(ids)
      if (result.error) setError(result.error)
    })
  }

  const row = (a: ContractChangeAlertView, canMark: boolean) => (
    <tr key={a.id} className={canMark ? 'bg-amber-50/60' : ''}>
      <td className="px-3 py-2">
        <div className="font-medium text-gray-800">{a.playerName}{a.teamCode && <span className="text-gray-400 font-normal"> ({a.teamCode})</span>}</div>
        {a.ownerName && <div className="text-xs text-blue-600">Chez {a.ownerName}</div>}
      </td>
      <td className="px-3 py-2 text-gray-600">{a.season}</td>
      <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{fmt(a.oldCap)}</td>
      <td className="px-3 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">{fmt(a.newCap)}</td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(a.detectedAt)}</td>
      <td className="px-3 py-2 text-right">
        {canMark && (
          <button type="button" disabled={pending} onClick={() => markSeen([a.id])}
            className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
            Vu
          </button>
        )}
      </td>
    </tr>
  )

  return (
    <section className="bg-white rounded-lg shadow p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Salaires modifiés</h2>
          <p className="text-sm text-gray-500">
            Un salaire déjà connu qui change au dernier import (saison active et suivantes). Vérifie sur PuckPedia :
            un échange avec salaire retenu est normal, un rachat additionné au contrat ne l&apos;est pas.
            Une correction se fait dans <code className="text-xs">python_script/source/cap_overrides.csv</code>.
          </p>
        </div>
        {unseen.length > 1 && (
          <button type="button" disabled={pending} onClick={() => markSeen()}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
            Tout marquer comme vu
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {alerts === null ? (
        <p className="text-sm text-amber-700">Migration <code>contract_change_alerts.sql</code> pas encore roulée.</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun salaire modifié depuis 30 jours.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Joueur</th>
                <th className="px-3 py-2 text-left">Saison</th>
                <th className="px-3 py-2 text-right">Avant</th>
                <th className="px-3 py-2 text-right">Après</th>
                <th className="px-3 py-2 text-left">Détecté</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {unseen.map(a => row(a, true))}
              {seen.map(a => row(a, false))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
