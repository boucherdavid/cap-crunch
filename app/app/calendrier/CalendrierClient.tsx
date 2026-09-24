'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import TeamBadge from '@/components/TeamBadge'
import type { DaySchedule, Game } from './page'
import { addDays } from '@/lib/nhlWeeklySchedule'

type RosterPlayer = { name: string; position: string; teamCode: string }

function fmtTime(utcStr: string) {
  if (!utcStr) return ''
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Toronto',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(utcStr)).replace(':', 'h') + ' ET'
  } catch { return '' }
}

function fmtDayHeader(isoDate: string) {
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Toronto',
      weekday: 'long', day: 'numeric', month: 'long',
    }).format(new Date(isoDate + 'T12:00:00'))
  } catch { return isoDate }
}

// ─── GameCard ─────────────────────────────────────────────────────────────────

function GameCard({ game, myPlayers }: { game: Game; myPlayers: RosterPlayer[] }) {
  const isFinal = ['FINAL', 'OFF'].includes(game.gameState)
  const isLive  = ['LIVE', 'CRIT'].includes(game.gameState)
  const isFut   = !isFinal && !isLive

  return (
    <div className={`bg-white rounded-lg border px-4 py-3 flex items-center gap-3 ${isLive ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <TeamBadge code={game.awayAbbrev} />
          <span className="text-xs text-gray-400">@</span>
          <TeamBadge code={game.homeAbbrev} />
          {game.gameType === 3 && (
            <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-medium">SÉR</span>
          )}
        </div>
        {myPlayers.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {myPlayers.map(p => (
              <span key={p.name} title={p.name}
                className="inline-block text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
                {p.name.split(', ')[0]} <span className="text-blue-400">{p.position}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        {isFinal && game.awayScore !== null && (
          <div className="font-bold text-gray-800 tabular-nums">{game.awayScore} – {game.homeScore}</div>
        )}
        {isLive && game.awayScore !== null && (
          <div className="font-bold text-green-700 tabular-nums">{game.awayScore} – {game.homeScore}</div>
        )}
        {isFut && (
          <div className="text-sm text-gray-500">{fmtTime(game.startTimeUTC)}</div>
        )}
        <div className={`text-xs mt-0.5 ${isLive ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
          {isLive ? '● En cours' : isFinal ? 'Final' : ''}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CalendrierClient({
  week,
  today,
  selectedDay,
  myRoster,
  mySeriesRoster,
  hasPlayoffSeason,
}: {
  week: DaySchedule[]
  today: string
  selectedDay: string
  myRoster: RosterPlayer[]
  mySeriesRoster: RosterPlayer[]
  hasPlayoffSeason: boolean
}) {
  const router = useRouter()
  const [currentDay, setCurrentDay] = useState(selectedDay)
  const [gameMode, setGameMode] = useState<'saison' | 'series'>('saison')

  const effectiveRoster = gameMode === 'series' ? mySeriesRoster : myRoster
  const myTeamCodes = useMemo(() => new Set(effectiveRoster.map(p => p.teamCode)), [effectiveRoster])

  const firstDay = week[0]?.date
  const lastDay  = week[week.length - 1]?.date

  const daySchedule = useMemo(
    () => week.find(d => d.date === currentDay) ?? { date: currentDay, games: [] },
    [week, currentDay],
  )

  const myPlayersFor = (game: Game) =>
    effectiveRoster.filter(p => p.teamCode === game.awayAbbrev || p.teamCode === game.homeAbbrev)

  const goToDay = (day: string) => {
    if (!firstDay || !lastDay || day < firstDay || day > lastDay) {
      router.push(`/calendrier?jour=${day}`)
    } else {
      setCurrentDay(day)
    }
  }

  const prevDay = addDays(currentDay, -1)
  const nextDay = addDays(currentDay, 1)
  const isToday = currentDay === today

  const myGamesCount = daySchedule.games.filter(
    g => myTeamCodes.has(g.awayAbbrev) || myTeamCodes.has(g.homeAbbrev)
  ).length

  const navBtnClass = 'px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-default'

  return (
    <div className="space-y-5">

      {/* Title */}
      <h1 className="text-2xl font-bold text-gray-800">Calendrier LNH</h1>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => goToDay(prevDay)} className={navBtnClass}>←</button>
          <button onClick={() => goToDay(today)} disabled={isToday} className={navBtnClass}>
            Aujourd&apos;hui
          </button>
          <button onClick={() => goToDay(nextDay)} className={navBtnClass}>→</button>
        </div>

        <input
          type="date"
          value={currentDay}
          onChange={e => e.target.value && goToDay(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {hasPlayoffSeason && (
          <div className="flex rounded overflow-hidden border border-gray-300 ml-auto">
            <button
              onClick={() => setGameMode('saison')}
              className={`px-3 py-1.5 text-sm transition-colors ${gameMode === 'saison' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              Saison
            </button>
            <button
              onClick={() => setGameMode('series')}
              className={`px-3 py-1.5 text-sm transition-colors ${gameMode === 'series' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              Séries
            </button>
          </div>
        )}
      </div>

      {/* Day header */}
      <div className="flex items-center gap-3">
        <h2 className={`text-lg font-semibold capitalize ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
          {fmtDayHeader(currentDay)}
        </h2>
        {isToday && (
          <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5 font-medium">
            Aujourd&apos;hui
          </span>
        )}
        {daySchedule.games.length > 0 && (
          <span className="text-sm text-gray-400 ml-auto">
            {daySchedule.games.length} match{daySchedule.games.length > 1 ? 's' : ''}
            {myGamesCount > 0 && effectiveRoster.length > 0 && (
              <> · <span className="text-blue-600">{myGamesCount} avec mes joueurs</span></>
            )}
          </span>
        )}
      </div>

      {/* Games */}
      {daySchedule.games.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-12">Aucun match ce jour.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {daySchedule.games.map(g => (
            <GameCard key={g.id} game={g} myPlayers={myPlayersFor(g)} />
          ))}
        </div>
      )}
    </div>
  )
}
