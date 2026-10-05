'use client'

import Link from 'next/link'
import TeamBadge from '@/components/TeamBadge'
import type { LiveNight, LivePlayer, LivePooler } from '@/lib/liveNight'
import { fmtLivePts, fmtNightDate, fmtUpdatedAt, useLiveNight } from './useLiveNight'

const OWNER_TYPE_LABEL: Record<string, string> = {
  reserviste: 'réserviste', recrue: 'recrue', ltir: 'LTIR',
}

export function LiveStatus({ night }: { night: LiveNight }) {
  if (night.isLive) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-red-300">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        En direct
      </span>
    )
  }
  if (night.allFinal) return <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Terminé</span>
  return <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">À venir</span>
}

function CardHeader({ title, night }: { title: string; night: LiveNight }) {
  return (
    <div className="bg-slate-800 px-5 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-white font-bold text-sm uppercase tracking-wide">{title}</h2>
        <LiveStatus night={night} />
      </div>
      <p className="text-[11px] text-slate-400 mt-0.5">
        Soirée du {fmtNightDate(night.date)} · non officiel
      </p>
    </div>
  )
}

function Unavailable() {
  return (
    <p className="px-5 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
      Une partie des données en direct est indisponible pour le moment (LNH).
    </p>
  )
}

export function LiveStandingsTable({ poolers, myId }: { poolers: LivePooler[]; myId: string | null }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
        <tr>
          <th className="px-4 py-2 text-left">Pooler</th>
          <th className="px-2 py-2 text-center" title="Joueurs actifs ayant joué">PJ</th>
          <th className="px-2 py-2 text-center text-blue-500">Pts</th>
          <th className="px-3 py-2 text-center">Moy</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {poolers.map((p, i) => (
          <tr key={p.poolerId} className={p.poolerId === myId ? 'bg-blue-50' : 'hover:bg-gray-50'}>
            <td className="px-4 py-2">
              <span className="text-gray-400 text-xs mr-1.5">{i + 1}.</span>
              <Link href={`/poolers/${p.poolerId}`} className="font-medium text-gray-800 hover:text-blue-600">
                {p.name}
              </Link>
            </td>
            <td className="px-2 py-2 text-center text-gray-600">{p.pj || <span className="text-gray-300">—</span>}</td>
            <td className="px-2 py-2 text-center font-bold text-blue-600 bg-yellow-50/60">
              {p.pts > 0 ? fmtLivePts(p.pts) : <span className="text-gray-300 font-normal">—</span>}
            </td>
            <td className="px-3 py-2 text-center text-xs text-gray-500">
              {p.pts > 0 && p.pj > 0 ? (p.pts / p.pj).toFixed(2).replace('.', ',') : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ScorerRow({ p, showGame = false }: { p: LivePlayer; showGame?: boolean }) {
  const goalieNote = [p.wins ? 'Victoire' : null, p.otl ? 'Défaite en prol.' : null, p.shutouts ? 'Blanchissage' : null]
    .filter(Boolean).join(', ')
  const ownerNote = p.ownerType && p.ownerType !== 'actif' ? OWNER_TYPE_LABEL[p.ownerType] ?? p.ownerType : null
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-1.5 w-12"><TeamBadge code={p.team} size="sm" /></td>
      <td className="px-2 py-1.5">
        <div className="font-medium text-gray-800 leading-tight">{p.name}</div>
        <div className="text-[11px] leading-tight">
          {p.ownerName
            ? <span className={ownerNote ? 'text-gray-400' : 'text-blue-600 font-medium'}>
                {p.ownerName}{ownerNote && ` (${ownerNote}, ne compte pas)`}
              </span>
            : <span className="text-green-600">Disponible</span>}
          {goalieNote && <span className="text-gray-500 font-medium"> · {goalieNote}</span>}
          {showGame && <span className="text-gray-400"> · {p.gameLabel}</span>}
        </div>
      </td>
      <td className="px-2 py-1.5 text-center text-gray-600">{p.goals}</td>
      <td className="px-2 py-1.5 text-center text-gray-600">{p.assists}</td>
      <td className="px-3 py-1.5 text-center font-bold text-gray-800 bg-yellow-50/60">{fmtLivePts(p.pts)}</td>
    </tr>
  )
}

export function ScorersTable({ scorers, showGame = false }: { scorers: LivePlayer[]; showGame?: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
        <tr>
          <th className="px-3 py-2" />
          <th className="px-2 py-2 text-left">Joueur</th>
          <th className="px-2 py-2 text-center">B</th>
          <th className="px-2 py-2 text-center">A</th>
          <th className="px-3 py-2 text-center">Pts</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {scorers.map(p => <ScorerRow key={p.nhlId} p={p} showGame={showGame} />)}
      </tbody>
    </table>
  )
}

/** Accueil : « Classement — ce soir » et « Pointeurs — ce soir », mis à jour pendant les matchs. */
export default function LiveNightCards({
  initial, myId, scorersLimit = 12,
}: {
  initial: LiveNight
  myId: string | null
  scorersLimit?: number
}) {
  const night = useLiveNight(initial)
  if (night.games.length === 0 && !night.error) return null
  const started = night.games.some(g => g.state !== 'FUT' && g.state !== 'PRE')

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <CardHeader title="Classement — ce soir" night={night} />
          {night.error && <Unavailable />}
          <div className="overflow-x-auto">
            <LiveStandingsTable poolers={night.poolers} myId={myId} />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <CardHeader title="Pointeurs — ce soir" night={night} />
          {night.error && <Unavailable />}
          {night.scorers.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">
              {started ? 'Aucun point pour le moment.' : 'Les matchs ne sont pas encore commencés.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <ScorersTable scorers={night.scorers.slice(0, scorersLimit)} />
            </div>
          )}
          {night.scorers.length > scorersLimit && (
            <p className="px-5 py-2 text-xs text-gray-400 border-t border-gray-100">
              + {night.scorers.length - scorersLimit} autre{night.scorers.length - scorersLimit > 1 ? 's' : ''} pointeur{night.scorers.length - scorersLimit > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
        <span>
          Points officiels mis à jour chaque nuit vers 2 h (heure de l&apos;Est)
          {night.isLive && ` · mis à jour à ${fmtUpdatedAt(night.updatedAt)}`}
        </span>
        <Link href="/en-direct" className="text-sm font-medium text-blue-600 hover:underline">
          Tout le détail en direct →
        </Link>
      </div>
    </div>
  )
}
