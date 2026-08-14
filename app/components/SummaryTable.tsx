'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fmtPts } from '@/lib/nhl-stats'
import type { PoolerStanding } from '@/lib/standings'

const RANK_COLOR = ['text-yellow-500', 'text-gray-400', 'text-amber-600']

export default function SummaryTable({ standings }: { standings: PoolerStanding[] }) {
  const router = useRouter()

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="bg-slate-800 px-5 py-3">
        <h2 className="text-white font-bold text-sm uppercase tracking-wide">Classement — Saison complète</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 text-left w-8">#</th>
              <th className="px-4 py-2 text-left">Pooler</th>
              <th className="px-2 py-2 text-blue-500">PTS</th>
              <th className="px-2 py-2 hidden sm:table-cell">B</th>
              <th className="px-2 py-2 hidden sm:table-cell">A</th>
              <th className="px-2 py-2 hidden sm:table-cell">V</th>
              <th className="px-2 py-2 hidden sm:table-cell">DP</th>
              <th className="px-2 py-2 hidden sm:table-cell">BL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {standings.map((pooler, i) => {
              const active = pooler.players.filter(p => p.playerType === 'actif' && p.stillRostered)
              const goals    = active.reduce((s, p) => s + p.goals, 0)
              const assists  = active.reduce((s, p) => s + p.assists, 0)
              const wins     = active.reduce((s, p) => s + p.goalieWins, 0)
              const otl      = active.reduce((s, p) => s + p.goalieOtl, 0)
              const shutouts = active.reduce((s, p) => s + p.goalieShutouts, 0)
              return (
                <tr
                  key={pooler.poolerId}
                  className="hover:bg-gray-50 sm:cursor-default cursor-pointer active:bg-gray-100"
                  onClick={() => router.push(`/poolers/${pooler.poolerId}`)}
                >
                  <td className={`px-4 py-2.5 font-bold text-center ${RANK_COLOR[i] ?? 'text-gray-500'}`}>
                    {i + 1}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/poolers/${pooler.poolerId}`}
                      className="font-semibold text-gray-800 hover:text-blue-600 hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      {pooler.poolerName}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 text-center font-bold text-blue-600">{fmtPts(pooler.totalPoints)}</td>
                  <td className="px-2 py-2.5 text-center text-gray-600 hidden sm:table-cell">{goals}</td>
                  <td className="px-2 py-2.5 text-center text-gray-600 hidden sm:table-cell">{assists}</td>
                  <td className="px-2 py-2.5 text-center text-gray-600 hidden sm:table-cell">{wins}</td>
                  <td className="px-2 py-2.5 text-center text-gray-600 hidden sm:table-cell">{otl}</td>
                  <td className="px-2 py-2.5 text-center text-gray-600 hidden sm:table-cell">{shutouts}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
