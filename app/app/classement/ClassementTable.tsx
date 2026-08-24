'use client'

import { useState } from 'react'
import Link from 'next/link'
import { fmtPts } from '@/lib/nhl-stats'
import SummaryTable from '@/components/SummaryTable'
import PlayerLink from '@/components/PlayerLink'
import type { PoolerStanding, PlayerContrib, PeriodContrib } from '@/lib/standings'

const RANK_COLOR = ['text-yellow-500', 'text-gray-400', 'text-amber-600']

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-CA', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'America/Toronto',
  })
}
const GROUP_LABEL = ['Attaquants', 'Défenseurs', 'Gardiens']

type PeriodPopupProps = {
  playerName: string
  isGoalie: boolean
  periods: PeriodContrib[]
  totalPoints: number
  onClose: () => void
}

function PeriodPopup({ playerName, isGoalie, periods, totalPoints, onClose }: PeriodPopupProps) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xs"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-gray-800 text-sm">{playerName}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-2"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-3 space-y-3">
          {periods.map((p, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">
                  Période {i + 1}
                  {p.removedAt === null && (
                    <span className="ml-1.5 text-green-600 font-semibold">actif</span>
                  )}
                </span>
                <span className="text-xs text-gray-400">
                  {fmtDate(p.addedAt)} → {p.removedAt ? fmtDate(p.removedAt) : '…'}
                </span>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5">
                <span className="text-sm text-gray-600">
                  {isGoalie
                    ? `${p.goalie_wins}V  ${p.goalie_otl}DP  ${p.goalie_shutouts}BL`
                    : `${p.goals}B  ${p.assists}A`}
                </span>
                <span className="text-sm font-bold text-blue-600">{fmtPts(p.points)} pts</span>
              </div>
            </div>
          ))}
          <div className="border-t pt-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Total</span>
            <span className="text-sm font-bold text-blue-700">{fmtPts(totalPoints)} pts</span>
          </div>
        </div>
      </div>
    </div>
  )
}

type Mode = 'saison'
// Futurs modes : 'mensuel' | 'journee' | 'serie'

function positionGroup(pos: string): number {
  const p = (pos ?? '').toUpperCase()
  if (p === 'G') return 2
  if (p.includes('D')) return 1
  return 0
}

const TYPE_BADGE: Record<string, string> = {
  reserviste: 'RES',
  ltir: 'LTIR',
}

function groupAndSort(players: PlayerContrib[]): PlayerContrib[] {
  const groups: PlayerContrib[][] = [[], [], []]
  for (const p of players) groups[positionGroup(p.position)].push(p)
  for (const g of groups) g.sort((a, b) => b.poolPoints - a.poolPoints)
  return groups.flat()
}

function PlayerRow({ p, onPeriodClick }: { p: PlayerContrib; onPeriodClick?: (p: PlayerContrib) => void }) {
  const isGoalie = p.position === 'G'
  const isActif = p.playerType === 'actif' && p.stillRostered
  const badge = !p.stillRostered ? 'PARTI' : TYPE_BADGE[p.playerType]

  return (
    <tr className={isActif ? 'hover:bg-gray-50' : 'hover:bg-gray-50 opacity-60'}>
      <td className="px-4 py-2">
        <PlayerLink nhlId={p.nhlId}>
          <span className={`font-medium ${isActif ? 'text-gray-800' : 'text-gray-500'}`}>
            {p.lastName}, {p.firstName}
          </span>
        </PlayerLink>
        {badge && (
          <span className="ml-2 text-xs bg-gray-100 text-gray-400 rounded px-1">{badge}</span>
        )}
        <button
          type="button"
          onClick={() => onPeriodClick?.(p)}
          className="ml-2 text-xs text-blue-500 hover:text-blue-700 font-medium"
          title="Voir le détail par période"
        >
          ↩{p.periods.length}
        </button>
      </td>
      <td className="px-2 py-2 hidden sm:table-cell text-gray-500 text-center text-xs">{p.teamAbbrev}</td>
      <td className="px-2 py-2 text-center text-gray-500">{p.gamesPlayed || '—'}</td>
      {isGoalie ? (
        <>
          <td className="px-2 py-2 text-center text-gray-500">{p.goals || '—'}</td>
          <td className="px-2 py-2 text-center text-gray-500">{p.assists || '—'}</td>
          <td className="px-2 py-2 text-center text-gray-500 hidden sm:table-cell">{p.goalieWins}</td>
          <td className="px-2 py-2 text-center text-gray-500 hidden sm:table-cell">{p.goalieOtl}</td>
          <td className="px-2 py-2 text-center text-gray-500 hidden sm:table-cell">{p.goalieShutouts || '—'}</td>
        </>
      ) : (
        <>
          <td className="px-2 py-2 text-center text-gray-500">{p.goals}</td>
          <td className="px-2 py-2 text-center text-gray-500">{p.assists}</td>
          <td className="px-2 py-2 text-center text-gray-400 hidden sm:table-cell">—</td>
          <td className="px-2 py-2 text-center text-gray-400 hidden sm:table-cell">—</td>
          <td className="px-2 py-2 text-center text-gray-400 hidden sm:table-cell">—</td>
        </>
      )}
      <td className={`px-2 py-2 text-center font-bold ${isActif ? 'text-blue-600' : 'text-gray-400'}`}>
        {fmtPts(p.poolPoints)}
      </td>
    </tr>
  )
}

