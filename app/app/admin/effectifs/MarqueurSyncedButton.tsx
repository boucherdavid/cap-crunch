'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { markMarqueurSyncedAction } from './marqueur-actions'

export default function MarqueurSyncedButton({ lastTxId, count }: { lastTxId: number; count: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    if (!window.confirm(`Confirmer que les ${count} soumission${count > 1 ? 's' : ''} affichée${count > 1 ? 's' : ''} sont saisies sur Marqueur ?`)) return
    setBusy(true)
    setError(null)
    const res = await markMarqueurSyncedAction(lastTxId)
    setBusy(false)
    if (res.error) setError(res.error)
    else router.refresh()
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? 'Enregistrement...' : 'Marqueur est à jour'}
      </button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}
