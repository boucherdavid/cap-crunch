'use client'

import { useMemo, useState } from 'react'
import type { ProjectionRow } from './page'
import TeamBadge from '@/components/TeamBadge'
import PlayerLink from '@/components/PlayerLink'
import { normalizeSearch } from '@/lib/normalizeSearch'

type Tab = 'forwards' | 'defense' | 'goalies'
type SortKey = 'nhlCom' | 'cbs' | 'poolPro' | 'hockeyMagazine' | 'average' | 'lastSeasonValue' | 'trendPerGame' | 'trend'

// position peut être multi-poste ("LD,RD", "C,LW"...) — jamais juste "D" seul dans nos données —
// et nullable (`players.position`). Les codes attaquants (C/LW/RW) ne contiennent jamais la
// lettre D, donc une sous-chaîne suffit.
function isDefensePosition(position: string | null): boolean {
  return (position ?? '').includes('D')
}

function normName(s: string) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/-/g, ' ').trim()
}

function AvailDot({ available }: { available: boolean }) {
  return (
    <span
      title={available ? 'Disponible' : 'Dans un pool'}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${available ? 'bg-green-500' : 'bg-slate-300'}`}
    />
  )
}

// Pastille colorée plutôt qu'une simple flèche (David, 2026-09-25 — la flèche seule passait
// inaperçue) : fond vert/rouge/gris + variation en % du rythme par match entre les 2 dernières
// saisons qualifiées.
const DIRECTION_STYLE = {
  up: { cls: 'bg-green-100 text-green-700', icon: '▲', label: 'En hausse' },
  down: { cls: 'bg-red-100 text-red-700', icon: '▼', label: 'En baisse' },
  stable: { cls: 'bg-gray-100 text-gray-500', icon: '●', label: 'Stable' },
} as const

function DirectionBadge({ direction, changePct }: { direction: 'up' | 'down' | 'stable' | null; changePct: number | null }) {
  if (!direction) return <span className="text-gray-300">—</span>
  const { cls, icon, label } = DIRECTION_STYLE[direction]
  const pct = changePct == null ? '' : `${changePct > 0 ? '+' : ''}${changePct}%`
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums whitespace-nowrap ${cls}`}
      title={`${label} — rythme par match ${pct} par rapport à la saison qualifiée précédente`}
    >
      <span className="text-sm leading-none">{icon}</span>
      {pct}
    </span>
  )
}

