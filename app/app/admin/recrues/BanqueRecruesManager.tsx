'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addPlayerAction, removePlayerAction, updateRookieTypeAction } from '../rosters/actions'

const DASH = '\u2014'
const CROSS = '\u2715'
const PROTECTION_SEASONS = 5

const getSaisonFin = (season: string): number =>
  parseInt(season.split('-')[0], 10) + 1


type Pooler = { id: string; name: string }
type Rookie = {
  id: number
  first_name: string
  last_name: string
  position: string | null
  status: string | null
  draft_year: number | null
  draft_round: number | null
  draft_overall: number | null
  teams: { code: string } | null
}
type BankEntry = {
  id: number
  player_id: number
  rookie_type: 'repeche' | 'agent_libre' | null
  pool_draft_year: number | null
  players: Rookie
}
type Saison = { id: number; season: string }
type RookieCategory = 'repeche' | 'agent_libre'

const isEntryProtected = (entry: BankEntry, saisonFin: number): boolean => {
  // Non classifié → protégé par défaut (à reclassifier par l'admin)
  if (!entry.rookie_type) return true
  if (entry.rookie_type === 'repeche') {
    return (entry.pool_draft_year ?? 0) + PROTECTION_SEASONS >= saisonFin
  }
  // agent_libre : protégé tant que ELC
  return entry.players.status === 'ELC'
}

const sortRookies = (a: Rookie, b: Rookie) => {
  const yearDiff = (a.draft_year ?? 9999) - (b.draft_year ?? 9999)
  if (yearDiff !== 0) return yearDiff
  return (a.last_name ?? '').localeCompare(b.last_name ?? '', 'fr-CA')
    || (a.first_name ?? '').localeCompare(b.first_name ?? '', 'fr-CA')
}

const draftLabel = (r: Rookie) => {
  if (!r.draft_year) return null
  const parts = [String(r.draft_year)]
  if (r.draft_round) parts.push(`R${r.draft_round}`)
  if (r.draft_overall) parts.push(`#${r.draft_overall}`)
  return parts.join(' ')
}

const PENCIL = '\u270e'

function BankRow({ entry, onRemove, onEdit, loading, expired = false }: {
  entry: BankEntry
  onRemove: (id: number) => void
  onEdit: () => void
  loading: boolean
  expired?: boolean
}) {
  const typeLabel = entry.rookie_type === 'repeche'
    ? <span className="inline-block bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5 text-xs font-medium" title="Année de repêchage dans le pool — détermine la fin de protection (+5 saisons)">
        Repêché du pool {entry.pool_draft_year ?? ''}
      </span>
    : entry.rookie_type === 'agent_libre'
      ? <span className="inline-block bg-amber-50 text-amber-600 rounded px-1.5 py-0.5 text-xs font-medium" title="Protégé tant que le contrat NHL réel est un ELC">Agent libre (ELC)</span>
      : <span className="inline-block bg-red-50 text-red-600 rounded px-1.5 py-0.5 text-xs font-medium" title="Type de protection jamais assigné — cliquer sur ✎ pour le définir">
          Type à définir
        </span>

  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-gray-50 group">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <span className="text-gray-400 w-8 text-center text-xs shrink-0">
          {entry.players.teams?.code ?? DASH}
        </span>
        <span className={`font-medium truncate ${expired ? 'text-red-700' : 'text-gray-800'}`}>
          {entry.players.last_name}, {entry.players.first_name}
        </span>
        <span className="text-gray-400 text-xs shrink-0">{entry.players.position ?? DASH}</span>
        {typeLabel}
        {draftLabel(entry.players) && (
          <span className="text-gray-400 text-xs shrink-0" title="Vrai repêchage NHL (indépendant du type de protection dans le pool)">
            NHL {draftLabel(entry.players)}
          </span>
        )}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
        <button onClick={onEdit} disabled={loading}
          className="text-blue-400 hover:text-blue-600 text-xs disabled:opacity-30"
          title="Modifier le type">
          {PENCIL}
        </button>
        <button onClick={() => onRemove(entry.id)} disabled={loading}
          className="text-red-400 hover:text-red-600 text-xs disabled:opacity-30">
          {CROSS}
        </button>
      </div>
    </div>
  )
}

