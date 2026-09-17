'use client'

import { useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { AhlSkater, AhlGoalie, AhlSeasonInfo } from '@/lib/ahl-stats'
import TeamBadge from '@/components/TeamBadge'
import { normalizeSearch } from '@/lib/normalizeSearch'

type Tab = 'skaters' | 'goalies'

function RookieBadge() {
  return (
    <span title="Recrue AHL" className="inline-block px-1 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 leading-none">
      R
    </span>
  )
}

export default function AhlStatsTable({
  skaters,
  goalies,
  seasons,
  selectedSeasonId,
}: {
  skaters: AhlSkater[]
  goalies: AhlGoalie[]
  seasons: AhlSeasonInfo[]
  selectedSeasonId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [tab, setTab] = useState<Tab>('skaters')
  const [search, setSearch] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [positionFilter, setPositionFilter] = useState<'all' | 'forward' | 'defense'>('all')

  const teamOptions = useMemo(() => {
    const all = [...skaters.map(s => s.teamCode), ...goalies.map(g => g.teamCode)].filter(Boolean)
    return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b, 'fr-CA'))
  }, [skaters, goalies])

  const filteredSkaters = useMemo(() => {
    const q = normalizeSearch(search.trim())
    return skaters.filter(s => {
      if (selectedTeam && s.teamCode !== selectedTeam) return false
      if (positionFilter === 'defense' && s.position !== 'D') return false
      if (positionFilter === 'forward' && s.position === 'D') return false
      if (q && !normalizeSearch(s.name).includes(q) && !normalizeSearch(s.teamCode).includes(q)) return false
      return true
    })
  }, [skaters, search, selectedTeam, positionFilter])

  const filteredGoalies = useMemo(() => {
    const q = normalizeSearch(search.trim())
    return goalies.filter(g => {
      if (selectedTeam && g.teamCode !== selectedTeam) return false
      if (q && !normalizeSearch(g.name).includes(q) && !normalizeSearch(g.teamCode).includes(q)) return false
      return true
    })
  }, [goalies, search, selectedTeam])

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`

  const hasFilters = search || selectedTeam || positionFilter !== 'all'

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Statistiques AHL</h1>
        <div className="flex items-center gap-4">
          {seasons.length > 0 && (
            <select
              value={selectedSeasonId}
              onChange={e => router.push(`${pathname}?saison=${e.target.value}`)}
              className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <span className="text-sm text-gray-500">
            {tab === 'skaters' ? `${filteredSkaters.length} joueurs` : `${filteredGoalies.length} gardiens`}
          </span>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          <button type="button" className={tabClass('skaters')} onClick={() => setTab('skaters')}>
            Patineurs
          </button>
          <button type="button" className={tabClass('goalies')} onClick={() => setTab('goalies')}>
            Gardiens
          </button>
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
          {teamOptions.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {tab === 'skaters' && (
          <div className="flex gap-1">
            {(['all', 'forward', 'defense'] as const).map(pos => (
              <button
                key={pos}
                type="button"
                onClick={() => setPositionFilter(pos)}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                  positionFilter === pos
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {pos === 'all' ? 'Tous' : pos === 'forward' ? 'Attaquants' : 'Défenseurs'}
              </button>
            ))}
          </div>
        )}
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(''); setSelectedTeam(''); setPositionFilter('all') }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Effacer
          </button>
        )}
      </div>

      {/* Table patineurs */}
      {tab === 'skaters' && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-8">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Joueur</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Équipe</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Pos</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">PJ</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">B</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">A</th>
                <th className="text-right px-4 py-3 font-medium text-gray-800 font-semibold">Pts</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">+/-</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">PUN</th>
              </tr>
            </thead>
            <tbody>
              {filteredSkaters.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    Aucun joueur ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                filteredSkaters.map((s, i) => (
                  <tr key={s.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      <span className="inline-flex items-center gap-1.5">
                        {s.name}
                        {s.rookie && <RookieBadge />}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      <TeamBadge code={s.teamCode} />
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{s.position}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">{s.gamesPlayed || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{s.goals}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{s.assists}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{s.points}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums hidden sm:table-cell">
                      {s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums hidden sm:table-cell">{s.penaltyMinutes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Table gardiens */}
      {tab === 'goalies' && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-8">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Gardien</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Équipe</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">PJ</th>
                <th className="text-right px-4 py-3 font-medium text-green-700">V</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">D</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">DP</th>
                <th className="text-right px-4 py-3 font-medium text-blue-700">BL</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">%Arr</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Moy</th>
              </tr>
            </thead>
            <tbody>
              {filteredGoalies.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    Aucun gardien ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                filteredGoalies.map((g, i) => (
                  <tr key={g.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      <span className="inline-flex items-center gap-1.5">
                        {g.name}
                        {g.rookie && <RookieBadge />}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      <TeamBadge code={g.teamCode} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">{g.gamesPlayed || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-green-700">{g.wins}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 hidden sm:table-cell">{g.losses || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 hidden sm:table-cell">{g.otLosses || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-blue-700">{g.shutouts}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">
                      {g.savePct ? g.savePct.toFixed(3) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">
                      {g.gaa ? g.gaa.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
