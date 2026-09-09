'use client'

import { useEffect, useState } from 'react'
import { submitTransactionAction, searchFreeAgentsAction } from '../transactions/actions'
import type { PoolerCapInfo } from './types'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const DASH = '—'

// Extrait de PresaisonManager.tsx (David, 2026-09-08) — réutilisé aussi par le panneau admin
// rétractable de /repechage-agents-libres (AdminPanel.tsx). La signature réelle d'un agent
// libre pendant le tour de quelqu'un reste admin-only (submitTransactionAction), peu importe
// depuis quelle page le formulaire est rempli.
export default function FreeAgentSigner({
  pooler, saisonId, season, onSign, threshold,
}: {
  pooler: PoolerCapInfo
  saisonId: number
  season: string
  onSign: () => Promise<void>
  threshold: number
}) {
  const [query, setQuery] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [results, setResults] = useState<any[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [newType, setNewType] = useState('actif')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) { setResults([]); return }
      setLoadingSearch(true)
      const res = await searchFreeAgentsAction(saisonId, query)
      setResults(res.players)
      setLoadingSearch(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, saisonId])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getCap = (p: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p.player_contracts?.find((c: any) => c.season === season)?.cap_number ?? 0

  const handleSign = async () => {
    const fa = results.find(p => String(p.id) === selectedId)
    if (!fa) return
    setBusy(true)
    setErr(null)
    const result = await submitTransactionAction(saisonId, 'Repêchage pré-saison', [{
      action_type: 'sign',
      to_pooler_id: pooler.id,
      player_id: fa.id,
      new_player_type: newType,
    }])
    setBusy(false)
    if (result.error) {
      setErr(result.error)
    } else {
      setQuery('')
      setResults([])
      setSelectedId('')
      await onSign()
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Espace disponible :{' '}
        <span className={`font-semibold ${pooler.capSpace < threshold ? 'text-amber-600' : 'text-green-700'}`}>
          {fmt(pooler.capSpace)}
        </span>
        {pooler.capSpace < threshold && (
          <span className="text-amber-600"> — sous le seuil de {fmt(threshold)}</span>
        )}
      </p>

      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Rechercher un agent libre..."
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loadingSearch && <p className="text-xs text-gray-400">Recherche...</p>}

      {results.length > 0 && (
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          size={Math.min(results.length, 6)}
          className="w-full border rounded-lg text-sm focus:outline-none"
        >
          <option value="">— Sélectionner —</option>
          {results.map(p => (
            <option key={p.id} value={String(p.id)}>
              {p.last_name}, {p.first_name} ({p.teams?.code ?? DASH}) {p.position}
              {getCap(p) > 0 ? ` — ${fmt(getCap(p))}` : ''}
            </option>
          ))}
        </select>
      )}

      {selectedId && (
        <select
          value={newType}
          onChange={e => setNewType(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="actif">Actif</option>
          <option value="reserviste">Réserviste</option>
        </select>
      )}

      {err && <p className="text-xs text-red-600">{err}</p>}

      <button
        onClick={handleSign}
        disabled={busy || !selectedId}
        className="w-full px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40"
      >
        {busy ? 'Signature en cours...' : 'Signer'}
      </button>
    </div>
  )
}
