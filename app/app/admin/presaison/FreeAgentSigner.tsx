'use client'

import { useEffect, useState } from 'react'
import { submitTransactionAction, searchFreeAgentsAction } from '../transactions/actions'
import type { PoolerCapInfo } from './types'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const DASH = '—'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FreeAgentResult = any

// Extrait de PresaisonManager.tsx (David, 2026-09-08) — réutilisé aussi par le panneau admin
// rétractable de /repechage-agents-libres (AdminPanel.tsx). La signature réelle d'un agent
// libre pendant le tour de quelqu'un reste admin-only (submitTransactionAction), peu importe
// depuis quelle page le formulaire est rempli.
// Recherche/sélection refaite en dropdown flottant (David, 2026-09-10) — le <select size> natif
// d'origine était jugé peu fluide comparé au reste de l'app ; même patron que PlayerSearch dans
// gestion-effectifs/GestionEffectifsManager.tsx (input + liste cliquable superposée, chip verte
// une fois sélectionné).
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
  const [results, setResults] = useState<FreeAgentResult[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [selected, setSelected] = useState<FreeAgentResult | null>(null)
  const [newType, setNewType] = useState('actif')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
      setLoadingSearch(true)
      const res = await searchFreeAgentsAction(saisonId, query)
      setResults(res.players)
      setLoadingSearch(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, saisonId])

  const getCap = (p: FreeAgentResult) =>
    p.player_contracts?.find((c: { season: string; cap_number: number }) => c.season === season)?.cap_number ?? 0

  const handleSign = async () => {
    if (!selected) return
    setBusy(true)
    setErr(null)
    const result = await submitTransactionAction(saisonId, 'Repêchage pré-saison', [{
      action_type: 'sign',
      to_pooler_id: pooler.id,
      player_id: selected.id,
      new_player_type: newType,
    }])
    setBusy(false)
    if (result.error) {
      setErr(result.error)
    } else {
      setQuery('')
      setResults([])
      setSelected(null)
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

      {selected ? (
        <div className="flex items-center gap-2 border border-green-300 bg-green-50 rounded-lg px-3 py-2 text-sm">
          <span className="flex-1 font-medium text-gray-800">
            {selected.last_name}, {selected.first_name}
            {selected.teams?.code && <span className="text-xs text-gray-500 ml-1">({selected.teams.code}) {selected.position}</span>}
          </span>
          {getCap(selected) > 0 && <span className="text-xs text-gray-500">{fmt(getCap(selected))}</span>}
          <button onClick={() => { setSelected(null); setQuery('') }} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher un agent libre..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {loadingSearch && <p className="text-xs text-gray-400 mt-1">Recherche...</p>}
          {results.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {results.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelected(p); setResults([]); setQuery('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
                >
                  <span className="font-medium">{p.last_name}, {p.first_name}</span>
                  {p.position && <span className="text-xs text-gray-400">{p.position}</span>}
                  <span className="ml-auto flex items-center gap-2 shrink-0">
                    {getCap(p) > 0 && <span className="text-xs text-gray-500">{fmt(getCap(p))}</span>}
                    <span className="text-xs text-gray-500">{p.teams?.code ?? DASH}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
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
        disabled={busy || !selected}
        className="w-full px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40"
      >
        {busy ? 'Signature en cours...' : 'Signer'}
      </button>
    </div>
  )
}