export default function ProjectionsTable({
  players,
  season,
}: {
  players: ProjectionRow[]
  season: string | null
}) {
  const [tab, setTab] = useState<Tab>('forwards')
  const [search, setSearch] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [availOnly, setAvailOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('nhlCom')

  const forwards = useMemo(() => players.filter(p => !p.isGoalie && !isDefensePosition(p.position)), [players])
  const defense = useMemo(() => players.filter(p => !p.isGoalie && isDefensePosition(p.position)), [players])
  const goalies = useMemo(() => players.filter(p => p.isGoalie), [players])

  const teamOptions = useMemo(
    () => Array.from(new Set(players.map(p => p.team).filter((t): t is string => !!t))).sort((a, b) => a.localeCompare(b, 'fr-CA')),
    [players],
  )

  const filterAndSort = (list: ProjectionRow[]) => {
    const q = normalizeSearch(search.trim())
    return list
      .filter(p => {
        if (availOnly && !p.available) return false
        if (selectedTeam && p.team !== selectedTeam) return false
        if (q) {
          const name = normalizeSearch(`${p.firstName} ${p.lastName}`)
          const rev = normalizeSearch(`${p.lastName} ${p.firstName}`)
          if (!name.includes(q) && !rev.includes(q) && !normalizeSearch(p.team ?? '').includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey]
        if (av == null && bv == null) return a.lastName.localeCompare(b.lastName)
        if (av == null) return 1
        if (bv == null) return -1
        return bv - av || a.lastName.localeCompare(b.lastName)
      })
  }

  const filteredForwards = useMemo(() => filterAndSort(forwards), [forwards, search, selectedTeam, availOnly, sortKey])
  const filteredDefense = useMemo(() => filterAndSort(defense), [defense, search, selectedTeam, availOnly, sortKey])
  const filteredGoalies = useMemo(() => filterAndSort(goalies), [goalies, search, selectedTeam, availOnly, sortKey])

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`

  const sortHeaderClass = (key: SortKey) =>
    `text-right px-4 py-3 font-medium cursor-pointer select-none ${sortKey === key ? 'text-blue-700' : 'text-gray-600 hover:text-gray-800'}`

  // Fond pâle par source de projection (David, 2026-09-22) — aide à repérer d'un coup d'œil
  // quelle colonne vient d'où (NHL.com/CBS/Pool Pro/Hockey Mag.) sans dépendre de l'en-tête.
  const SOURCE_BG = { nhlCom: '', cbs: 'bg-blue-50', poolPro: 'bg-red-50', hockeyMagazine: 'bg-yellow-50' } as const

  const unit = tab === 'goalies' ? 'vict.' : 'pts'
  const rows = tab === 'goalies' ? filteredGoalies : tab === 'defense' ? filteredDefense : filteredForwards

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Projections {season ?? ''}</h1>
        <span className="text-sm text-gray-500">{rows.length} joueur{rows.length > 1 ? 's' : ''}</span>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        NHL.com, CBS Sports, Pool Pro et Hockey Le Magazine (projections externes collées/
        transcrites manuellement), la saison dernière réelle, et une tendance pondérée sur les
        saisons réelles récentes (rythme par match projeté sur 82 matchs — repère rapide, pas une
        vraie projection ; ignore les saisons à moins de 10 matchs) avec sa progression (▲/▼/● et variation en %) — la colonne Moyenne fait la moyenne des
        sources disponibles (un petit chiffre indique combien, quand il en manque) —
        mêmes chiffres que le panneau détail joueur, regroupés ici pour comparer plus facilement.
      </p>

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          <button type="button" className={tabClass('forwards')} onClick={() => setTab('forwards')}>Attaquants</button>
          <button type="button" className={tabClass('defense')} onClick={() => setTab('defense')}>Défenseurs</button>
          <button type="button" className={tabClass('goalies')} onClick={() => setTab('goalies')}>Gardiens</button>
        </div>
        <input
          type="text"
          placeholder="Nom ou équipe"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        <select
          value={selectedTeam}
          onChange={e => setSelectedTeam(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Toutes les équipes</option>
          {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setAvailOnly(v => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
            availOnly
              ? 'border-green-500 bg-green-50 text-green-700 font-medium'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Disponibles
        </button>
        {(search || selectedTeam || availOnly) && (
          <button
            type="button"
            onClick={() => { setSearch(''); setSelectedTeam(''); setAvailOnly(false) }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Effacer
          </button>
        )}
      </div>

      {/* max-h + overflow-auto (pas juste overflow-x-auto) : nécessaire pour que le sticky des
          <th> ait un effet visible — un conteneur non borné en hauteur ne défile jamais
          lui-même, donc rien à quoi le sticky puisse s'accrocher (David, 2026-09-22). */}
      <div className="bg-white rounded-lg shadow overflow-auto max-h-[75vh]">
        <table className="w-full text-sm">
          <thead>
            {/* En-tête fixe au défilement (David, 2026-09-22) — sticky posé sur chaque <th>
                plutôt que sur <thead> pour un support navigateur plus fiable ; chaque cellule a
                son propre fond opaque (sinon le contenu défilé serait visible en transparence). */}
            <tr className="border-b">
              <th className="sticky top-0 z-10 bg-gray-50 text-left px-4 py-3 font-medium text-gray-600 w-8">#</th>
              <th className="sticky top-0 z-10 bg-gray-50 text-left px-4 py-3 font-medium text-gray-600 w-5" title="Disponibilité" />
              <th className="sticky top-0 z-10 bg-gray-50 text-left px-4 py-3 font-medium text-gray-600">{tab === 'goalies' ? 'Gardien' : 'Joueur'}</th>
              <th className="sticky top-0 z-10 bg-gray-50 text-left px-4 py-3 font-medium text-gray-600">Équipe</th>
              <th className="sticky top-0 z-10 bg-gray-50 text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Pos</th>
              <th className={`sticky top-0 z-10 ${sortHeaderClass('nhlCom')} ${SOURCE_BG.nhlCom || 'bg-gray-50'}`} onClick={() => setSortKey('nhlCom')}>NHL.com</th>
              <th className={`sticky top-0 z-10 ${sortHeaderClass('cbs')} ${SOURCE_BG.cbs}`} onClick={() => setSortKey('cbs')}>CBS</th>
              <th className={`sticky top-0 z-10 ${sortHeaderClass('poolPro')} ${SOURCE_BG.poolPro}`} onClick={() => setSortKey('poolPro')}>Pool Pro</th>
              <th className={`sticky top-0 z-10 ${sortHeaderClass('hockeyMagazine')} ${SOURCE_BG.hockeyMagazine}`} onClick={() => setSortKey('hockeyMagazine')}>Hockey Mag.</th>
              <th
                className={`sticky top-0 z-10 ${sortHeaderClass('average')} bg-indigo-50 border-l border-indigo-200`}
                onClick={() => setSortKey('average')}
                title="Moyenne des sources disponibles parmi NHL.com, CBS, Pool Pro et Hockey Mag."
              >
                Moyenne
              </th>
              <th className={`sticky top-0 z-10 bg-gray-50 ${sortHeaderClass('lastSeasonValue')} hidden sm:table-cell`} onClick={() => setSortKey('lastSeasonValue')}>Saison dernière</th>
              <th
                className={`sticky top-0 z-10 bg-gray-50 ${sortHeaderClass('trendPerGame')} hidden sm:table-cell`}
                onClick={() => setSortKey('trendPerGame')}
                title="Rythme par match de la tendance 3 saisons (colonne suivante) — pas celui de la saison dernière seule."
              >
                Pts/Match (tend.)
              </th>
              <th className={`sticky top-0 z-10 bg-gray-50 ${sortHeaderClass('trend')}`} onClick={() => setSortKey('trend')}>Tendance 3 saisons</th>
              <th className="sticky top-0 z-10 bg-gray-50 text-center px-4 py-3 font-medium text-gray-600" title="Progression saison après saison">Prog.</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="text-center py-12 text-gray-400">Aucun joueur ne correspond aux filtres.</td>
              </tr>
            ) : (
              rows.map((p, i) => (
                <tr key={`${normName(p.firstName + p.lastName)}-${i}`} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5"><AvailDot available={p.available} /></td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    <PlayerLink nhlId={p.nhlId}>{p.lastName}, {p.firstName}</PlayerLink>
                  </td>
                  <td className="px-4 py-2.5"><TeamBadge code={p.team} /></td>
                  <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{p.position ?? '—'}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 ${SOURCE_BG.nhlCom}`}>
                    {p.nhlCom ?? '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 ${SOURCE_BG.cbs}`}>
                    {p.cbs ?? '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 ${SOURCE_BG.poolPro}`}>
                    {p.poolPro ?? '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 ${SOURCE_BG.hockeyMagazine}`}>
                    {p.hockeyMagazine ?? '—'}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right tabular-nums font-bold text-indigo-800 bg-indigo-50 border-l border-indigo-200"
                    title={p.average != null ? `Moyenne de ${p.averageSources} source${p.averageSources > 1 ? 's' : ''} sur 4` : undefined}
                  >
                    {p.average ?? '—'}
                    {p.average != null && p.averageSources < 4 && (
                      <sup className="ml-0.5 text-[10px] font-normal text-indigo-400">{p.averageSources}</sup>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 hidden sm:table-cell">
                    {p.lastSeasonValue ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 hidden sm:table-cell">
                    {p.trendPerGame != null ? p.trendPerGame.toFixed(2) : '—'}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right tabular-nums text-blue-700"
                    title={p.trend != null ? `${p.trendPerGame?.toFixed(2)} ${unit}/match — ${p.trendSeasons} saison${p.trendSeasons > 1 ? 's' : ''}, ${p.trendGames} matchs` : 'Échantillon trop petit (< 10 matchs par saison)'}
                  >
                    {p.trend ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <DirectionBadge direction={p.trendDirection} changePct={p.trendChangePct} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">{unit === 'pts' ? 'Points' : 'Victoires'} projetés. Cliquez un en-tête pour trier. Moyenne : le petit chiffre indique le nombre de sources quand il en manque.</p>
    </div>
  )
}
