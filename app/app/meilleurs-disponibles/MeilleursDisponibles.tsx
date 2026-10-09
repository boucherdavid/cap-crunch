'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import TeamBadge from '@/components/TeamBadge'
import PlayerLink from '@/components/PlayerLink'
import InjuryBadge from '@/components/InjuryBadge'
import { fmtPts } from '@/lib/nhl-stats'
import type { AvailableGroups, AvailableRow } from './page'

type SortMode = 'total' | 'perGame'
type GroupKey = keyof AvailableGroups

const PAGE_SIZE = 15

const GROUPS: { key: GroupKey; title: string }[] = [
  { key: 'forwards', title: 'Attaquants' },
  { key: 'defense', title: 'Défenseurs' },
  { key: 'goalies', title: 'Gardiens' },
]

function fmtCap(n: number): string {
  return `${(n / 1_000_000).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} M$`
}

function perGame(r: AvailableRow): number {
  return r.gamesPlayed > 0 ? r.poolPoints / r.gamesPlayed : 0
}

function sortRows(rows: AvailableRow[], mode: SortMode, minGames: number): AvailableRow[] {
  if (mode === 'total') {
    return [...rows].sort((a, b) =>
      b.poolPoints - a.poolPoints || perGame(b) - perGame(a) || a.lastName.localeCompare(b.lastName))
  }
  return rows
    .filter(r => r.gamesPlayed >= minGames)
    .sort((a, b) => perGame(b) - perGame(a) || b.poolPoints - a.poolPoints || a.lastName.localeCompare(b.lastName))
}

function GroupTable({ title, rows, isGoalie }: { title: string; rows: AvailableRow[]; isGoalie: boolean }) {
  const [shown, setShown] = useState(PAGE_SIZE)
  const visible = rows.slice(0, shown)

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <h2 className="px-4 py-3 bg-slate-800 text-white font-semibold text-sm uppercase tracking-wide">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-400">Aucun joueur disponible ne correspond.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left text-gray-600">
                <th className="px-2 sm:px-4 py-2.5 font-medium w-10 hidden sm:table-cell">#</th>
                <th className="px-2 sm:px-4 py-2.5 font-medium max-sm:sticky max-sm:left-0 z-10 bg-gray-50">Joueur</th>
                <th className="px-2 sm:px-4 py-2.5 font-medium w-16 hidden sm:table-cell">Équipe</th>
                <th className="px-2 sm:px-4 py-2.5 font-medium text-right">PJ</th>
                {isGoalie ? (
                  <>
                    <th className="px-2 sm:px-4 py-2.5 font-medium text-right">V</th>
                    <th className="px-2 sm:px-4 py-2.5 font-medium text-right hidden sm:table-cell">DP</th>
                    <th className="px-2 sm:px-4 py-2.5 font-medium text-right hidden sm:table-cell">BL</th>
                  </>
                ) : (
                  <>
                    <th className="px-2 sm:px-4 py-2.5 font-medium text-right hidden sm:table-cell">B</th>
                    <th className="px-2 sm:px-4 py-2.5 font-medium text-right hidden sm:table-cell">A</th>
                  </>
                )}
                <th className="px-2 sm:px-4 py-2.5 font-medium text-right">Pts</th>
                <th className="px-2 sm:px-4 py-2.5 font-medium text-right">Pts/MJ</th>
                <th className="px-2 sm:px-4 py-2.5 font-medium text-right hidden sm:table-cell">Salaire</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.nhlId} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-2 sm:px-4 py-2 text-gray-400 hidden sm:table-cell">{i + 1}</td>
                  <td className="px-2 sm:px-4 py-2 max-sm:sticky max-sm:left-0 z-10 bg-white">
                    <PlayerLink nhlId={r.nhlId}>
                      <span className="font-medium text-gray-800">{r.firstName} {r.lastName}</span>
                    </PlayerLink>
                    {r.injury && <span className="ml-1.5"><InjuryBadge injury={r.injury} /></span>}
                    <p className="sm:hidden text-[11px] text-gray-400">{r.teamAbbrev} · {fmtCap(r.capNumber)}</p>
                  </td>
                  <td className="px-2 sm:px-4 py-2 hidden sm:table-cell"><TeamBadge code={r.teamAbbrev} /></td>
                  <td className="px-2 sm:px-4 py-2 text-right text-gray-600">{r.gamesPlayed}</td>
                  {isGoalie ? (
                    <>
                      <td className="px-2 sm:px-4 py-2 text-right text-gray-600">{r.wins}</td>
                      <td className="px-2 sm:px-4 py-2 text-right text-gray-600 hidden sm:table-cell">{r.otLosses}</td>
                      <td className="px-2 sm:px-4 py-2 text-right text-gray-600 hidden sm:table-cell">{r.shutouts}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 sm:px-4 py-2 text-right text-gray-600 hidden sm:table-cell">{r.goals}</td>
                      <td className="px-2 sm:px-4 py-2 text-right text-gray-600 hidden sm:table-cell">{r.assists}</td>
                    </>
                  )}
                  <td className="px-2 sm:px-4 py-2 text-right font-semibold text-gray-900">{fmtPts(r.poolPoints)}</td>
                  <td className="px-2 sm:px-4 py-2 text-right text-gray-600">{perGame(r).toFixed(2).replace('.', ',')}</td>
                  <td className="px-2 sm:px-4 py-2 text-right text-gray-600 whitespace-nowrap hidden sm:table-cell">{fmtCap(r.capNumber)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > shown && (
        <div className="border-t px-4 py-2.5 text-center">
          <button
            type="button"
            onClick={() => setShown(n => n + PAGE_SIZE)}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Voir plus ({Math.min(PAGE_SIZE, rows.length - shown)} de plus)
          </button>
        </div>
      )}
    </section>
  )
}

