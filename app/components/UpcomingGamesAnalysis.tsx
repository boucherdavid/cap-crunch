'use client'

import { useMemo, useState } from 'react'
import TeamBadge from '@/components/TeamBadge'
import { addDays, type DaySchedule, type OrgPlayer } from '@/lib/nhlWeeklySchedule'

const TYPE_BADGE: Record<string, string> = {
  reserviste: 'RÉS',
  recrue: 'REC',
}

const TYPE_LABEL: Record<string, string> = {
  actif: 'Actifs',
  reserviste: 'Réservistes',
  recrue: 'Recrues',
}

const HORIZON_OPTIONS = [2, 3, 4, 5, 6, 7]

function fmtShortDate(isoDate: string) {
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Toronto',
      day: 'numeric', month: 'short',
    }).format(new Date(isoDate + 'T12:00:00'))
  } catch { return isoDate }
}

/** Combien de matchs pour les joueurs d'un alignement dans les prochains jours — ex-onglet
 * "Analyse" de /calendrier, déplacé ici le 2026-09-23 (David) : c'est une analyse propre à un
 * alignement, pas au calendrier LNH général. Fonctionne pour n'importe quel pooler affiché,
 * pas seulement l'utilisateur connecté. */
export default function UpcomingGamesAnalysis({
  allOrgPlayers,
  schedule7,
  today,
}: {
  allOrgPlayers: OrgPlayer[]
  schedule7: DaySchedule[]
  today: string
}) {
  const [horizon, setHorizon] = useState(7)
  const [typeFilter, setTypeFilter] = useState<'all' | 'actif' | 'reserviste' | 'recrue'>('all')

  const endDate = addDays(today, horizon - 1)

  const gamesPerTeam = useMemo(() => {
    const limitStr = addDays(today, horizon)
    const counts: Record<string, number> = {}
    for (const day of schedule7) {
      if (day.date >= today && day.date < limitStr) {
        for (const g of day.games) {
          counts[g.awayAbbrev] = (counts[g.awayAbbrev] ?? 0) + 1
          counts[g.homeAbbrev] = (counts[g.homeAbbrev] ?? 0) + 1
        }
      }
    }
    return counts
  }, [schedule7, horizon, today])

  const players = useMemo(() => {
    const filtered = typeFilter === 'all'
      ? allOrgPlayers
      : allOrgPlayers.filter(p => p.playerType === typeFilter)
    return filtered
      .map(p => ({ ...p, games: gamesPerTeam[p.teamCode] ?? 0 }))
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
  }, [allOrgPlayers, gamesPerTeam, typeFilter])

  const btnClass = (active: boolean) =>
    `px-3 py-1.5 text-sm font-medium rounded border transition-colors ${
      active
        ? 'bg-blue-600 text-white border-blue-600'
        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
    }`

  if (allOrgPlayers.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        Aucun joueur actif, réserviste ou recrue dans cet alignement.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Horizon selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-600 font-medium">Horizon :</span>
        <div className="flex gap-1">
          {HORIZON_OPTIONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)} className={btnClass(horizon === h)}>
              {h}J
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 capitalize">
          {fmtShortDate(today)} – {fmtShortDate(endDate)}
        </span>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'actif', 'reserviste', 'recrue'] as const).map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} className={btnClass(typeFilter === t)}>
            {t === 'all' ? 'Tous' : TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Player grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {players.map(p => (
          <div key={p.name}
            className={`flex items-center gap-2 bg-white rounded-lg border px-3 py-2.5 ${
              p.games === 0 ? 'border-gray-200 opacity-60' : 'border-gray-200'
            }`}>
            <TeamBadge code={p.teamCode} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-gray-800 truncate">{p.name.split(', ')[0]}</div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs text-gray-400">{p.position}</span>
                {TYPE_BADGE[p.playerType] && (
                  <span className="text-xs bg-gray-100 text-gray-500 rounded px-1">
                    {TYPE_BADGE[p.playerType]}
                  </span>
                )}
              </div>
            </div>
            <div className={`text-xl font-bold tabular-nums leading-none ${
              p.games >= 5 ? 'text-green-600' :
              p.games >= 3 ? 'text-blue-600' :
              p.games >= 1 ? 'text-gray-600' :
              'text-gray-300'
            }`}>
              {p.games}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
