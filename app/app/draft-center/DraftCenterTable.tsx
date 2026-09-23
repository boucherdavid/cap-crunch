'use client'

import { Fragment, useState } from 'react'
import { DRAFT_SOURCES, DRAFT_SOURCES_RANKED, DRAFT_SOURCES_INFOONLY } from '@/lib/draft-sources'

type Ranking = { source: string; rank: number; source_url: string | null }
type Prospect = {
  id: number
  first_name: string
  last_name: string
  position: string | null
  team: string | null
  games_played: number | null
  goals: number | null
  assists: number | null
  points: number | null
  pim: number | null
  rankings: Ranking[]
  avgRank: number | null
  sourceCount: number
}

const COL_COUNT = 4 + DRAFT_SOURCES.length + 1 // moy+joueur+pos+PTS + sources + chevron

export default function DraftCenterTable({ prospects, draftYear }: { prospects: Prospect[]; draftYear: number }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const toggleExpand = (id: number) => setExpanded(prev => prev === id ? null : id)
  const rankMap = (rankings: Ranking[]) => Object.fromEntries(rankings.map(r => [r.source, r]))

  return (
    <div>
      {/* Légende */}
      <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Légende des sources</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-xs text-gray-600">
          <span><span className="font-bold text-blue-700">1</span> Rang 1–5</span>
          <span><span className="font-bold text-gray-700">6</span> Rang 6–15</span>
          <span><span className="font-bold text-gray-400">16</span> Rang 16+</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1">
          {DRAFT_SOURCES_RANKED.map(s => (
            <span key={s.key} className="text-xs text-gray-600">
              <span className="font-semibold text-gray-800">{s.abbr}</span> — {s.label}
            </span>
          ))}
          {DRAFT_SOURCES_INFOONLY.map(s => (
            <span key={s.key} className="text-xs text-amber-700">
              <span className="font-semibold">{s.abbr}</span> — {s.label} <span className="italic">(informatif)</span>
            </span>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-3">
        {prospects.length} prospects · rang moyen calculé sur {DRAFT_SOURCES_RANKED.length} sources · cliquer sur un joueur pour voir les points amassés au cours de la dernière saison
      </p>

      {/* max-h + overflow-auto (pas juste overflow-x-auto) : nécessaire pour que le sticky des
          <th> ait un effet visible — voir ProjectionsTable.tsx (David, 2026-09-22). Les 2
          premières colonnes étaient déjà figées horizontalement (sticky left-*) ; elles
          reçoivent maintenant aussi top-0 pour rester figées dans les deux sens (coin gelé),
          d'où le z-index plus élevé (z-20) pour passer par-dessus les autres en-têtes (z-10). */}
      <div className="bg-white rounded-lg shadow overflow-auto max-h-[75vh]">
        <table className="text-sm border-collapse" style={{ minWidth: '1100px' }}>
          <thead>
            <tr className="border-b">
              <th className="text-center px-3 py-3 font-medium text-gray-600 sticky left-0 top-0 bg-gray-50 z-20 min-w-[72px]">Moy.</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600 sticky left-[72px] top-0 bg-gray-50 z-20 min-w-[160px]">Joueur</th>
              <th className="sticky top-0 z-10 bg-gray-50 text-left px-3 py-3 font-medium text-gray-600 w-12">Pos</th>
              {DRAFT_SOURCES_RANKED.map(s => (
                <th key={s.key} className="sticky top-0 z-10 bg-gray-50 text-center px-2 py-3 font-medium text-gray-600 w-12 text-xs">{s.abbr}</th>
              ))}
              {DRAFT_SOURCES_INFOONLY.map(s => (
                <th key={s.key} className="sticky top-0 z-10 text-center px-2 py-3 font-medium text-amber-600 w-12 text-xs bg-amber-50">{s.abbr}</th>
              ))}
              <th className="sticky top-0 z-10 bg-gray-50 text-right px-3 py-3 font-medium text-gray-600 w-14">PTS</th>
              <th className="sticky top-0 z-10 bg-gray-50 w-6 px-2" />
            </tr>
          </thead>
          <tbody>
            {prospects.map((p, idx) => {
              const rm = rankMap(p.rankings)
              const isExpanded = expanded === p.id
              const prevHadRank = idx > 0 && prospects[idx - 1].avgRank !== null
              const showSeparator = p.avgRank === null && prevHadRank

              return (
                <Fragment key={p.id}>
                  {showSeparator && (
                    <tr className="bg-gray-50">
                      <td colSpan={COL_COUNT} className="px-4 py-2 text-xs text-gray-500 italic border-t-2 border-gray-300">
                        ↓ Prospects repérés par les Éclaireurs LNH uniquement — non classés par les analystes indépendants
                      </td>
                    </tr>
                  )}
                  <tr
                    onClick={() => toggleExpand(p.id)}
                    className={`border-b cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className={`px-3 py-2 text-center sticky left-0 z-10 ${isExpanded ? 'bg-blue-50' : 'bg-white'}`}>
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-bold text-blue-600">
                          {p.avgRank ? p.avgRank.toFixed(1) : '—'}
                        </span>
                        {p.avgRank && <span className="text-xs text-gray-400">{p.sourceCount} src</span>}
                      </div>
                    </td>
                    <td className={`px-3 py-2 font-medium text-gray-800 sticky left-[72px] z-10 ${isExpanded ? 'bg-blue-50' : 'bg-white'}`}>
                      {p.last_name}, {p.first_name}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{p.position ?? '—'}</td>
                    {DRAFT_SOURCES_RANKED.map(s => {
                      const r = rm[s.key]
                      return (
                        <td key={s.key} className="px-2 py-2 text-center text-xs">
                          {r ? (
                            <span className={`font-semibold ${r.rank <= 5 ? 'text-blue-700' : r.rank <= 15 ? 'text-gray-700' : 'text-gray-400'}`}>
                              {r.rank}
                            </span>
                          ) : <span className="text-gray-200">—</span>}
                        </td>
                      )
                    })}
                    {DRAFT_SOURCES_INFOONLY.map(s => {
                      const r = rm[s.key]
                      return (
                        <td key={s.key} className="px-2 py-2 text-center text-xs bg-amber-50">
                          {r ? (
                            <span className="font-semibold text-amber-700">{r.rank}</span>
                          ) : <span className="text-amber-200">—</span>}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right font-medium text-gray-800">{p.points ?? '—'}</td>
                    <td className="px-2 py-2 text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-blue-50 border-b">
                      <td colSpan={COL_COUNT} className="px-4 py-3">
                        <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                          <span><span className="font-medium">Équipe :</span> {p.team ?? '—'}</span>
                          <span><span className="font-medium">PJ :</span> {p.games_played ?? '—'}</span>
                          <span><span className="font-medium">B :</span> {p.goals ?? '—'}</span>
                          <span><span className="font-medium">A :</span> {p.assists ?? '—'}</span>
                          <span><span className="font-medium">PTS :</span> {p.points ?? '—'}</span>
                          <span><span className="font-medium">PUN :</span> {p.pim ?? '—'}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {prospects.length === 0 && (
              <tr><td colSpan={COL_COUNT} className="px-4 py-10 text-center text-gray-400">Aucune donnée disponible.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
