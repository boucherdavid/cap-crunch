'use client'

import { useMemo, useState } from 'react'
import type { ProjectionRow } from './page'
import TeamBadge from '@/components/TeamBadge'
import PlayerLink from '@/components/PlayerLink'
import { normalizeSearch } from '@/lib/normalizeSearch'

type Tab = 'forwards' | 'defense' | 'goalies'
type SortKey = 'nhlCom' | 'cbs' | 'trend'

// position peut être multi-poste ("LD,RD", "C,LW"...) — jamais juste "D" seul dans nos données —
// et nullable (`players.position`). Les codes attaquants (C/LW/RW) ne contiennent jamais la
// lettre D, donc une sous-chaîne suffit.
function isDefensePosition(position: string | null): boolean {
  return (position ?? '').includes('D')
}

function normName(s: string) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/-/g, ' ').trim()
}

function AvailDot({ available }: { available: boolean }) {
  return (
    <span
      title={available ? 'Disponible' : 'Dans un pool'}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${available ? 'bg-green-500' : 'bg-slate-300'}`}
    />
  )
}

export default function ProjectionsTable({
  players,
  season,
}: {
  players: ProjectionRow[]
  season: string | null
}) {
  const [tab, setTab] = useState<Tab>('forwards')
  const [search, setSearch] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [availOnly, setAvailOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('nhlCom')

  const forwards = useMemo(() => players.filter(p => !p.isGoalie && !isDefensePosition(p.position)), [players])
  const defense = useMemo(() => players.filter(p => !p.isGoalie && isDefensePosition(p.position)), [players])
  const goalies = useMemo(() => players.filter(p => p.isGoalie), [players])

  const teamOptions = useMemo(
    () => Array.from(new Set(players.map(p => p.team).filter((t): t is string => !!t))).sort((a, b) => a.localeCompare(b, 'fr-CA')),
    [players],
  )

  const filterAndSort = (list: ProjectionRow[]) => {
    const q = normalizeSearch(search.trim())
    return list
      .filter(p => {
        if (availOnly && !p.available) return false
        if (selectedTeam && p.team !== selectedTeam) return false
        if (q) {
          const name = normalizeSearch(`${p.firstName} ${p.lastName}`)
          const rev = normalizeSearch(`${p.lastName} ${p.firstName}`)
          if (!name.includes(q) && !rev.includes(q) && !normalizeSearch(p.team ?? '').includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey]
        if (av == null && bv == null) return a.lastName.localeCompare(b.lastName)
        if (av == null) return 1
        if (bv == null) return -1
        return bv - av || a.lastName.localeCompare(b.lastName)
      })
  }

  const filteredForwards = useMemo(() => filterAndSort(forwards), [forwards, search, selectedTeam, availOnly, sortKey])
  const filteredDefense = useMemo(() => filterAndSort(defense), [defense, search, selectedTeam, availOnly, sortKey])
  const filteredGoalies = useMemo(() => filterAndSort(goalies), [goalies, search, selectedTeam, availOnly, sortKey])

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`

  const sortHeaderClass = (key: SortKey) =>
    `text-right px-4 py-3 font-medium cursor-pointer select-none ${sortKey === key ? 'text-blue-700' : 'text-gray-600 hover:text-gray-800'}`

  const unit = tab === 'goalies' ? 'vict.' : 'pts'
  const rows = tab === 'goalies' ? filteredGoalies : tab === 'defense' ? filteredDefense : filteredForwards

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Projections {season ?? ''}</h1>
        <span className="text-sm text-gray-500">{rows.length} joueur{rows.length > 1 ? 's' : ''}</span>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        NHL.com et CBS Sports (projections externes collées manuellement) + tendance pondérée sur
        les 3 dernières saisons réelles (repère rapide, pas une vraie projection) — mêmes chiffres
        que le panneau détail joueur, regroupés ici pour comparer plus facilement.
      </p>

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          <button type="button" className={tabClass('forwards')} onClick={() => setTab('forwards')}>Attaquants</button>
          <button type="button" className={tabClass('defense')} onClick={() => setTab('defense')}>Défenseurs</button>
          <button type="button" className={tabClass('goalies')} onClick={() => setTab('goalies')}>Gardiens</button>
        </div>
        <input
          type="text"
          placeholder="Nom ou équipe"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        <select
          value={selectedTeam}
          onChange={e => setSelectedTeam(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Toutes les équipes</option>
          {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setAvailOnly(v => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
            availOnly
              ? 'border-green-500 bg-green-50 text-green-700 font-medium'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Disponibles
        </button>
        {(search || selectedTeam || availOnly) && (
          <button
            type="button"
            onClick={() => { setSearch(''); setSelectedTeam(''); setAvailOnly(false) }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Effacer
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-8">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-5" title="Disponibilité" />
              <th className="text-left px-4 py-3 font-medium text-gray-600">{tab === 'goalies' ? 'Gardien' : 'Joueur'}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Équipe</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Pos</th>
              <th className={sortHeaderClass('nhlCom')} onClick={() => setSortKey('nhlCom')}>NHL.com</th>
              <th className={sortHeaderClass('cbs')} onClick={() => setSortKey('cbs')}>CBS</th>
              <th className={sortHeaderClass('trend')} onClick={() => setSortKey('trend')}>Tendance 3 saisons</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">Aucun joueur ne correspond aux filtres.</td>
              </tr>
            ) : (
              rows.map((p, i) => (
                <tr key={`${normName(p.firstName + p.lastName)}-${i}`} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5"><AvailDot available={p.available} /></td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    <PlayerLink nhlId={p.nhlId}>{p.lastName}, {p.firstName}</PlayerLink>
                  </td>
                  <td className="px-4 py-2.5"><TeamBadge code={p.team} /></td>
                  <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{p.position ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                    {p.nhlCom ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                    {p.cbs ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">
                    {p.trend ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">{unit === 'pts' ? 'Points' : 'Victoires'} projetés. Cliquez un en-tête pour trier.</p>
    </div>
  )
}
