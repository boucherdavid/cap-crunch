'use client'

import Link from 'next/link'
import SectionIcon, { sectionBorderClass } from '@/components/SectionIcon'
import type { PoolerStanding } from '@/lib/standings'
import type { LivePlayer, LivePooler } from '@/lib/liveNight'
import { LiveStandingsTable, ScorersPanel } from './LiveNightCards'
import { fmtNightDate } from './useLiveNight'

const SCORERS_LIMIT = 12

/** Classement officiel d'une journée → même forme que le pointage en direct, pour réutiliser ses tableaux. */
function toLivePoolers(standings: PoolerStanding[]): LivePooler[] {
  return standings.map(s => {
    const players: LivePlayer[] = s.players
      .filter(p => p.gamesPlayed > 0)
      .map(p => ({
        nhlId: p.nhlId ?? 0,
        name: `${p.firstName} ${p.lastName}`,
        team: p.teamAbbrev,
        position: p.position,
        goals: p.goals,
        assists: p.assists,
        wins: p.goalieWins,
        otl: p.goalieOtl,
        shutouts: p.goalieShutouts,
        pts: p.poolPoints,
        played: true,
        gameLabel: '',
        ownerId: s.poolerId,
        ownerName: s.poolerName,
        ownerType: 'actif',
      }))
    return { poolerId: s.poolerId, name: s.poolerName, pj: players.length, pts: s.totalPoints, players }
  })
}

function CardHeader({ title, day }: { title: string; day: string }) {
  return (
    <div className={`bg-slate-800 px-5 py-3 ${sectionBorderClass('pool')}`}>
      <h2 className="flex items-center gap-2 text-white font-bold text-sm uppercase tracking-wide">
        <SectionIcon section="pool" />
        <Link href={`/classement/quotidien?jour=${day}`} className="hover:underline">{title}</Link>
      </h2>
      <p className="text-[11px] text-slate-400 mt-0.5">Soirée du {fmtNightDate(day)} · points officiels</p>
    </div>
  )
}

/**
 * Accueil (David, 2026-10-25) : une fois la soirée terminée et ses points officiels importés,
 * remplace les cartes « ce soir » du pointage en direct — même information, version officielle.
 */
export default function DailyStandingsCards({
  day, standings, myId,
}: {
  day: string
  standings: PoolerStanding[]
  myId: string | null
}) {
  const poolers = toLivePoolers(standings)
  const scorers = poolers.flatMap(p => p.players)
    .filter(p => p.pts > 0)
    .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name, 'fr-CA'))

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <CardHeader title="Classement de la soirée" day={day} />
          <div className="overflow-x-auto">
            <LiveStandingsTable poolers={poolers} myId={myId} />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <CardHeader title="Pointeurs du pool" day={day} />
          <ScorersPanel
            scorers={scorers}
            poolers={poolers}
            myId={myId}
            limit={SCORERS_LIMIT}
            activeOnly
            emptyLabel="Aucun joueur actif du pool n’a marqué de point."
          />
        </div>
      </div>
      <div className="text-right">
        <Link href={`/classement/quotidien?jour=${day}`} className="text-sm font-medium text-blue-600 hover:underline">
          Classement quotidien détaillé →
        </Link>
      </div>
    </div>
  )
}
