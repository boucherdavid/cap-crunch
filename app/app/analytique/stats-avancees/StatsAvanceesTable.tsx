'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import TeamBadge from '@/components/TeamBadge'
import PlayerLink from '@/components/PlayerLink'
import CollapsibleLegend from '@/components/CollapsibleLegend'
import { normalizeSearch } from '@/lib/normalizeSearch'

export type Kind = 'skater' | 'goalie'
export type Situation = 'all' | '5on5' | '5on4' | '4on5'

export type AdvancedRow = {
  nhl_id: number
  name: string
  team: string | null
  position: string | null
  games_played: number
  icetime: number  // secondes
  stats: Record<string, number | null>
  owner?: { poolerName: string; playerType: string } | null
}

const SITUATION_LABEL: Record<Situation, string> = {
  all: 'Toutes situations',
  '5on5': '5 contre 5',
  '5on4': 'Avantage numérique',
  '4on5': 'Désavantage numérique',
}

type Column = {
  key: string
  label: string
  help: string
  value: (r: AdvancedRow) => number | null
  format: (v: number) => string
}

const s = (r: AdvancedRow, k: string) => r.stats[k] ?? 0
const ratio = (a: number, b: number) => (b ? a / b : null)
const per60 = (r: AdvancedRow, v: number) => ratio(v, r.icetime / 3600)
const fixed = (d: number) => (v: number) => v.toFixed(d)
const pct = (d: number) => (v: number) => `${(v * 100).toFixed(d)} %`
const signed = (d: number) => (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`
const int = (v: number) => String(Math.round(v))
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

const SKATER_COLUMNS: Column[] = [
  { key: 'gp', label: 'PJ', help: 'Parties jouées', value: r => r.games_played, format: int },
  { key: 'toi', label: 'TG/PJ', help: 'Temps de glace moyen par match, dans la situation choisie', value: r => ratio(r.icetime, r.games_played), format: mmss },
  { key: 'pts', label: 'Pts', help: 'Points', value: r => s(r, 'points'), format: int },
  { key: 'g', label: 'B', help: 'Buts', value: r => s(r, 'goals'), format: int },
  { key: 'p60', label: 'Pts/60', help: 'Points par 60 minutes de jeu — compare des joueurs au temps de glace différent', value: r => per60(r, s(r, 'points')), format: fixed(2) },
  { key: 'xg', label: 'xB', help: 'Buts attendus (expected goals) : qualité des tirs du joueur selon le modèle MoneyPuck', value: r => s(r, 'xg'), format: fixed(1) },
  { key: 'gax', label: 'B−xB', help: 'Buts moins buts attendus. Très positif : finition au-dessus de la moyenne… ou chance qui pourrait ne pas durer', value: r => s(r, 'goals') - s(r, 'xg'), format: signed(1) },
  { key: 'shpct', label: '% tirs', help: 'Pourcentage de réussite au tir (buts / tirs au but)', value: r => ratio(s(r, 'goals'), s(r, 'shots')), format: pct(1) },
  { key: 'xg60', label: 'xB/60', help: 'Buts attendus individuels par 60 minutes', value: r => per60(r, s(r, 'xg')), format: fixed(2) },
  { key: 'hd', label: 'Tirs DÉ', help: 'Tirs de danger élevé (haute probabilité de but)', value: r => s(r, 'hd_shots'), format: int },
  { key: 'xgpct', label: 'xB %', help: 'Part des buts attendus en faveur de son équipe quand il est sur la glace (50 % = neutre)', value: r => r.stats.xg_pct ?? null, format: pct(1) },
  { key: 'xgrel', label: 'xB % rel', help: "xB % sur la glace moins xB % de l'équipe sans lui : impact relatif à ses coéquipiers", value: r => (r.stats.xg_pct ?? 0) - (r.stats.xg_pct_off ?? 0), format: v => signed(1)(v * 100) },
  { key: 'cfpct', label: 'CF %', help: 'Corsi : part des tentatives de tir en faveur de son équipe quand il est sur la glace (contrôle de la rondelle)', value: r => r.stats.cf_pct ?? null, format: pct(1) },
  { key: 'pdo', label: 'PDO', help: '% de tirs + % arrêts de son équipe quand il est sur la glace. Tend à revenir vers 100 : au-dessus = chance probable, en dessous = malchance', value: r => { const a = ratio(s(r, 'gf'), s(r, 'sf')); const b = ratio(s(r, 'ga'), s(r, 'sa')); return a === null || b === null ? null : (a + 1 - b) * 100 }, format: fixed(1) },
  { key: 'oz', label: 'DZO %', help: 'Départs en zone offensive (parmi les départs en zone offensive ou défensive) : contexte de déploiement', value: r => ratio(s(r, 'oz_starts'), s(r, 'oz_starts') + s(r, 'dz_starts')), format: pct(0) },
  { key: 'gs', label: 'GS/PJ', help: 'Game Score moyen par match : synthèse de la contribution (buts, passes, tirs, différentiel, etc.)', value: r => ratio(s(r, 'game_score'), r.games_played), format: fixed(2) },
  { key: 'hits', label: 'MÉ', help: 'Mises en échec', value: r => s(r, 'hits'), format: int },
  { key: 'blocks', label: 'TB', help: 'Tirs bloqués', value: r => s(r, 'blocks'), format: int },
]

const GOALIE_COLUMNS: Column[] = [
  { key: 'gp', label: 'PJ', help: 'Parties jouées', value: r => r.games_played, format: int },
  { key: 'toi', label: 'Min', help: 'Minutes jouées', value: r => r.icetime / 60, format: int },
  { key: 'wins', label: 'V', help: 'Victoires (source : LNH) — affichées en « Toutes situations » seulement', value: r => r.stats.wins ?? null, format: int },
  { key: 'so', label: 'BL', help: 'Blanchissages (source : LNH) — affichés en « Toutes situations » seulement', value: r => r.stats.shutouts ?? null, format: int },
  { key: 'sa', label: 'Tirs', help: 'Tirs au but reçus', value: r => s(r, 'sa'), format: int },
  { key: 'ga', label: 'BA', help: 'Buts alloués', value: r => s(r, 'ga'), format: int },
  { key: 'svpct', label: '% arr.', help: "Pourcentage d'arrêts", value: r => { const v = ratio(s(r, 'ga'), s(r, 'sa')); return v === null ? null : 1 - v }, format: v => v.toFixed(3) },
  { key: 'xga', label: 'xBA', help: 'Buts attendus contre, selon la qualité des tirs reçus', value: r => s(r, 'xga'), format: fixed(1) },
  { key: 'gsax', label: 'BSxB', help: 'Buts sauvés au-dessus des attentes (xBA − BA) : la meilleure mesure du gardien lui-même, indépendante de sa défense', value: r => s(r, 'xga') - s(r, 'ga'), format: signed(1) },
  { key: 'gsax60', label: 'BSxB/60', help: 'Buts sauvés au-dessus des attentes par 60 minutes', value: r => per60(r, s(r, 'xga') - s(r, 'ga')), format: signed(2) },
  { key: 'hdgsax', label: 'BSxB DÉ', help: 'Buts sauvés au-dessus des attentes sur les tirs de danger élevé', value: r => s(r, 'hd_xga') - s(r, 'hd_ga'), format: signed(1) },
  { key: 'hdsa', label: 'Tirs DÉ', help: 'Tentatives de danger élevé reçues', value: r => s(r, 'hd_sa'), format: int },
]

const OWNER_TYPE_LABEL: Record<string, string> = { actif: 'A', reserviste: 'R', recrue: 'Rc', ltir: 'LTIR' }

export default function StatsAvanceesTable({
  rows, seasons, season, situation, kind,
}: {
  rows: AdvancedRow[]
  seasons: number[]
  season: number | null
  situation: Situation
  kind: Kind
}) {
  const router = useRouter()
  const columns = kind === 'skater' ? SKATER_COLUMNS : GOALIE_COLUMNS
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState<'all' | 'F' | 'D'>('all')
  const [availOnly, setAvailOnly] = useState(false)
  const maxGp = rows.reduce((m, r) => Math.max(m, r.games_played), 0)
  const [minGp, setMinGp] = useState(() => Math.min(10, Math.floor(maxGp / 4)))
  const [sortKey, setSortKey] = useState(kind === 'skater' ? 'pts' : 'gsax')
  const [sortDesc, setSortDesc] = useState(true)

  const navigate = (next: { saison?: number | null; situation?: Situation; type?: Kind }) => {
    const p = new URLSearchParams()
    const sa = next.saison !== undefined ? next.saison : season
    if (sa !== null) p.set('saison', String(sa))
    p.set('situation', next.situation ?? situation)
    p.set('type', (next.type ?? kind) === 'goalie' ? 'gardiens' : 'patineurs')
    router.push(`/analytique/stats-avancees?${p.toString()}`)
  }

  const sortCol = columns.find(c => c.key === sortKey) ?? columns[0]
  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim())
    return rows
      .filter(r => r.games_played >= minGp)
      .filter(r => !availOnly || !r.owner)
      .filter(r => pos === 'all' || (pos === 'D' ? r.position === 'D' : r.position !== 'D'))
      .filter(r => !q || normalizeSearch(r.name).includes(q) || normalizeSearch(r.team ?? '').includes(q))
      .map(r => ({ r, v: sortCol.value(r) }))
      .sort((a, b) => {
        if (a.v === null) return 1
        if (b.v === null) return -1
        return sortDesc ? b.v - a.v : a.v - b.v
      })
      .map(x => x.r)
  }, [rows, minGp, availOnly, pos, search, sortCol, sortDesc])

  const onSort = (key: string) => {
    if (key === sortKey) setSortDesc(d => !d)
    else { setSortKey(key); setSortDesc(true) }
  }

  const seasonLabel = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`
  const selectCls = 'border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-3">
        <div>
          {/* Titre : bandeau de section du layout (SectionEyebrow, Navbar.tsx). */}
          <p className="text-xs text-gray-400 mt-1">
            Données :{' '}
            <a href="https://moneypuck.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">MoneyPuck.com</a>
            {' '}— mise à jour quotidienne
          </p>
        </div>
        <span className="text-sm text-gray-500">{filtered.length} joueur{filtered.length > 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          {(['skater', 'goalie'] as Kind[]).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => navigate({ type: k })}
              className={`px-3 py-2 ${kind === k ? 'bg-blue-600 text-white font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {k === 'skater' ? 'Patineurs' : 'Gardiens'}
            </button>
          ))}
        </div>
        <select value={season ?? ''} onChange={e => navigate({ saison: Number(e.target.value) })} className={selectCls}>
          {seasons.map(y => <option key={y} value={y}>{seasonLabel(y)}</option>)}
        </select>
        <select value={situation} onChange={e => navigate({ situation: e.target.value as Situation })} className={selectCls}>
          {(Object.keys(SITUATION_LABEL) as Situation[]).map(k => <option key={k} value={k}>{SITUATION_LABEL[k]}</option>)}
        </select>
        {kind === 'skater' && (
          <select value={pos} onChange={e => setPos(e.target.value as 'all' | 'F' | 'D')} className={selectCls}>
            <option value="all">Toutes positions</option>
            <option value="F">Attaquants</option>
            <option value="D">Défenseurs</option>
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600">
          PJ min.
          <input
            type="number"
            min={0}
            value={minGp}
            onChange={e => setMinGp(Math.max(0, Number(e.target.value) || 0))}
            className="border rounded-lg px-2 py-2 w-20 text-sm text-gray-800 bg-white"
          />
        </label>
        <input
          type="text"
          placeholder="Nom ou équipe"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={`${selectCls} w-48`}
        />
        <button
          type="button"
          onClick={() => setAvailOnly(v => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
            availOnly ? 'border-green-500 bg-green-50 text-green-700 font-medium' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Disponibles seulement
        </button>
      </div>

      <div className="mb-4">
        <CollapsibleLegend title="Définitions des colonnes">
          <dl className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1.5">
            {columns.map(c => (
              <div key={c.key} className="flex items-baseline gap-2 text-xs">
                <dt className="font-semibold text-gray-700 shrink-0 w-16">{c.label}</dt>
                <dd className="text-gray-500">{c.help}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-gray-400">
            Les valeurs dépendent de la situation choisie (toutes, 5 contre 5, avantage ou désavantage numérique). Clique un en-tête pour trier. Sur téléphone, fais défiler le tableau vers la droite pour voir toutes les colonnes.
          </p>
        </CollapsibleLegend>
      </div>

      {season === null ? (
        <p className="text-center py-10 text-gray-400 text-sm bg-white rounded-lg shadow">
          Aucune donnée importée. Lance <code>python import_advanced_stats.py</code> depuis <code>python_script/</code>.
        </p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto max-h-[75vh]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="sticky top-0 left-0 z-20 bg-gray-50 px-2 sm:px-3 py-2.5 font-medium text-gray-600">Joueur</th>
                  <th className="hidden sm:table-cell sticky top-0 z-10 bg-gray-50 px-3 py-2.5 font-medium text-gray-600">Éq.</th>
                  {kind === 'skater' && <th className="hidden sm:table-cell sticky top-0 z-10 bg-gray-50 px-3 py-2.5 font-medium text-gray-600">Pos</th>}
                  {columns.map(c => (
                    <th
                      key={c.key}
                      title={c.help}
                      onClick={() => onSort(c.key)}
                      className={`sticky top-0 z-10 bg-gray-50 px-2 sm:px-3 py-2.5 font-medium text-right whitespace-nowrap cursor-pointer select-none ${
                        c.key === sortKey ? 'text-blue-700' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {c.label}{c.key === sortKey && (sortDesc ? ' ▾' : ' ▴')}
                    </th>
                  ))}
                  <th className="hidden sm:table-cell sticky top-0 z-10 bg-gray-50 px-3 py-2.5 font-medium text-gray-600">Pool</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.nhl_id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white px-2 sm:px-3 py-2 font-medium text-gray-800 max-sm:max-w-[9rem] sm:whitespace-nowrap">
                      <PlayerLink nhlId={r.nhl_id}>{r.name}</PlayerLink>
                      <span className="sm:hidden block text-[11px] font-normal text-gray-400">
                        {[r.team, kind === 'skater' ? r.position : null, r.owner ? r.owner.poolerName : 'Disponible'].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2"><TeamBadge code={r.team} size="sm" /></td>
                    {kind === 'skater' && <td className="hidden sm:table-cell px-3 py-2 text-gray-500">{r.position}</td>}
                    {columns.map(c => {
                      const v = c.value(r)
                      return (
                        <td key={c.key} className={`px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap ${c.key === sortKey ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {v === null ? '—' : c.format(v)}
                        </td>
                      )
                    })}
                    <td className="hidden sm:table-cell px-3 py-2 whitespace-nowrap text-xs">
                      {r.owner
                        ? <span className="text-gray-500">{r.owner.poolerName} <span className="text-gray-400">({OWNER_TYPE_LABEL[r.owner.playerType] ?? r.owner.playerType})</span></span>
                        : <span className="inline-flex items-center gap-1.5 text-green-600 font-medium"><span className="inline-block w-2 h-2 rounded-full bg-green-500" />Disponible</span>}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 4} className="text-center py-10 text-gray-400 text-sm">
                      Aucun joueur ne correspond aux filtres.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
