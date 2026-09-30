'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addRookieOverrideAction, removeRookieOverrideAction } from './actions'

const DASH = '\u2014'
const CROSS = '\u2715'
const PROTECTION_SEASONS = 5

type Pooler = { id: string; name: string }
type Saison = { id: number; season: string }

type BankEntry = {
  id: number
  player_id: number
  rookie_type: 'repeche' | 'agent_libre' | null
  pool_draft_year: number | null
  players: {
    first_name: string
    last_name: string
    position: string | null
    status: string | null
    draft_year: number | null
    teams: { code: string } | null
  }
}

type PlayerResult = {
  id: number
  first_name: string
  last_name: string
  position: string | null
  status: string | null
  draft_year: number | null
  teams: { code: string } | null
}

type RookieType = 'repeche' | 'agent_libre'

export default function RookieOverrideManager({
  poolers,
  saison,
}: {
  poolers: Pooler[]
  saison: Saison | null
}) {
  const supabase = createClient()
  const [selectedPooler, setSelectedPooler] = useState(poolers[0]?.id ?? '')
  const [bank, setBank] = useState<BankEntry[]>([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Ajout en attente de confirmation du type
  const [pending, setPending] = useState<PlayerResult | null>(null)
  const [rookieType, setRookieType] = useState<RookieType>('repeche')
  const [poolDraftYear, setPoolDraftYear] = useState('')

  const saisonFin = saison ? parseInt(saison.season.split('-')[0], 10) + 1 : 0

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  // Charger la banque du pooler sélectionné
  const fetchBank = useCallback(async () => {
    if (!selectedPooler || !saison) return
    const { data } = await supabase
      .from('pooler_rosters')
      .select('id, player_id, rookie_type, pool_draft_year, players(first_name, last_name, position, status, draft_year, teams(code))')
      .eq('pooler_id', selectedPooler)
      .eq('pool_season_id', saison.id)
      .eq('player_type', 'recrue')
      .eq('is_active', true)
    setBank((data ?? []) as unknown as BankEntry[])
  }, [selectedPooler, saison, supabase])

  useEffect(() => { fetchBank() }, [fetchBank])

  // Recherche de joueurs avec debounce
  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      const q = search.trim()
      const { data } = await supabase
        .from('players')
        .select('id, first_name, last_name, position, status, draft_year, teams(code)')
        .or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%`)
        .order('last_name')
        .limit(20)
      setResults((data ?? []) as unknown as PlayerResult[])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, supabase])

  const bankIds = new Set(bank.map(e => e.player_id))

  const handleAdd = async () => {
    if (!pending || !saison) return
    setLoading(true)
    const year = rookieType === 'repeche' && poolDraftYear ? parseInt(poolDraftYear) : undefined
    const result = await addRookieOverrideAction(selectedPooler, pending.id, saison.id, rookieType, year)
    setLoading(false)
    if (result.error) {
      showMsg('error', result.error)
    } else {
      showMsg('success', `${pending.last_name}, ${pending.first_name} ajouté à la banque.`)
      setPending(null)
      setSearch('')
      setResults([])
      fetchBank()
    }
  }

  const handleRemove = async (entryId: number, name: string) => {
    setLoading(true)
    const result = await removeRookieOverrideAction(entryId)
    setLoading(false)
    if (result.error) {
      showMsg('error', result.error)
    } else {
      showMsg('success', `${name} retiré de la banque.`)
      setBank(prev => prev.filter(e => e.id !== entryId))
    }
  }

  const protectionLabel = (entry: BankEntry): string => {
    if (entry.rookie_type === 'repeche' && entry.pool_draft_year) {
      const restant = entry.pool_draft_year + PROTECTION_SEASONS - saisonFin
      if (restant < 0) return 'Expirée'
      if (restant === 0) return 'Dernière saison'
      return `${restant} an${restant > 1 ? 's' : ''}`
    }
    if (entry.rookie_type === 'agent_libre') {
      return entry.players.status === 'ELC' ? 'ELC actif' : 'ELC expiré'
    }
    return DASH
  }

  if (!saison) return null

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-bold text-lg text-gray-800">Banque de recrues — ajout manuel</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Saison {saison.season} — pour les joueurs qui étaient déjà dans une banque avant l'application, peu importe leur statut actuel.
        </p>
      </div>

      {message && (
        <p className={`mb-3 text-sm font-medium ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {/* Sélecteur de pooler */}
      <div className="flex items-center gap-3 mb-5">
        <label className="text-sm font-medium text-gray-700">Pooler :</label>
        <select
          value={selectedPooler}
          onChange={e => { setSelectedPooler(e.target.value); setPending(null); setSearch(''); setResults([]) }}
          className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {poolers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Banque actuelle */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Banque actuelle ({bank.length})
          </h3>
          {bank.length === 0 ? (
            <p className="text-gray-400 text-sm py-3">Banque vide</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Joueur</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Protection</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {bank.map(entry => (
                    <tr key={entry.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className="font-medium text-gray-800">
                          {entry.players.last_name}, {entry.players.first_name}
                        </span>
                        <span className="ml-1.5 text-gray-400 text-xs">
                          {entry.players.teams?.code ?? DASH} · {entry.players.position ?? DASH}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {entry.rookie_type === 'repeche'
                          ? `Repêché ${entry.pool_draft_year ?? ''}`
                          : 'Agent libre'}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{protectionLabel(entry)}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleRemove(entry.id, `${entry.players.last_name}, ${entry.players.first_name}`)}
                          disabled={loading}
                          className="text-red-400 hover:text-red-600 disabled:opacity-30"
                          title="Retirer de la banque"
                        >
                          {CROSS}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recherche et ajout */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Ajouter un joueur
          </h3>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPending(null) }}
            placeholder="Rechercher par nom (min. 2 caractères)…"
            className="w-full border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
          />

          {searching && <p className="text-xs text-gray-400 mb-2">Recherche…</p>}

          {results.length > 0 && (
            <div className="border rounded-lg overflow-hidden mb-3 max-h-52 overflow-y-auto">
              {results.map(player => {
                const inBank = bankIds.has(player.id)
                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between px-3 py-2 text-sm border-b last:border-0 ${inBank ? 'bg-gray-50 opacity-50' : 'hover:bg-blue-50 cursor-pointer'}`}
                    onClick={() => { if (!inBank) { setPending(player); setRookieType('repeche'); setPoolDraftYear(String(player.draft_year ?? '')) } }}
                  >
                    <span>
                      <span className="font-medium text-gray-800">{player.last_name}, {player.first_name}</span>
                      <span className="ml-2 text-gray-400 text-xs">{player.teams?.code ?? DASH} · {player.position ?? DASH} · {player.status ?? 'sans contrat'}</span>
                    </span>
                    {inBank && <span className="text-xs text-gray-400">Déjà dans la banque</span>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Panneau de confirmation */}
          {pending && (
            <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
              <p className="font-medium text-gray-800 text-sm">
                {pending.last_name}, {pending.first_name}
                <span className="ml-2 text-gray-400 font-normal text-xs">{pending.teams?.code ?? DASH} · {pending.position ?? DASH}</span>
              </p>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Type de protection</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input type="radio" name="rookieType" value="repeche"
                      checked={rookieType === 'repeche'} onChange={() => setRookieType('repeche')} />
                    Repêché du pool
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input type="radio" name="rookieType" value="agent_libre"
                      checked={rookieType === 'agent_libre'} onChange={() => setRookieType('agent_libre')} />
                    Agent libre (ELC)
                  </label>
                </div>
                {rookieType === 'repeche' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Année de repêchage du pool
                      {pending.draft_year && <span className="ml-1 text-gray-400">(LNH : {pending.draft_year})</span>}
                    </label>
                    <input
                      type="number"
                      value={poolDraftYear}
                      onChange={e => setPoolDraftYear(e.target.value)}
                      placeholder="ex. : 2022"
                      min={2015}
                      max={2030}
                      className="border rounded px-2 py-1 text-sm w-28 text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {poolDraftYear && (
                      <span className="ml-2 text-xs text-gray-500">
                        Protection jusqu'en {parseInt(poolDraftYear) + PROTECTION_SEASONS - 1}-{String(parseInt(poolDraftYear) + PROTECTION_SEASONS).slice(2)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAdd}
                  disabled={loading || (rookieType === 'repeche' && !poolDraftYear)}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
                >
                  {loading ? 'Ajout…' : 'Confirmer'}
                </button>
                <button
                  onClick={() => setPending(null)}
                  className="px-3 py-1.5 border text-sm text-gray-600 rounded-lg hover:bg-gray-50"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
