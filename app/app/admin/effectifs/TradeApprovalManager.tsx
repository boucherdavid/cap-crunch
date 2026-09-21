'use client'

import { useState, useTransition } from 'react'
import { adminDecideTradeOfferAction, type AdminTradeOfferView } from './cap-watch-actions'

export default function TradeApprovalManager({ initialOffers }: { initialOffers: AdminTradeOfferView[] }) {
  const [offers, setOffers] = useState(initialOffers)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function decide(id: number, approve: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await adminDecideTradeOfferAction(id, approve)
      if (result.error) { setError(result.error); return }
      setOffers(prev => prev.filter(o => o.id !== id))
    })
  }

  if (offers.length === 0) {
    return <p className="text-sm text-gray-400">Aucune transaction en attente d&apos;approbation.</p>
  }

  return (
    <div className="space-y-3">
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
      {offers.map(o => (
        <div key={o.id} className="border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-gray-800 mb-2">{o.proposerName} ↔ {o.targetName}</p>
          <div className="grid grid-cols-2 gap-4 mb-3">
            {[o.proposerName, o.targetName].map(name => (
              <div key={name}>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{name} donne</p>
                <ul className="text-sm text-gray-700 space-y-0.5">
                  {o.items.filter(i => i.fromName === name).map((i, idx) => <li key={idx}>{i.label}</li>)}
                  {o.items.filter(i => i.fromName === name).length === 0 && <li className="text-gray-400">—</li>}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => decide(o.id, true)} disabled={pending}
              className="bg-green-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              Approuver
            </button>
            <button onClick={() => decide(o.id, false)} disabled={pending}
              className="border border-gray-300 text-gray-600 px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              Rejeter
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
