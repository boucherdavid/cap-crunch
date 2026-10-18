'use client'

import { useEffect, useState } from 'react'
import type { NhlPlayedGame } from '@/lib/nhlPlayerGames'
import { fmtPts } from '@/lib/nhl-stats'
import { getNhlPlayedGamesAction } from './actions'

export type JournalPeriod = { addedAt: string; removedAt: string | null; gamesPlayed: number; points: number }

function todayET(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'short' })
}

/**
 * Périodes où le joueur était actif chez le pooler, avec les matchs comptés par Cap Crunch
 * (classement en cache) et les matchs joués selon la LNH (David, 2026-10-18). Même règle de
 * fenêtre que buildStandings() : un match compte si son début est après le début de la période
 * et au plus tard à sa fin.
 */
export default function ActivePeriodsPanel({ playerName, poolerName, nhlId, nhlSeason, periods }: {
  playerName: string
  poolerName: string
  nhlId: number | null
  nhlSeason: number
  periods: JournalPeriod[]
}) {
  const [nhlState, setNhlState] = useState<{ nhlId: number; games: NhlPlayedGame[] | null } | null>(null)

  useEffect(() => {
    if (!nhlId || periods.length === 0) return
    let cancelled = false
    getNhlPlayedGamesAction(nhlId, nhlSeason).then(games => {
      if (!cancelled) setNhlState({ nhlId, games })
    })
    return () => { cancelled = true }
  }, [nhlId, nhlSeason, periods.length])

  if (periods.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
        {playerName} n&apos;a jamais été actif chez {poolerName} cette saison.
      </div>
    )
  }

  const loading = !!nhlId && nhlState?.nhlId !== nhlId
  const nhlGames = nhlState?.nhlId === nhlId ? nhlState.games : null
  // Les matchs d'aujourd'hui (heure de l'Est) ne sont importés que cette nuit : exclus du compte
  // de la LNH pour ne pas signaler un faux écart.
  const today = todayET()
  const nhlCount = (p: JournalPeriod): number | null => {
    if (!nhlGames) return null
    const start = new Date(p.addedAt).getTime()
    const end = p.removedAt ? new Date(p.removedAt).getTime() : null
    return nhlGames.filter(g => {
      const t = new Date(g.startTimeUTC).getTime()
      return t > start && (end === null || t <= end) && g.gameDate < today
    }).length
  }

  const rows = periods.map(p => ({ p, nhl: nhlCount(p) }))
  const totalApp = periods.reduce((s, p) => s + p.gamesPlayed, 0)
  const totalPts = periods.reduce((s, p) => s + p.points, 0)
  const totalNhl = nhlGames ? rows.reduce((s, r) => s + (r.nhl ?? 0), 0) : null
  const nhlCell = (n: number | null, app: number) => {
    if (loading) return <span className="text-gray-300">…</span>
    if (n === null) return <span className="text-gray-400">—</span>
    return <span className={n !== app ? 'font-semibold text-amber-700' : ''}>{n}</span>
  }

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white overflow-x-auto">
      <div className="px-4 pt-3 pb-2 text-sm font-medium text-gray-700">
        Périodes actives de {playerName} chez {poolerName}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-2 text-left">Période</th>
            <th className="px-3 py-2 text-center" title="Matchs comptés par le classement de Cap Crunch">Comptés</th>
            <th className="px-3 py-2 text-center" title="Matchs joués selon le relevé officiel de la LNH">LNH</th>
            <th className="px-3 py-2 text-center">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(({ p, nhl }) => (
            <tr key={p.addedAt}>
              <td className="px-4 py-1.5 whitespace-nowrap text-gray-700">
                {fmtDay(p.addedAt)} → {p.removedAt ? fmtDay(p.removedAt) : 'aujourd’hui'}
              </td>
              <td className="px-3 py-1.5 text-center">{p.gamesPlayed}</td>
              <td className="px-3 py-1.5 text-center">{nhlCell(nhl, p.gamesPlayed)}</td>
              <td className="px-3 py-1.5 text-center text-blue-600">{fmtPts(p.points)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold">
            <td className="px-4 py-1.5 text-gray-600">Total</td>
            <td className="px-3 py-1.5 text-center">{totalApp}</td>
            <td className="px-3 py-1.5 text-center">{nhlCell(totalNhl, totalApp)}</td>
            <td className="px-3 py-1.5 text-center text-blue-600">{fmtPts(totalPts)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="px-4 py-2 text-xs text-gray-400">
        {!loading && nhlId && !nhlGames
          ? 'Relevé de la LNH indisponible pour le moment.'
          : 'Un écart est surligné en ambre. Les matchs d’aujourd’hui sont comptés après l’import de cette nuit.'}
      </p>
    </div>
  )
}