function TypePanel({ rookie, initialType, onConfirm, onCancel, loading }: {
  rookie: Rookie
  initialType?: RookieCategory
  onConfirm: (type: RookieCategory) => void
  onCancel: () => void
  loading: boolean
}) {
  const [type, setType] = useState<RookieCategory>(initialType ?? 'repeche')

  return (
    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
      <p className="font-medium text-gray-700 mb-2">
        {rookie.last_name}, {rookie.first_name} — type de protection
      </p>
      <div className="flex gap-3 mb-3">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="type" value="repeche"
            checked={type === 'repeche'} onChange={() => setType('repeche')} />
          <span>Repêché du pool</span>
          {type === 'repeche' && rookie.draft_year && (
            <span className="text-gray-400 text-xs">({rookie.draft_year}, protection jusqu'en {rookie.draft_year + PROTECTION_SEASONS - 1}-{String(rookie.draft_year + PROTECTION_SEASONS).slice(2)})</span>
          )}
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="type" value="agent_libre"
            checked={type === 'agent_libre'} onChange={() => setType('agent_libre')} />
          <span>Agent libre (ELC)</span>
        </label>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(type)}
          disabled={loading}
          className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded hover:bg-emerald-700 disabled:opacity-50"
        >
          Confirmer
        </button>
        <button
          onClick={onCancel}
          className="text-gray-500 text-xs px-3 py-1.5 rounded hover:bg-gray-100"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

export default function BanqueRecruesManager({
  poolers,
  rookies,
  saison,
}: {
  poolers: Pooler[]
  rookies: Rookie[]
  saison: Saison | null
}) {
  const supabase = createClient()
  const [selectedPooler, setSelectedPooler] = useState(poolers[0]?.id ?? '')
  const [bank, setBank] = useState<BankEntry[]>([])
  const [allTakenIds, setAllTakenIds] = useState<Set<number>>(new Set())
  const [selectedTeam, setSelectedTeam] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingRookie, setPendingRookie] = useState<Rookie | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null)

  const saisonFin = saison ? getSaisonFin(saison.season) : 0

  // Charger tous les IDs de recrues prises (tous poolers) pour éviter doublons
  useEffect(() => {
    if (!saison) return
    supabase
      .from('pooler_rosters')
      .select('player_id')
      .eq('pool_season_id', saison.id)
      .eq('player_type', 'recrue')
      .eq('is_active', true)
      .then(({ data }) => setAllTakenIds(new Set((data ?? []).map((r) => r.player_id))))
  }, [saison, supabase])

  useEffect(() => {
    if (!selectedPooler || !saison) return
    setPendingRookie(null)

    const fetchBank = async () => {
      const { data } = await supabase
        .from('pooler_rosters')
        .select('id, player_id, rookie_type, pool_draft_year, players(id, first_name, last_name, position, status, draft_year, draft_round, draft_overall, teams(code))')
        .eq('pooler_id', selectedPooler)
        .eq('pool_season_id', saison.id)
        .eq('player_type', 'recrue')
        .eq('is_active', true)

      setBank((data ?? []) as unknown as BankEntry[])
    }

    fetchBank()
  }, [selectedPooler, saison, supabase])

  const teamOptions = useMemo(() =>
    Array.from(new Set(rookies.map((r) => r.teams?.code ?? '').filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'fr-CA')),
    [rookies],
  )

  const availableRookies = useMemo(() => {
    const s = search.trim().toLowerCase()
    return rookies
      .filter((r) => !allTakenIds.has(r.id))
      .filter((r) => {
        if (selectedTeam && (r.teams?.code ?? '') !== selectedTeam) return false
        if (!s) return true
        const name = `${r.first_name} ${r.last_name}`.toLowerCase()
        const rev = `${r.last_name} ${r.first_name}`.toLowerCase()
        return name.includes(s) || rev.includes(s) || (r.teams?.code ?? '').toLowerCase().includes(s)
      })
      .sort(sortRookies)
  }, [rookies, allTakenIds, search, selectedTeam])

  const { protectedBank, expiredBank } = useMemo(() => {
    const sorted = [...bank].sort((a, b) => sortRookies(a.players, b.players))
    return {
      protectedBank: sorted.filter((e) => isEntryProtected(e, saisonFin)),
      expiredBank: sorted.filter((e) => !isEntryProtected(e, saisonFin)),
    }
  }, [bank, saisonFin])

  const confirmAdd = async (type: RookieCategory) => {
    if (!saison || !pendingRookie) return
    setLoading(true)
    const poolDraftYear = type === 'repeche' ? (pendingRookie.draft_year ?? undefined) : undefined
    const result = await addPlayerAction(selectedPooler, pendingRookie.id, saison.id, 'recrue', type, poolDraftYear)
    if (result.error) {
      setMessage(`Erreur: ${result.error}`)
    } else {
      const newEntry: BankEntry = {
        id: Date.now(),
        player_id: pendingRookie.id,
        rookie_type: type,
        pool_draft_year: poolDraftYear ?? null,
        players: pendingRookie,
      }
      setBank((prev) => [...prev, newEntry])
      setAllTakenIds((prev) => new Set([...prev, pendingRookie.id]))
      setMessage('Recrue ajoutée!')
      setPendingRookie(null)
      setSearch('')
    }
    setLoading(false)
    setTimeout(() => setMessage(''), 3000)
  }

  const confirmEdit = async (entryId: number, type: RookieCategory, draftYear: number | null) => {
    setLoading(true)
    const result = await updateRookieTypeAction(entryId, type, draftYear ?? undefined)
    if (result.error) {
      setMessage(`Erreur: ${result.error}`)
    } else {
      setBank((prev) => prev.map((e) =>
        e.id === entryId
          ? { ...e, rookie_type: type, pool_draft_year: type === 'repeche' ? draftYear : null }
          : e,
      ))
      setEditingEntryId(null)
      setMessage('Type mis à jour.')
    }
    setLoading(false)
    setTimeout(() => setMessage(''), 3000)
  }

  const removeFromBank = async (entryId: number) => {
    setLoading(true)
    const result = await removePlayerAction(entryId)
    if (!result.error) {
      const removed = bank.find((e) => e.id === entryId)
      setBank((prev) => prev.filter((e) => e.id !== entryId))
      if (removed) setAllTakenIds((prev) => { const next = new Set(prev); next.delete(removed.player_id); return next })
    } else {
      setMessage(`Erreur: ${result.error}`)
      setTimeout(() => setMessage(''), 3000)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-4 flex-wrap">
        <label className="text-sm font-medium text-gray-700">Pooler:</label>
        <select
          value={selectedPooler}
          onChange={(e) => setSelectedPooler(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {poolers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {message && (
          <span className={`text-sm font-medium ${message.startsWith('Erreur') ? 'text-red-600' : 'text-emerald-600'}`}>
            {message}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Banque actuelle */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="font-semibold text-gray-700 mb-4">
              {`Banque de recrues \u2014 ${protectedBank.length} recrue(s)`}
            </h2>
            {bank.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Banque vide</p>
            ) : protectedBank.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Aucune recrue protégée</p>
            ) : (
              <div className="space-y-1">
                {protectedBank.map((entry) => (
                  <div key={entry.id}>
                    <BankRow entry={entry} onRemove={removeFromBank} loading={loading}
                      onEdit={() => setEditingEntryId(editingEntryId === entry.id ? null : entry.id)} />
                    {editingEntryId === entry.id && (
                      <TypePanel
                        rookie={entry.players}
                        initialType={entry.rookie_type ?? undefined}
                        onConfirm={(type) => confirmEdit(entry.id, type, entry.players.draft_year)}
                        onCancel={() => setEditingEntryId(null)}
                        loading={loading}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {expiredBank.length > 0 && (
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-red-400">
              <h2 className="font-semibold text-red-600 mb-1">
                {`Activation obligatoire \u2014 ${expiredBank.length} recrue(s)`}
              </h2>
              <p className="text-xs text-gray-400 mb-4">
                La période de protection est terminée. Ces recrues doivent être activées en début de saison.
              </p>
              <div className="space-y-1">
                {expiredBank.map((entry) => (
                  <div key={entry.id}>
                    <BankRow entry={entry} onRemove={removeFromBank} loading={loading} expired
                      onEdit={() => setEditingEntryId(editingEntryId === entry.id ? null : entry.id)} />
                    {editingEntryId === entry.id && (
                      <TypePanel
                        rookie={entry.players}
                        initialType={entry.rookie_type ?? undefined}
                        onConfirm={(type) => confirmEdit(entry.id, type, entry.players.draft_year)}
                        onCancel={() => setEditingEntryId(null)}
                        loading={loading}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recrues disponibles */}
        <div className="bg-white rounded-lg shadow p-5 sticky top-4 self-start">
          <h2 className="font-semibold text-gray-700 mb-4">
            {`Recrues disponibles \u2014 ${availableRookies.length} joueur(s)`}
          </h2>
          <div className="flex gap-2 mb-4 flex-wrap">
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-28 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Equipe</option>
              {teamOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Rechercher par nom..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
            {availableRookies.map((rookie) => (
              <div key={rookie.id}>
                <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 group">
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    <span className="text-gray-400 w-8 text-center text-xs shrink-0">{rookie.teams?.code ?? DASH}</span>
                    <span className="font-medium text-gray-800 truncate">
                      {rookie.last_name}, {rookie.first_name}
                    </span>
                    <span className="text-gray-400 text-xs shrink-0">{rookie.position ?? DASH}</span>
                    {draftLabel(rookie) && (
                      <span className="text-gray-400 text-xs shrink-0">NHL {draftLabel(rookie)}</span>
                    )}
                    {rookie.status === 'ELC' && !rookie.draft_year && (
                      <span className="text-amber-500 text-xs shrink-0">ELC</span>
                    )}
                  </div>
                  <button
                    onClick={() => setPendingRookie(pendingRookie?.id === rookie.id ? null : rookie)}
                    disabled={loading}
                    className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30 ml-2 shrink-0"
                  >
                    Ajouter
                  </button>
                </div>
                {pendingRookie?.id === rookie.id && (
                  <TypePanel
                    rookie={rookie}
                    onConfirm={confirmAdd}
                    onCancel={() => setPendingRookie(null)}
                    loading={loading}
                  />
                )}
              </div>
            ))}
            {availableRookies.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">
                {search || selectedTeam ? 'Aucun résultat' : 'Toutes les recrues sont déjà assignées'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
