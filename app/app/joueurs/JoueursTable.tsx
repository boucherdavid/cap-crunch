'use client'

import { Fragment, useMemo, useState } from 'react'
import type { PlayerContract, PlayerRow } from './page'
import { teamColor } from '@/lib/nhl-colors'
import TeamBadge from '@/components/TeamBadge'
import PlayerLink from '@/components/PlayerLink'
import { normalizeSearch } from '@/lib/normalizeSearch'

const CURRENT_SEASON = '2025-26'
const SEASONS = ['2025-26', '2026-27', '2027-28', '2028-29', '2029-30']
const DASH = '\u2014'
const STAR = '\u2605'


const formatCap = (amount: number | null) => {
  if (!amount) return DASH
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

const statusColor = (status: string | null) => {
  if (status === 'UFA') return 'bg-blue-100 text-blue-800'
  if (status === 'RFA') return 'bg-orange-100 text-orange-800'
  if (status === 'ELC') return 'bg-green-100 text-green-800'
  return 'bg-gray-100 text-gray-600'
}

const getSeasonCap = (contracts: PlayerContract[] | null, season: string) => {
  return contracts?.find((contract) => contract.season === season)?.cap_number ?? 0
}

const hasContract = (player: PlayerRow) =>
  (player.player_contracts?.length ?? 0) > 0

const POSITION_ORDER: Record<string, number> = { forward: 0, defense: 1, goalie: 2 }
const POSITION_LABEL: Record<string, string> = { forward: 'Attaquants', defense: 'Défenseurs', goalie: 'Gardiens' }

const positionBucket = (position: string | null): string => {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

const sortPlayers = (a: PlayerRow, b: PlayerRow) => {
  const teamA = a.teams?.code ?? 'ZZZ'
  const teamB = b.teams?.code ?? 'ZZZ'
  const teamCompare = teamA.localeCompare(teamB, 'fr-CA')
  if (teamCompare !== 0) return teamCompare

  const posCompare = POSITION_ORDER[positionBucket(a.position)] - POSITION_ORDER[positionBucket(b.position)]
  if (posCompare !== 0) return posCompare

  const capCompare = getSeasonCap(b.player_contracts, CURRENT_SEASON) - getSeasonCap(a.player_contracts, CURRENT_SEASON)
  if (capCompare !== 0) return capCompare

  const lastNameCompare = a.last_name.localeCompare(b.last_name, 'fr-CA')
  if (lastNameCompare !== 0) return lastNameCompare

  return a.first_name.localeCompare(b.first_name, 'fr-CA')
}

const sortProspects = (a: PlayerRow, b: PlayerRow) => {
  const yearB = b.draft_year ?? 0
  const yearA = a.draft_year ?? 0
  if (yearB !== yearA) return yearB - yearA

  const roundA = a.draft_round ?? 99
  const roundB = b.draft_round ?? 99
  if (roundA !== roundB) return roundA - roundB

  const overallA = a.draft_overall ?? 999
  const overallB = b.draft_overall ?? 999
  return overallA - overallB
}

export default function JoueursTable({ players }: { players: PlayerRow[] }) {
  const [search, setSearch] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [salaryMode, setSalaryMode] = useState<'all' | 'lt' | 'between' | 'gt'>('all')
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'elc' | 'non-elc'>('all')
  const [showProspects, setShowProspects] = useState(false)

  const clearFilters = () => {
    setSearch('')
    setSelectedTeam('')
    setSalaryMode('all')
    setSalaryMin('')
    setSalaryMax('')
    setStatusFilter('all')
  }

  const { lnhPlayers, prospects } = useMemo(() => ({
    lnhPlayers: players.filter(hasContract),
    prospects: players.filter((p) => !hasContract(p) && p.is_rookie),
  }), [players])

  const teamOptions = useMemo(() => {
    return Array.from(new Set(lnhPlayers.map((player) => player.teams?.code ?? '').filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'fr-CA'))
  }, [lnhPlayers])

  const filteredPlayers = useMemo(() => {
    const normalizedSearch = normalizeSearch(search.trim())
    const minValue = salaryMin === '' ? null : Number(salaryMin)
    const maxValue = salaryMax === '' ? null : Number(salaryMax)

    return [...lnhPlayers]
      .filter((player) => {
        const teamCode = player.teams?.code ?? ''
        const fullName = normalizeSearch(`${player.first_name} ${player.last_name}`)
        const reverseName = normalizeSearch(`${player.last_name} ${player.first_name}`)
        const currentCap = getSeasonCap(player.player_contracts, CURRENT_SEASON)
        const isElc = player.status === 'ELC'

        if (selectedTeam !== '' && teamCode !== selectedTeam) return false

        if (normalizedSearch !== '' && !(
          fullName.includes(normalizedSearch)
          || reverseName.includes(normalizedSearch)
          || normalizeSearch(teamCode).includes(normalizedSearch)
        )) {
          return false
        }

        if (statusFilter === 'elc' && !isElc) return false
        if (statusFilter === 'non-elc' && isElc) return false

        if (salaryMode === 'lt' && maxValue !== null && !(currentCap < maxValue)) return false
        if (salaryMode === 'gt' && minValue !== null && !(currentCap > minValue)) return false
        if (salaryMode === 'between') {
          if (minValue !== null && currentCap < minValue) return false
          if (maxValue !== null && currentCap > maxValue) return false
        }

        return true
      })
      .sort(sortPlayers)
  }, [lnhPlayers, search, selectedTeam, salaryMode, salaryMin, salaryMax, statusFilter])

  const filteredProspects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return [...prospects]
      .filter((p) => {
        if (!normalizedSearch) return true
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase()
        const rev = `${p.last_name} ${p.first_name}`.toLowerCase()
        return fullName.includes(normalizedSearch) || rev.includes(normalizedSearch)
      })
      .sort(sortProspects)
  }, [prospects, search])

  const totalColumns = 5 + SEASONS.length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Contrats LNH</h1>
        <span className="text-sm text-gray-500">{filteredPlayers.length} joueurs</span>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-sm text-gray-500">{'Affinez l\u2019affichage par nom, \u00e9quipe, statut ou salaire.'}</p>
          <button
            type="button"
            onClick={clearFilters}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Effacer les filtres
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder={'Nom ou \u00e9quipe'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{'Toutes les \u00e9quipes'}</option>
            {teamOptions.map((teamCode) => (
              <option key={teamCode} value={teamCode}>{teamCode}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'elc' | 'non-elc')}
            className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="elc">ELC seulement</option>
            <option value="non-elc">Non-ELC</option>
          </select>
          <select
            value={salaryMode}
            onChange={(e) => setSalaryMode(e.target.value as 'all' | 'lt' | 'between' | 'gt')}
            className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tous les salaires</option>
            <option value="lt">Plus petit que</option>
            <option value="between">Entre X et Y</option>
            <option value="gt">Plus grand que</option>
          </select>
          <div className="flex gap-2">
            {(salaryMode === 'gt' || salaryMode === 'between') && (
              <input
                type="number"
                inputMode="numeric"
                placeholder="Min"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            {(salaryMode === 'lt' || salaryMode === 'between') && (
              <input
                type="number"
                inputMode="numeric"
                placeholder="Max"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Joueur</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">{'\u00c9quipe'}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Pos</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">{'\u00c2ge'}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">{'Exp\u00e9rience'}</th>
              {SEASONS.map((season) => (
                <th key={season} className={`text-right px-4 py-3 font-medium text-gray-600${season !== CURRENT_SEASON ? ' hidden lg:table-cell' : ''}`}>{season}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.map((player, index) => {
              const contracts = player.player_contracts
              const getContract = (season: string) => contracts?.find((contract) => contract.season === season)
              const teamCode = player.teams?.code ?? 'Sans \u00e9quipe'
              const teamName = player.teams?.name ?? 'Sans \u00e9quipe'
              const bucket = positionBucket(player.position)
              const prev = index > 0 ? filteredPlayers[index - 1] : null
              const prevTeamCode = prev?.teams?.code ?? 'Sans \u00e9quipe'
              const prevBucket = prev ? positionBucket(prev.position) : null
              const showTeamHeader = index === 0 || prevTeamCode !== teamCode
              const showPosHeader = showTeamHeader || prevBucket !== bucket

              return (
                <Fragment key={player.id}>
                  {showTeamHeader && (() => {
                    const colors = teamColor(teamCode)
                    return (
                      <tr className="border-t-4 border-slate-200">
                        <td
                          colSpan={totalColumns}
                          className="px-4 py-2 text-sm font-semibold text-white"
                          style={{ background: `linear-gradient(90deg, ${colors.primary} 0%, ${colors.secondary} 100%)` }}
                        >
                          {teamCode}
                          <span className="ml-2 text-xs font-normal uppercase tracking-wide opacity-80">{teamName}</span>
                        </td>
                      </tr>
                    )
                  })()}
                  {showPosHeader && (() => {
                    const colors = teamColor(teamCode)
                    // Si la couleur secondaire est trop pâle, on utilise la primaire
                    const hex = colors.secondary.replace('#', '')
                    const r = parseInt(hex.slice(0, 2), 16)
                    const g = parseInt(hex.slice(2, 4), 16)
                    const b = parseInt(hex.slice(4, 6), 16)
                    const isLight = (r * 299 + g * 587 + b * 114) / 1000 > 180
                    const bgColor = isLight ? colors.primary : colors.secondary
                    return (
                      <tr>
                        <td
                          colSpan={totalColumns}
                          className="px-6 py-1.5 text-xs font-semibold uppercase tracking-wider text-white"
                          style={{ backgroundColor: bgColor }}
                        >
                          {POSITION_LABEL[bucket]}
                        </td>
                      </tr>
                    )
                  })()}
                  <tr className="border-b hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      <span className="inline-flex items-center gap-2">
                        <span
                          title={player.is_available ? 'Disponible' : 'Dans un pool'}
                          className={`inline-block w-2 h-2 rounded-full shrink-0 ${player.is_available ? 'bg-green-500' : 'bg-slate-300'}`}
                        />
                        <PlayerLink nhlId={player.nhl_id}>
                          {player.last_name}, {player.first_name}
                        </PlayerLink>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TeamBadge code={player.teams?.code} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{player.position ?? DASH}</td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{player.age ?? DASH}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {player.status === 'ELC'
                        ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Recrue</span>
                        : <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{'V\u00e9t\u00e9ran'}</span>
                      }
                    </td>
                    {SEASONS.map((season) => {
                      const contract = getContract(season)
                      return (
                        <td key={season} className={`px-4 py-3 text-right${season !== CURRENT_SEASON ? ' hidden lg:table-cell' : ''}`}>
                          {contract ? (
                            <span>
                              {contract.contract_status && contract.contract_status !== player.status && (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium mr-1 ${statusColor(contract.contract_status)}`}>
                                  {contract.contract_status}
                                </span>
                              )}
                              <span className="text-gray-700">{formatCap(contract.cap_number)}</span>
                            </span>
                          ) : (
                            <span className="text-gray-300">{DASH}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {filteredPlayers.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            Aucun joueur ne correspond aux filtres.<br />
            <span className="text-sm">{'Essayez d\u2019\u00e9largir la recherche ou les crit\u00e8res.'}</span>
          </div>
        )}
      </div>

      {/* Section prospects repêchés sans contrat */}
      {prospects.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <button
            type="button"
            onClick={() => setShowProspects((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div>
              <span className="font-semibold text-gray-700">
                {`${STAR} Prospects rep\u00each\u00e9s sans contrat`}
              </span>
              <span className="ml-3 text-sm text-gray-400">
                {`${filteredProspects.length} joueur${filteredProspects.length > 1 ? 's' : ''}`}
              </span>
            </div>
            <span className="text-gray-400 text-sm">{showProspects ? '\u25b2' : '\u25bc'}</span>
          </button>

          {showProspects && (
            <div className="border-t overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Joueur</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">{'\u00c9quipe'}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Pos</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Rep\u00each\u00e9</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Ronde</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Rang</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProspects.map((player) => (
                    <tr key={player.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        <span className="text-yellow-500 mr-1">{STAR}</span>
                        <PlayerLink nhlId={player.nhl_id}>
                          {player.last_name}, {player.first_name}
                        </PlayerLink>
                      </td>
                      <td className="px-4 py-3"><TeamBadge code={player.teams?.code} /></td>
                      <td className="px-4 py-3 text-gray-600">{player.position ?? DASH}</td>
                      <td className="px-4 py-3 text-gray-600">{player.draft_year ?? DASH}</td>
                      <td className="px-4 py-3 text-gray-600">{player.draft_round ?? DASH}</td>
                      <td className="px-4 py-3 text-gray-600">{player.draft_overall ?? DASH}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
