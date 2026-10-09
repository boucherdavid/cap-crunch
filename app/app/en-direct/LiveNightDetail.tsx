'use client'

import { useState } from 'react'
import TeamBadge from '@/components/TeamBadge'
import type { LiveNight, LivePooler } from '@/lib/liveNight'
import { fmtLivePts, fmtNightDate, fmtUpdatedAt, useLiveNight } from '@/components/live/useLiveNight'
import { LiveStatus, LiveStandingsTable, ScorersPanel } from '@/components/live/LiveNightCards'

function PoolerDetail({ pooler, rank, isMe }: { pooler: LivePooler; rank: number; isMe: boolean }) {
  const [open, setOpen] = useState(isMe)
  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${isMe ? 'ring-2 ring-blue-200' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="font-semibold text-gray-800">
          <span className="text-gray-400 text-sm mr-1.5">{rank}.</span>{pooler.name}
          {isMe && <span className="ml-1.5 text-xs text-blue-500 font-normal">(toi)</span>}
        </span>
        <span className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">{pooler.pj} PJ</span>
          <span className="font-bold text-blue-600 text-right">{fmtLivePts(pooler.pts)} pts</span>
          <span className="text-gray-400">{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && (
        pooler.players.length === 0 ? (
          <p className="px-4 pb-3 text-sm text-gray-400">Aucun joueur actif en action ce soir.</p>
        ) : (
          <div className="overflow-x-auto border-t border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-2 py-2 text-left">Joueur</th>
                  <th className="px-2 py-2 text-left hidden sm:table-cell">Match</th>
                  <th className="px-2 py-2 text-center">B</th>
                  <th className="px-2 py-2 text-center">A</th>
                  <th className="px-3 py-2 text-center">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pooler.players.map(p => {
                  const goalieNote = [p.wins ? 'Victoire' : null, p.otl ? 'Défaite en prol.' : null, p.shutouts ? 'Blanchissage' : null]
                    .filter(Boolean).join(', ')
                  return (
                    <tr key={p.nhlId} className={p.played ? '' : 'text-gray-400'}>
                      <td className="px-3 py-1.5 w-12"><TeamBadge code={p.team} size="sm" /></td>
                      <td className="px-2 py-1.5">
                        <span className={p.played ? 'font-medium text-gray-800' : ''}>{p.name}</span>
                        <span className="ml-1.5 text-[11px] text-gray-400">{p.position}</span>
                        {goalieNote && <span className="ml-1.5 text-[11px] text-gray-500">{goalieNote}</span>}
                        <div className="sm:hidden text-[11px] text-gray-400">{p.gameLabel}</div>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-500 hidden sm:table-cell">{p.gameLabel}</td>
                      <td className="px-2 py-1.5 text-center">{p.played ? p.goals : '—'}</td>
                      <td className="px-2 py-1.5 text-center">{p.played ? p.assists : '—'}</td>
                      <td className="px-3 py-1.5 text-center font-bold">{p.played ? fmtLivePts(p.pts) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

export default function LiveNightDetail({ initial, myId }: { initial: LiveNight; myId: string | null }) {
  const night = useLiveNight(initial)

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* Titre : bandeau de section du layout (SectionEyebrow, Navbar.tsx). */}
          <p className="text-sm text-gray-500">
            Soirée du {fmtNightDate(night.date)} · pointage non officiel
          </p>
        </div>
        <div className="bg-slate-800 rounded-md px-3 py-1.5"><LiveStatus night={night} /></div>
      </div>

      <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
        Calculé à partir des feuilles de match de la LNH, mis à jour chaque minute pendant les matchs
        {night.isLive && ` (dernière mise à jour : ${fmtUpdatedAt(night.updatedAt)})`}. Seuls les joueurs
        actifs comptent. Les points officiels du classement sont mis à jour chaque nuit vers 2 h
        (heure de l&apos;Est).
      </p>

      {night.error && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Une partie des données en direct est indisponible pour le moment (LNH). Réessaie dans quelques minutes.
        </p>
      )}

      {night.games.length === 0 ? (
        <p className="text-gray-400 text-sm">Aucun match de saison régulière ce soir.</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {night.games.map(g => (
              <div key={g.id} className="shrink-0 bg-white rounded-lg shadow px-3 py-2 min-w-[8.5rem]">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <TeamBadge code={g.away} size="sm" />
                  <span className="font-bold text-gray-800">{g.awayScore ?? '–'}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm mt-1">
                  <TeamBadge code={g.home} size="sm" />
                  <span className="font-bold text-gray-800">{g.homeScore ?? '–'}</span>
                </div>
                <div className={`text-[11px] mt-1 ${g.state === 'LIVE' || g.state === 'CRIT' ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                  {g.label}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <div className="space-y-5">
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-slate-800 px-5 py-3">
                  <h2 className="text-white font-bold text-sm uppercase tracking-wide">Classement de la soirée</h2>
                </div>
                <div className="overflow-x-auto">
                  <LiveStandingsTable poolers={night.poolers} myId={myId} />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-slate-800 px-5 py-3">
                  <h2 className="text-white font-bold text-sm uppercase tracking-wide">
                    Pointeurs de la LNH ({night.scorers.length})
                  </h2>
                </div>
                <ScorersPanel
                  scorers={night.scorers}
                  poolers={night.poolers}
                  myId={myId}
                  showGame
                  emptyLabel="Aucun point pour le moment."
                />
              </div>
            </div>

            <div className="lg:col-span-2 space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Détail par pooler</h2>
              {night.poolers.map((p, i) => (
                <PoolerDetail key={p.poolerId} pooler={p} rank={i + 1} isMe={p.poolerId === myId} />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