export default function ClassementTable({ standings }: { standings: PoolerStanding[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [_mode] = useState<Mode>('saison')
  const [periodPopup, setPeriodPopup] = useState<PlayerContrib | null>(null)

  return (
    <div>
      {periodPopup && (
        <PeriodPopup
          playerName={`${periodPopup.lastName}, ${periodPopup.firstName}`}
          isGoalie={periodPopup.position === 'G'}
          periods={periodPopup.periods}
          totalPoints={periodPopup.poolPoints}
          onClose={() => setPeriodPopup(null)}
        />
      )}
      <SummaryTable standings={standings} />

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-6">Détail par pooler</h2>
      <div className="space-y-2">
        {standings.map((pooler, i) => {
          const sorted = groupAndSort(pooler.players)

          return (
            <div key={pooler.poolerId} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className={`text-base font-bold w-7 text-center shrink-0 ${RANK_COLOR[i] ?? 'text-gray-500'}`}>
                  {i + 1}
                </span>
                <Link
                  href={`/poolers/${pooler.poolerId}`}
                  className="flex-1 font-semibold text-gray-800 hover:text-blue-600 hover:underline"
                  onClick={e => e.stopPropagation()}
                >
                  {pooler.poolerName}
                </Link>
                <span className="text-xl font-bold text-blue-600">{fmtPts(pooler.totalPoints)}</span>
                <span className="text-sm text-gray-400">pts</span>
                <button
                  type="button"
                  className="text-gray-300 text-xs ml-1 hover:text-gray-500 px-1"
                  onClick={() => setExpanded(expanded === pooler.poolerId ? null : pooler.poolerId)}
                  aria-label={expanded === pooler.poolerId ? 'Réduire' : 'Développer'}
                >
                  {expanded === pooler.poolerId ? '▲' : '▼'}
                </button>
              </div>

              {expanded === pooler.poolerId && (
                <div className="border-t overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-2 text-left">Joueur</th>
                        <th className="px-2 py-2 hidden sm:table-cell">Éq.</th>
                        <th className="px-2 py-2">MJ</th>
                        <th className="px-2 py-2">B</th>
                        <th className="px-2 py-2">A</th>
                        <th className="px-2 py-2 hidden sm:table-cell">V</th>
                        <th className="px-2 py-2 hidden sm:table-cell">DP</th>
                        <th className="px-2 py-2 hidden sm:table-cell">BL</th>
                        <th className="px-2 py-2 text-blue-500">Pts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sorted.map((p, j) => {
                        const isFirstOfGroup = j === 0 || positionGroup(p.position) !== positionGroup(sorted[j - 1].position)
                        return (
                          <>
                            {isFirstOfGroup && (
                              <tr key={`g-${j}`} className="bg-gray-100">
                                <td colSpan={9} className="px-4 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                  {GROUP_LABEL[positionGroup(p.position)]}
                                </td>
                              </tr>
                            )}
                            <PlayerRow key={j} p={p} onPeriodClick={setPeriodPopup} />
                          </>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-blue-50 border-t">
                        <td colSpan={8} className="px-4 py-2 text-sm font-medium">
                          <Link href={`/poolers/${pooler.poolerId}`} className="text-blue-600 hover:underline">
                            Voir l&apos;alignement complet →
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-center font-bold text-blue-700">
                          {fmtPts(pooler.totalPoints)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