export default function MeilleursDisponibles({
  groups,
  seasonLabel,
  activeSeasonLabel,
  previousSeasonLabel,
  usePrevious,
  contractSeason,
  minGamesPerGame,
  scoring,
}: {
  groups: AvailableGroups
  seasonLabel: string
  activeSeasonLabel: string
  previousSeasonLabel: string
  usePrevious: boolean
  contractSeason: string | null
  minGamesPerGame: number
  scoring: { goal: number; assist: number; goalie_win: number; goalie_otl: number; goalie_shutout: number }
}) {
  const [sortMode, setSortMode] = useState<SortMode>('total')

  const sorted = useMemo(() => ({
    forwards: sortRows(groups.forwards, sortMode, minGamesPerGame),
    defense: sortRows(groups.defense, sortMode, minGamesPerGame),
    // Gardiens : seuil réduit de moitié, ils jouent moins souvent que les patineurs.
    goalies: sortRows(groups.goalies, sortMode, Math.max(1, Math.round(minGamesPerGame / 2))),
  }), [groups, sortMode, minGamesPerGame])

  const btn = (active: boolean) =>
    `px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap ${
      active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        {/* Titre : bandeau de section du layout (SectionEyebrow, Navbar.tsx). */}
        <p className="text-sm text-gray-500 mt-1">
          Joueurs qui ne sont dans aucun alignement, classés selon les points qu&apos;ils auraient
          rapportés avec le pointage du pool
          (but {fmtPts(scoring.goal)}, passe {fmtPts(scoring.assist)}, victoire {fmtPts(scoring.goalie_win)},
          défaite en prolongation {fmtPts(scoring.goalie_otl)}, blanchissage {fmtPts(scoring.goalie_shutout)}).
          {contractSeason && <> Seulement les joueurs sous contrat pour {contractSeason}.</>}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          <Link href="/meilleurs-disponibles" className={btn(!usePrevious)}>Saison {activeSeasonLabel}</Link>
          <Link href="/meilleurs-disponibles?saison=precedente" className={btn(usePrevious)}>Saison {previousSeasonLabel}</Link>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          <button type="button" onClick={() => setSortMode('total')} className={btn(sortMode === 'total')}>Total de points</button>
          <button type="button" onClick={() => setSortMode('perGame')} className={btn(sortMode === 'perGame')}>Points par match</button>
        </div>
        {sortMode === 'perGame' && (
          <span className="text-xs text-gray-500">
            Minimum {minGamesPerGame} match{minGamesPerGame > 1 ? 's' : ''} joué{minGamesPerGame > 1 ? 's' : ''} ({Math.max(1, Math.round(minGamesPerGame / 2))} pour les gardiens)
          </span>
        )}
      </div>

      {usePrevious && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Stats de la saison {seasonLabel}{' '}— la disponibilité et le salaire, eux, sont ceux d&apos;aujourd&apos;hui.
        </p>
      )}

      {GROUPS.map(g => (
        <GroupTable
          key={`${g.key}-${sortMode}-${seasonLabel}`}
          title={g.title}
          rows={sorted[g.key]}
          isGoalie={g.key === 'goalies'}
        />
      ))}

      <p className="text-xs text-gray-400">
        Stats : API de la LNH, saison régulière. Clique sur un joueur pour voir sa fiche et l&apos;ajouter à une de tes listes.
      </p>
    </div>
  )
}
