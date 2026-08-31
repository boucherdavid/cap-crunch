'use client'

import { useMemo, useState } from 'react'
import TeamBadge from '@/components/TeamBadge'
import { normalizeSearch } from '@/lib/normalizeSearch'

const DASH = '\u2014'

type DraftPick = {
  player_id: number
  first_name: string
  last_name: string
  position: string | null
  status: string | null
  draft_year: number | null
  draft_round: number | null
  draft_overall: number | null
  team_code: string | null
  pooler_name: string | null
}

export default function RepechageTable({ picks }: { picks: DraftPick[] }) {
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all')
  const [selectedRound, setSelectedRound] = useState<number | 'all'>('all')
  const [filterPooler, setFilterPooler] = useState<'all' | 'assigned' | 'unassigned'>('all')
  const [search, setSearch] = useState('')

  const withDraft = useMemo(() => picks.filter((p) => p.draft_year !== null), [picks])
  const withoutDraft = useMemo(() => picks.filter((p) => p.draft_year === null), [picks])

  const years = useMemo(() =>
    Array.from(new Set(withDraft.map((p) => p.draft_year as number))).sort((a, b) => b - a),
    [withDraft],
  )

  const rounds = useMemo(() => {
    const source = selectedYear === 'all' ? withDraft : withDraft.filter((p) => p.draft_year === selectedYear)
    return Array.from(new Set(source.map((p) => p.draft_round as number))).sort((a, b) => a - b)
  }, [withDraft, selectedYear])

  const matchesSearch = (p: DraftPick, s: string) => {
    if (!s) return true
    const name = normalizeSearch(`${p.first_name} ${p.last_name}`)
    const rev = normalizeSearch(`${p.last_name} ${p.first_name}`)
    return (
      name.includes(s) ||
      rev.includes(s) ||
      normalizeSearch(p.team_code ?? '').includes(s) ||
      normalizeSearch(p.pooler_name ?? '').includes(s)
    )
  }

  const matchesFilters = (p: DraftPick, s: string) => {
    if (filterPooler === 'assigned' && !p.pooler_name) return false
    if (filterPooler === 'unassigned' && p.pooler_name) return false
    return matchesSearch(p, s)
  }

  const filteredWithDraft = useMemo(() => {
    const s = normalizeSearch(search.trim())
    return withDraft.filter((p) => {
      if (selectedYear !== 'all' && p.draft_year !== selectedYear) return false
      if (selectedRound !== 'all' && p.draft_round !== selectedRound) return false
      return matchesFilters(p, s)
    })
  }, [withDraft, selectedYear, selectedRound, filterPooler, search])

  const filteredWithoutDraft = useMemo(() => {
    const s = normalizeSearch(search.trim())
    // Les filtres par année/ronde ne s'appliquent pas aux joueurs sans info de repêchage
    if (selectedYear !== 'all' || selectedRound !== 'all') return []
    return withoutDraft.filter((p) => matchesFilters(p, s))
  }, [withoutDraft, selectedYear, selectedRound, filterPooler, search])

  const totalFiltered = filteredWithDraft.length + filteredWithoutDraft.length
  const assignedCount = filteredWithDraft.filter((p) => p.pooler_name).length + filteredWithoutDraft.filter((p) => p.pooler_name).length

  const grouped = useMemo(() => {
    const map = new Map<number, Map<number, DraftPick[]>>()
    for (const pick of filteredWithDraft) {
      const year = pick.draft_year!
      const round = pick.draft_round!
      if (!map.has(year)) map.set(year, new Map())
      const byRound = map.get(year)!
      if (!byRound.has(round)) byRound.set(round, [])
      byRound.get(round)!.push(pick)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, byRound]) => ({
        year,
        rounds: Array.from(byRound.entries())
          .sort(([a], [b]) => a - b)
          .map(([round, roundPicks]) => ({
            round,
            picks: roundPicks.sort((a, b) => (a.draft_overall ?? 999) - (b.draft_overall ?? 999)),
          })),
      }))
  }, [filteredWithDraft])

  const PickRow = ({ pick }: { pick: DraftPick }) => (
    <tr className="border-b hover:bg-gray-50">
      <td className="px-4 py-2 text-gray-400 w-12 text-right tabular-nums text-xs">
        {pick.draft_overall !== null ? `#${pick.draft_overall}` : DASH}
      </td>
      <td className="px-4 py-2 w-14"><TeamBadge code={pick.team_code} size="sm" /></td>
      <td className="px-4 py-2 font-medium text-gray-800 text-sm">
        {pick.last_name}, {pick.first_name}
      </td>
      <td className="px-4 py-2 text-gray-500 text-sm w-10">{pick.position ?? DASH}</td>
      <td className="px-4 py-2 w-14 text-xs text-gray-400">{pick.status ?? ''}</td>
      <td className="px-4 py-2 w-36">
        {pick.pooler_name ? (
          <span className="inline-block bg-emerald-100 text-emerald-800 text-xs font-medium px-2 py-0.5 rounded">
            {pick.pooler_name}
          </span>
        ) : (
          <span className="text-gray-300 text-xs">Non protégé</span>
        )}
      </td>
    </tr>
  )

  return (
    <div>
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-3">
          <select
            value={selectedYear}
            onChange={(e) => { setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value)); setSelectedRound('all') }}
            className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Toutes les années</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={selectedRound}
            onChange={(e) => setSelectedRound(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Toutes les rondes</option>
            {rounds.map((r) => <option key={r} value={r}>Ronde {r}</option>)}
          </select>
          <select
            value={filterPooler}
            onChange={(e) => setFilterPooler(e.target.value as 'all' | 'assigned' | 'unassigned')}
            className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tous les choix</option>
            <option value="assigned">Protégés seulement</option>
            <option value="unassigned">Non protégés seulement</option>
          </select>
          <input
            type="text"
            placeholder="Rechercher un joueur, équipe ou pooler..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-48 border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <p className="text-xs text-gray-400">
          {`${totalFiltered} joueurs affichés — ${assignedCount} protégés par un pooler`}
        </p>
      </div>

      <div className="space-y-6">
        {grouped.length === 0 && filteredWithoutDraft.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400">
            Aucun joueur ne correspond aux filtres.
          </div>
        )}

        {grouped.map(({ year, rounds: roundGroups }) => (
          <div key={year} className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-slate-800 px-5 py-3">
              <h2 className="text-white font-bold text-lg">Repêchage {year}</h2>
            </div>
            {roundGroups.map(({ round, picks: roundPicks }) => (
              <div key={round}>
                <div className="bg-slate-100 px-5 py-2 border-b">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Ronde {round}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {roundPicks.map((pick) => <PickRow key={`${pick.draft_year}-${pick.draft_overall}-${pick.player_id}`} pick={pick} />)}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))}

        {filteredWithoutDraft.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-slate-600 px-5 py-3">
              <h2 className="text-white font-bold text-lg">ELC — Info de repêchage non importée</h2>
              <p className="text-slate-300 text-xs mt-0.5">
                Ces joueurs sont sur un ELC mais leurs données de repêchage ne sont pas encore disponibles. Lancez <code>import_drafts.py</code> pour les enrichir.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {filteredWithoutDraft
                    .sort((a, b) => a.last_name.localeCompare(b.last_name, 'fr-CA'))
                    .map((pick) => <PickRow key={pick.player_id} pick={pick} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
