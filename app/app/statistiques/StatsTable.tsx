'use client'

import { useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { SkaterStat, GoalieStat } from './page'
import TeamBadge from '@/components/TeamBadge'
import PlayerLink from '@/components/PlayerLink'
import type { StreakInfo, GoalieBadgeType } from '@/lib/streaks'
import StreakLegend from '@/components/StreakLegend'
import { normalizeSearch } from '@/lib/normalizeSearch'

const BADGE_META: Record<NonNullable<StreakInfo['badge']>, { emoji: string; label: string }> = {
  en_feu:    { emoji: '🔥', label: 'En feu'    },
  en_forme:  { emoji: '✅', label: 'En forme'  },
  en_panne:  { emoji: '🧊', label: 'En panne'  },
  en_crise:  { emoji: '🚨', label: 'En crise'  },
  en_hausse: { emoji: '📈', label: 'En hausse' },
  en_baisse: { emoji: '📉', label: 'En baisse' },
}

const GOALIE_BADGE_META: Record<NonNullable<GoalieBadgeType>, { emoji: string; label: (v?: number) => string }> = {
  wins_streak: { emoji: '🏆', label: (v) => `${v} victoires consécutives` },
  sv_elite:    { emoji: '🛡️', label: (v) => `Sv% récent : ${v?.toFixed(1)}%` },
  gaa_basse:   { emoji: '🎯', label: (v) => `GAA récente : ${v?.toFixed(2)}` },
}

function StreakBadge({ info }: { info: StreakInfo | undefined }) {
  if (!info?.badge) return null
  const meta = BADGE_META[info.badge]
  const hasCount = info.badge === 'en_feu' || info.badge === 'en_forme' || info.badge === 'en_panne' || info.badge === 'en_crise'
  const title = hasCount ? `${meta.label} — ${info.count} matchs consécutifs` : meta.label
  return <span className="text-sm" title={title}>{meta.emoji}</span>
}

function GoalieBadge({ info }: { info: StreakInfo | undefined }) {
  if (!info?.goalieBadge) return null
  const meta = GOALIE_BADGE_META[info.goalieBadge]
  return <span className="text-sm ml-0.5" title={meta.label(info.goalieValue)}>{meta.emoji}</span>
}

type Tab = 'skaters' | 'goalies'

function AvailDot({ available }: { available: boolean }) {
  return (
    <span
      title={available ? 'Disponible' : 'Dans un pool'}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${available ? 'bg-green-500' : 'bg-slate-300'}`}
    />
  )
}

function PoolerBadges({ poolers }: { poolers: string[] }) {
  if (poolers.length === 0) return null
  return (
    <span className="flex gap-0.5 flex-wrap">
      {poolers.map(name => {
        const initials = name.split(' ').map((w: string) => w[0] ?? '').slice(0, 2).join('').toUpperCase()
        return (
          <span key={name} title={name}
            className="inline-block px-1 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-700 leading-none">
            {initials}
          </span>
        )
      })}
    </span>
  )
}

function RookieBadge() {
  return (
    <span title="Recrue (ELC)" className="inline-block px-1 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 leading-none">
      R
    </span>
  )
}

function formatTOI(seconds: number): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function normName(s: string) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/-/g, ' ').trim()
}

export default function StatsTable({
  skaters,
  goalies,
  takenNames,
  rookieNames,
  gameMode,
  playoffPicksMap = {},
  streaksMap = {},
}: {
  skaters: SkaterStat[]
  goalies: GoalieStat[]
  takenNames: string[]
  rookieNames: string[]
  gameMode: 'regular' | 'series'
  playoffPicksMap?: Record<string, string[]>
  streaksMap?: Record<number, StreakInfo>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [tab, setTab] = useState<Tab>('skaters')
  const [search, setSearch] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [availOnly, setAvailOnly] = useState(false)
  const [positionFilter, setPositionFilter] = useState<'all' | 'forward' | 'defense'>('all')

  const takenSet = useMemo(() => new Set(takenNames), [takenNames])
  const rookieSet = useMemo(() => new Set(rookieNames), [rookieNames])

  const isRookie = (firstName: string, lastName: string) =>
    rookieSet.has(normName(`${firstName} ${lastName}`))

  // Saison régulière : pas dans un roster actif
  // Séries : pas sélectionné par un participant du pool des séries
  const isAvailable = (firstName: string, lastName: string) => {
    const key = normName(`${firstName} ${lastName}`)
    return gameMode === 'series'
      ? !(key in playoffPicksMap)
      : !takenSet.has(key)
  }

  const getPickedBy = (firstName: string, lastName: string): string[] =>
    playoffPicksMap[normName(`${firstName} ${lastName}`)] ?? []

  const teamOptions = useMemo(() => {
    const all = [
      ...skaters.map(s => s.teamAbbrev),
      ...goalies.map(g => g.teamAbbrev),
    ].filter(t => !/^\d TM$/.test(t) && !t.includes(','))
    return Array.from(new Set(all.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr-CA'))
  }, [skaters, goalies])

  const filteredSkaters = useMemo(() => {
    const q = normalizeSearch(search.trim())
    return skaters
      .filter(s => {
        if (availOnly && !isAvailable(s.firstName, s.lastName)) return false
        if (selectedTeam && s.teamAbbrev !== selectedTeam) return false
        if (positionFilter === 'defense' && s.position !== 'D') return false
        if (positionFilter === 'forward' && s.position === 'D') return false
        if (q) {
          const name = normalizeSearch(`${s.firstName} ${s.lastName}`)
          const rev = normalizeSearch(`${s.lastName} ${s.firstName}`)
          if (!name.includes(q) && !rev.includes(q) && !normalizeSearch(s.teamAbbrev).includes(q)) return false
        }
        return true
      })
      .sort((a, b) => b.points - a.points || b.goals - a.goals || a.lastName.localeCompare(b.lastName))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skaters, search, selectedTeam, availOnly, positionFilter, takenSet])

  const filteredGoalies = useMemo(() => {
    const q = normalizeSearch(search.trim())
    return goalies
      .filter(g => {
        if (availOnly && !isAvailable(g.firstName, g.lastName)) return false
        if (selectedTeam && g.teamAbbrev !== selectedTeam) return false
        if (q) {
          const name = normalizeSearch(`${g.firstName} ${g.lastName}`)
          const rev = normalizeSearch(`${g.lastName} ${g.firstName}`)
          if (!name.includes(q) && !rev.includes(q) && !normalizeSearch(g.teamAbbrev).includes(q)) return false
        }
        return true
      })
      .sort((a, b) => b.wins - a.wins || b.shutouts - a.shutouts || a.lastName.localeCompare(b.lastName))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalies, search, selectedTeam, availOnly, takenSet])

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`

  const hasFilters = search || selectedTeam || availOnly || positionFilter !== 'all'

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Statistiques LNH</h1>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 rounded-lg border border-slate-300 p-0.5">
            <button
              type="button"
              onClick={() => router.push(pathname)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                gameMode === 'regular' ? 'bg-blue-600 text-white font-medium' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Saison régulière
            </button>
            <button
              type="button"
              onClick={() => router.push(`${pathname}?saison=series`)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                gameMode === 'series' ? 'bg-blue-600 text-white font-medium' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Séries
            </button>
          </div>
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
          {gameMode === 'series' ? 'Libres' : 'Disponibles'}
        </button>
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
            onClick={() => { setSearch(''); setSelectedTeam(''); setAvailOnly(false); setPositionFilter('all') }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Effacer
          </button>
        )}
      </div>

      <div className="mb-4"><StreakLegend /></div>

      {/* Table patineurs */}
      {tab === 'skaters' && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-8">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-5" title="Disponibilité" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Joueur</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Équipe</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Pos</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">PJ</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Tps/M</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">B</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">A</th>
                <th className="text-right px-4 py-3 font-medium text-gray-800 font-semibold">Pts</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Pts/MJ</th>
              </tr>
            </thead>
            <tbody>
              {filteredSkaters.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-gray-400">
                    Aucun joueur ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                filteredSkaters.map((s, i) => {
                  const avail = isAvailable(s.firstName, s.lastName)
                  const pickedBy = gameMode === 'series' ? getPickedBy(s.firstName, s.lastName) : []
                  const ppm = s.gamesPlayed > 0 ? (s.points / s.gamesPlayed).toFixed(2) : '—'
                  return (
                    <tr key={s.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        {gameMode === 'series'
                          ? <PoolerBadges poolers={pickedBy} />
                          : <AvailDot available={avail} />}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        <span className="inline-flex items-center gap-1.5">
                          <PlayerLink nhlId={s.id}>
                            {s.lastName}, {s.firstName}
                          </PlayerLink>
                          {gameMode === 'regular' && isRookie(s.firstName, s.lastName) && <RookieBadge />}
                          <StreakBadge info={streaksMap[s.id]} />
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        <TeamBadge code={s.teamAbbrev} />
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{s.position}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">{s.gamesPlayed || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums hidden sm:table-cell">{formatTOI(s.toi)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{s.goals}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{s.assists}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{s.points}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums hidden sm:table-cell">{ppm}</td>
                    </tr>
                  )
                })
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
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-5" title="Disponibilité" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Gardien</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Équipe</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">PJ</th>
                <th className="text-right px-4 py-3 font-medium text-green-700">V</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">D</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">DP</th>
                <th className="text-right px-4 py-3 font-medium text-blue-700">BL</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">%Arr</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Moy</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">B</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">A</th>
              </tr>
            </thead>
            <tbody>
              {filteredGoalies.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-12 text-gray-400">
                    Aucun gardien ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                filteredGoalies.map((g, i) => {
                  const avail = isAvailable(g.firstName, g.lastName)
                  const pickedBy = gameMode === 'series' ? getPickedBy(g.firstName, g.lastName) : []
                  return (
                    <tr key={g.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        {gameMode === 'series'
                          ? <PoolerBadges poolers={pickedBy} />
                          : <AvailDot available={avail} />}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        <span className="inline-flex items-center gap-1.5">
                          <PlayerLink nhlId={g.id}>
                            {g.lastName}, {g.firstName}
                          </PlayerLink>
                          {gameMode === 'regular' && isRookie(g.firstName, g.lastName) && <RookieBadge />}
                          <StreakBadge info={streaksMap[g.id]} />
                          <GoalieBadge info={streaksMap[g.id]} />
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        <TeamBadge code={g.teamAbbrev} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">{g.gamesStarted || '—'}</td>
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
                      <td className="px-4 py-2.5 text-right text-gray-700 hidden sm:table-cell">{g.goals}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700 hidden sm:table-cell">{g.assists}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
