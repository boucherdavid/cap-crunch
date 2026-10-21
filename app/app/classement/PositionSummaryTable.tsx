'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import SectionIcon, { sectionBorderClass } from '@/components/SectionIcon'
import { fmtPts, fmtPtsPerGame } from '@/lib/nhl-stats'
import { getPlayerBucket, type Bucket } from '@/lib/rosterLimits'
import type { PoolerStanding } from '@/lib/standings'

type SortKey = Bucket | 'total'
type Totals = { points: number; games: number; wins: number; shutouts: number }

const GROUPS: { key: Bucket; label: string }[] = [
  { key: 'forward', label: 'Attaquants' },
  { key: 'defense', label: 'Défenseurs' },
  { key: 'goalie', label: 'Gardiens' },
]

/**
 * Classement par position (David, 2026-10-21) : totaux des attaquants, défenseurs et gardiens de
 * chaque pooler. Mêmes données que le classement (points des périodes actives seulement, joueurs
 * partis compris) — simple addition côté client, aucune lecture de plus.
 */
export default function PositionSummaryTable({ standings }: { standings: PoolerStanding[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('total')

  const rows = standings.map(pooler => {
    const byGroup: Record<Bucket, Totals> = {
      forward: { points: 0, games: 0, wins: 0, shutouts: 0 },
      defense: { points: 0, games: 0, wins: 0, shutouts: 0 },
      goalie: { points: 0, games: 0, wins: 0, shutouts: 0 },
    }
    for (const p of pooler.players) {
      const t = byGroup[getPlayerBucket(p.position)]
      t.points += p.poolPoints
      t.games += p.gamesPlayed
      t.wins += p.goalieWins
      t.shutouts += p.goalieShutouts
    }
    return { pooler, byGroup }
  })
  const valueOf = (r: (typeof rows)[number], key: SortKey) => (key === 'total' ? r.pooler.totalPoints : r.byGroup[key].points)
  const sorted = [...rows].sort((a, b) => valueOf(b, sortKey) - valueOf(a, sortKey))
  const best = (key: SortKey) => Math.max(...rows.map(r => valueOf(r, key)))

  const sortButton = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSortKey(key)}
      className={`uppercase tracking-wide hover:text-blue-600 ${sortKey === key ? 'text-blue-600 font-bold' : ''}`}
      title={`Trier par ${label.toLowerCase()}`}
    >
      {label}{sortKey === key ? ' ▼' : ''}
    </button>
  )
  const ptsClass = (key: SortKey, value: number) =>
    `px-2 py-2.5 text-center ${value > 0 && value === best(key) ? 'font-bold text-emerald-700 bg-emerald-50' : 'font-semibold text-blue-600'}`

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className={`bg-slate-800 px-5 py-3 ${sectionBorderClass('pool')}`}>
        <h2 className="flex items-center gap-2 text-white font-bold text-sm uppercase tracking-wide">
          <SectionIcon section="pool" />
          Classement par position
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-400">
            <tr className="border-b border-gray-100">
              <th rowSpan={2} className="px-2 sm:px-4 py-2 text-left w-8">#</th>
              <th rowSpan={2} className="px-2 sm:px-4 py-2 text-left uppercase tracking-wide sticky left-0 z-10 bg-gray-50">Pooler</th>
              {GROUPS.map(g => (
                // Portrait : seule la colonne Pts est affichée, le groupe ne couvre qu'une colonne.
                <Fragment key={g.key}>
                  <th className="px-2 pt-2 pb-1 border-l border-gray-200 sm:hidden">{sortButton(g.key, g.label)}</th>
                  <th colSpan={3} className="px-2 pt-2 pb-1 border-l border-gray-200 hidden sm:table-cell">{sortButton(g.key, g.label)}</th>
                </Fragment>
              ))}
              <th rowSpan={2} className="px-2 py-2 border-l border-gray-200">{sortButton('total', 'Total')}</th>
            </tr>
            <tr className="uppercase tracking-wide">
              {GROUPS.map(g => (
                <Fragment key={g.key}>
                  <th className="px-2 pb-2 border-l border-gray-200 text-blue-500">Pts</th>
                  <th className="px-2 pb-2 hidden sm:table-cell" title={g.key === 'goalie' ? 'Victoires' : 'Matchs joués pendant qu’ils étaient actifs'}>
                    {g.key === 'goalie' ? 'V' : 'MJ'}
                  </th>
                  <th className="px-2 pb-2 hidden sm:table-cell whitespace-nowrap" title={g.key === 'goalie' ? 'Blanchissages' : 'Points par match joué'}>
                    {g.key === 'goalie' ? 'BL' : 'Pts/MJ'}
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((r, i) => (
              <tr key={r.pooler.poolerId} className="hover:bg-gray-50">
                <td className="px-2 sm:px-4 py-2.5 text-center font-bold text-gray-500">{i + 1}</td>
                <td className="px-2 sm:px-4 py-2.5 sticky left-0 z-10 bg-white">
                  <Link href={`/poolers/${r.pooler.poolerId}`} className="font-semibold text-gray-800 hover:text-blue-600 hover:underline">
                    {r.pooler.poolerName}
                  </Link>
                </td>
                {GROUPS.map(g => {
                  const t = r.byGroup[g.key]
                  return (
                    <Fragment key={g.key}>
                      <td className={`${ptsClass(g.key, t.points)} border-l border-gray-100`}>{fmtPts(t.points)}</td>
                      <td className="px-2 py-2.5 text-center text-gray-600 hidden sm:table-cell">
                        {g.key === 'goalie' ? t.wins : t.games}
                      </td>
                      <td className="px-2 py-2.5 text-center text-gray-600 hidden sm:table-cell">
                        {g.key === 'goalie' ? t.shutouts : fmtPtsPerGame(t.points, t.games)}
                      </td>
                    </Fragment>
                  )
                })}
                <td className={`${ptsClass('total', r.pooler.totalPoints)} border-l border-gray-100`}>{fmtPts(r.pooler.totalPoints)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
        En vert : le meilleur de chaque colonne. Seuls les matchs joués comme actif comptent, y compris pour un joueur parti depuis.
      </p>
    </div>
  )
}
