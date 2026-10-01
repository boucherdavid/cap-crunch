'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import TeamBadge from '@/components/TeamBadge'
import PlayerLink from '@/components/PlayerLink'
import CollapsibleLegend from '@/components/CollapsibleLegend'
import { normalizeSearch } from '@/lib/normalizeSearch'

export type AnalyseRow = {
  nhlId: number
  name: string
  team: string | null
  position: string | null
  status: string | null
  owner: { poolerName: string; playerType: string } | null
  m: Record<string, number | null>
}

type Metric = { key: string; label: string; help: string; d: number; signed?: boolean }

const METRICS: Metric[] = [
  { key: 'cap', label: 'Salaire (M$)', help: 'Impact sur le plafond pour la saison active du pool, en millions', d: 2 },
  { key: 'age', label: 'Âge', help: 'Âge du joueur', d: 0 },
  { key: 'gp', label: 'Parties jouées', help: 'Parties jouées dans la saison de stats choisie', d: 0 },
  { key: 'toi', label: 'Temps de glace / match (min)', help: 'Temps de glace moyen par match, toutes situations', d: 1 },
  { key: 'pts', label: 'Points', help: 'Points (buts + passes)', d: 0 },
  { key: 'goals', label: 'Buts', help: 'Buts', d: 0 },
  { key: 'ptsGp', label: 'Points / match', help: 'Points par partie jouée', d: 2 },
  { key: 'pts60', label: 'Points / 60 min', help: 'Points par 60 minutes de jeu : compare des joueurs au temps de glace différent', d: 2 },
  { key: 'ptsPerM', label: 'Points par M$', help: 'Points divisés par le salaire en millions : le rendement brut', d: 1 },
  { key: 'xg', label: 'Buts attendus (xB)', help: 'Qualité des tirs du joueur selon le modèle MoneyPuck', d: 1 },
  { key: 'gax', label: 'Buts − buts attendus', help: 'Très positif : finition au-dessus de la moyenne… ou chance qui pourrait ne pas durer', d: 1, signed: true },
  { key: 'shPct', label: '% de réussite au tir', help: 'Buts / tirs au but', d: 1 },
  { key: 'xg60', label: 'xB / 60 min', help: 'Buts attendus individuels par 60 minutes', d: 2 },
  { key: 'xgPct', label: 'xB % sur la glace', help: 'Part des buts attendus en faveur de son équipe quand il joue (50 = neutre)', d: 1 },
  { key: 'xgRel', label: 'xB % relatif', help: 'xB % avec lui moins xB % sans lui : impact par rapport à ses coéquipiers', d: 1, signed: true },
  { key: 'cfPct', label: 'Corsi %', help: 'Part des tentatives de tir en faveur de son équipe quand il joue', d: 1 },
  { key: 'pdo', label: 'PDO', help: '% de tirs + % d\'arrêts de son équipe quand il joue. Tend vers 100 : au-dessus = chance probable', d: 1 },
  { key: 'gsGp', label: 'Game Score / match', help: 'Synthèse de la contribution par match (buts, passes, tirs, différentiel…)', d: 2 },
  { key: 'hits', label: 'Mises en échec', help: 'Mises en échec', d: 0 },
  { key: 'blocks', label: 'Tirs bloqués', help: 'Tirs bloqués', d: 0 },
]
const METRIC = Object.fromEntries(METRICS.map(m => [m.key, m]))

const PRESETS: { label: string; x: string; y: string; question: string }[] = [
  { label: 'Rendement', x: 'cap', y: 'pts', question: 'Qui produit plus (ou moins) que ce que son salaire laisse attendre ?' },
  { label: 'Chance', x: 'pdo', y: 'pts60', question: 'Qui produit beaucoup avec un PDO gonflé (risque de recul) ou malgré un PDO faible (rebond possible) ?' },
  { label: 'Finition', x: 'xg', y: 'goals', question: 'Qui marque plus (ou moins) que la qualité de ses tirs ne le prévoit ?' },
  { label: 'Âge', x: 'age', y: 'ptsGp', question: 'Où se situe chaque joueur sur la courbe âge-production ?' },
  { label: 'Utilisation', x: 'toi', y: 'pts60', question: 'Qui est efficace avec peu de temps de glace (candidat à un plus grand rôle) ?' },
]

// Palette validée (skill dataviz, mode clair) : bleu = dans un alignement, aqua = disponible.
const COLOR_OWNED = '#2a78d6'
const COLOR_FREE = '#1baf7a'

const fmt = (m: Metric, v: number | null) =>
  v === null ? '—' : `${m.signed && v > 0 ? '+' : ''}${v.toLocaleString('fr-CA', { minimumFractionDigits: m.d, maximumFractionDigits: m.d })}`

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min]
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) ?? raw
  const ticks: number[] = []
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) ticks.push(Number(t.toFixed(10)))
  return ticks
}

const W = 860, H = 440, ML = 56, MR = 16, MT = 14, MB = 44

export default function AnalyseTool({
  rows, seasons, season, poolSeason,
}: {
  rows: AnalyseRow[]
  seasons: number[]
  season: number | null
  poolSeason: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [xKey, setXKey] = useState('cap')
  const [yKey, setYKey] = useState('pts')
  const [pos, setPos] = useState<'all' | 'F' | 'D'>('all')
  const maxGp = rows.reduce((m, r) => Math.max(m, r.m.gp ?? 0), 0)
  const [minGp, setMinGp] = useState(() => Math.min(20, Math.floor(maxGp / 4)))
  const [owner, setOwner] = useState('all')  // all | free | owned | <nom du pooler>
  const [maxCap, setMaxCap] = useState('')
  const [search, setSearch] = useState('')
  const [hover, setHover] = useState<number | null>(null)
  const [showChart, setShowChart] = useState(true)
  const [sort, setSort] = useState<{ key: 'x' | 'y' | 'res' | 'ptsPerM'; desc: boolean }>({ key: 'res', desc: true })

  const mx = METRIC[xKey], my = METRIC[yKey]
  const poolers = useMemo(() => [...new Set(rows.map(r => r.owner?.poolerName).filter((n): n is string => !!n))].sort(), [rows])

  const { points, slope, intercept, corr } = useMemo(() => {
    const cap = parseFloat(maxCap.replace(',', '.'))
    const pts = rows
      .filter(r => (r.m.gp ?? 0) >= minGp)
      .filter(r => pos === 'all' || (pos === 'D' ? r.position === 'D' : r.position !== 'D'))
      .filter(r => owner === 'all' || (owner === 'free' ? !r.owner : owner === 'owned' ? !!r.owner : r.owner?.poolerName === owner))
      .filter(r => Number.isNaN(cap) || (r.m.cap !== null && r.m.cap <= cap))
      .map(r => ({ r, x: r.m[xKey], y: r.m[yKey] }))
      .filter((p): p is { r: AnalyseRow; x: number; y: number } => p.x !== null && p.y !== null)
    const n = pts.length
    const mean = (f: (p: typeof pts[number]) => number) => pts.reduce((a, p) => a + f(p), 0) / (n || 1)
    const xb = mean(p => p.x), yb = mean(p => p.y)
    const sxx = pts.reduce((a, p) => a + (p.x - xb) ** 2, 0)
    const syy = pts.reduce((a, p) => a + (p.y - yb) ** 2, 0)
    const sxy = pts.reduce((a, p) => a + (p.x - xb) * (p.y - yb), 0)
    const b = sxx ? sxy / sxx : 0
    const a = yb - b * xb
    return {
      points: pts.map(p => ({ ...p, res: p.y - (a + b * p.x) })),
      slope: b,
      intercept: a,
      corr: sxx && syy ? sxy / Math.sqrt(sxx * syy) : null,
    }
  }, [rows, xKey, yKey, minGp, pos, owner, maxCap])

  // Échelles
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const pad = (lo: number, hi: number) => { const d = (hi - lo) * 0.04 || 1; return [lo - d, hi + d] as const }
  const [x0, x1] = points.length ? pad(Math.min(...xs), Math.max(...xs)) : [0, 1]
  const [y0, y1] = points.length ? pad(Math.min(...ys), Math.max(...ys)) : [0, 1]
  const sx = (v: number) => ML + ((v - x0) / (x1 - x0)) * (W - ML - MR)
  const sy = (v: number) => H - MB - ((v - y0) / (y1 - y0)) * (H - MT - MB)

  // Étiquettes directes : les 4 plus grands écarts de chaque côté de la tendance.
  const labelled = useMemo(() => {
    const sorted = [...points].sort((a, b) => b.res - a.res)
    return new Set([...sorted.slice(0, 4), ...sorted.slice(-4)].map(p => p.r.nhlId))
  }, [points])

  const tableRows = useMemo(() => {
    const q = normalizeSearch(search.trim())
    const val = (p: typeof points[number]) =>
      sort.key === 'x' ? p.x : sort.key === 'y' ? p.y : sort.key === 'res' ? p.res : p.r.m.ptsPerM
    return points
      .filter(p => !q || normalizeSearch(p.r.name).includes(q) || normalizeSearch(p.r.team ?? '').includes(q))
      .sort((a, b) => {
        const va = val(a), vb = val(b)
        if (va === null) return 1
        if (vb === null) return -1
        return sort.desc ? vb - va : va - vb
      })
  }, [points, search, sort])

  const poolerSummary = useMemo(() => {
    const by = new Map<string, { n: number; cap: number; pts: number }>()
    for (const r of rows) {
      if (!r.owner || r.owner.playerType === 'recrue') continue
      const e = by.get(r.owner.poolerName) ?? { n: 0, cap: 0, pts: 0 }
      e.n += 1; e.cap += r.m.cap ?? 0; e.pts += r.m.pts ?? 0
      by.set(r.owner.poolerName, e)
    }
    return [...by.entries()].map(([name, e]) => ({ name, ...e, perM: e.cap ? e.pts / e.cap : null }))
      .sort((a, b) => (b.perM ?? 0) - (a.perM ?? 0))
  }, [rows])

  const openPlayer = (nhlId: number) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set('joueur', String(nhlId))
    router.push(`${pathname}?${p.toString()}`, { scroll: false })
  }
  const onSort = (key: typeof sort.key) => setSort(s => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }))
  const arrow = (key: typeof sort.key) => (sort.key === key ? (sort.desc ? ' ▾' : ' ▴') : '')

  const seasonLabel = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`
  const selectCls = 'border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
  const preset = PRESETS.find(p => p.x === xKey && p.y === yKey)
  const hovered = hover !== null ? points.find(p => p.r.nhlId === hover) ?? null : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Outil d&apos;analyse</h1>
        <p className="text-xs text-gray-400 mt-1">
          Stats :{' '}
          <a href="https://moneypuck.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">MoneyPuck.com</a>
          {' '}(patineurs, toutes situations){poolSeason && <> · Salaires et alignements : saison {poolSeason} du pool</>}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500 mr-1">Questions prêtes :</span>
          {PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => { setXKey(p.x); setYKey(p.y); setSort({ key: 'res', desc: true }) }}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                preset === p ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Axe horizontal
            <select value={xKey} onChange={e => setXKey(e.target.value)} className={selectCls}>
              {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Axe vertical
            <select value={yKey} onChange={e => setYKey(e.target.value)} className={selectCls}>
              {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <select
            value={season ?? ''}
            onChange={e => router.push(`/analytique/analyse?saison=${e.target.value}`)}
            className={selectCls}
            aria-label="Saison des statistiques"
          >
            {seasons.map(y => <option key={y} value={y}>Stats {seasonLabel(y)}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={pos} onChange={e => setPos(e.target.value as 'all' | 'F' | 'D')} className={selectCls}>
            <option value="all">Toutes positions</option>
            <option value="F">Attaquants</option>
            <option value="D">Défenseurs</option>
          </select>
          <select value={owner} onChange={e => setOwner(e.target.value)} className={selectCls}>
            <option value="all">Tous les joueurs</option>
            <option value="free">Disponibles seulement</option>
            <option value="owned">Dans un alignement</option>
            {poolers.map(n => <option key={n} value={n}>Alignement de {n}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            PJ min.
            <input type="number" min={0} value={minGp} onChange={e => setMinGp(Math.max(0, Number(e.target.value) || 0))}
              className="border rounded-lg px-2 py-2 w-20 text-sm text-gray-800 bg-white" />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Salaire max. (M$)
            <input type="text" inputMode="decimal" value={maxCap} onChange={e => setMaxCap(e.target.value)} placeholder="—"
              className="border rounded-lg px-2 py-2 w-20 text-sm text-gray-800 bg-white" />
          </label>
        </div>
        {preset && <p className="text-sm text-gray-600">{preset.question}</p>}
      </div>

      <div className="mb-4 space-y-2">
        <CollapsibleLegend title="Comment lire ce graphique">
          <ul className="space-y-1 text-xs text-gray-500">
            <li>• Chaque point est un joueur. La ligne grise est la <strong>tendance</strong> : la valeur verticale « attendue » pour une valeur horizontale donnée, calculée sur les joueurs affichés.</li>
            <li>• L&apos;<strong>écart</strong> est la distance verticale entre le joueur et cette ligne. Au-dessus : il fait mieux que la tendance ; en dessous : moins bien.</li>
            <li>• La <strong>corrélation</strong> (de −1 à 1) dit à quel point les deux mesures vont ensemble. Proche de 0 : la tendance ne veut pas dire grand-chose.</li>
            <li>• Les salaires sont ceux de la saison active du pool, les stats celles de la saison choisie : un joueur qui vient de signer un gros contrat paraîtra « cher » par rapport à ses points de l&apos;an dernier.</li>
            <li>• Clique un point ou un nom pour ouvrir la fiche du joueur. Sur téléphone, tourne l&apos;écran pour agrandir le graphique.</li>
          </ul>
        </CollapsibleLegend>
        <CollapsibleLegend title="Définitions des mesures">
          <dl className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1.5">
            {METRICS.map(m => (
              <div key={m.key} className="flex items-baseline gap-2 text-xs">
                <dt className="font-semibold text-gray-700 shrink-0 w-44">{m.label}</dt>
                <dd className="text-gray-500">{m.help}</dd>
              </div>
            ))}
          </dl>
        </CollapsibleLegend>
      </div>

      {season === null ? (
        <p className="text-center py-10 text-gray-400 text-sm bg-white rounded-lg shadow">
          Aucune donnée importée. Lance <code>python import_advanced_stats.py</code> depuis <code>python_script/</code>.
        </p>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-700">{my.label} selon {mx.label.toLowerCase()}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
                <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#2a78d6]" />Dans un alignement</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#1baf7a]" />Disponible</span>
                <span className="text-gray-400">
                  {points.length} joueur{points.length > 1 ? 's' : ''}
                  {corr !== null && <> · corrélation {corr.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>}
                </span>
                <button type="button" onClick={() => setShowChart(v => !v)} aria-expanded={showChart}
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
                  {showChart ? 'Masquer le graphique' : 'Afficher le graphique'}
                </button>
              </div>
            </div>
            {showChart && (
            <div className="relative mt-2">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${my.label} selon ${mx.label}`} onMouseLeave={() => setHover(null)}>
                {niceTicks(y0, y1).map(t => (
                  <g key={`y${t}`}>
                    <line x1={ML} x2={W - MR} y1={sy(t)} y2={sy(t)} stroke="#e5e7eb" strokeWidth={1} />
                    <text x={ML - 8} y={sy(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#6b7280">{fmt(my, t)}</text>
                  </g>
                ))}
                {niceTicks(x0, x1, 8).map(t => (
                  <text key={`x${t}`} x={sx(t)} y={H - MB + 16} textAnchor="middle" fontSize={11} fill="#6b7280">{fmt(mx, t)}</text>
                ))}
                <text x={(ML + W - MR) / 2} y={H - 6} textAnchor="middle" fontSize={12} fill="#374151">{mx.label}</text>
                <text x={14} y={(MT + H - MB) / 2} textAnchor="middle" fontSize={12} fill="#374151" transform={`rotate(-90 14 ${(MT + H - MB) / 2})`}>{my.label}</text>
                {points.length > 2 && (
                  <line x1={sx(x0)} y1={sy(intercept + slope * x0)} x2={sx(x1)} y2={sy(intercept + slope * x1)} stroke="#9ca3af" strokeWidth={2} strokeDasharray="6 4" />
                )}
                {points.map(p => (
                  <circle
                    key={p.r.nhlId}
                    cx={sx(p.x)} cy={sy(p.y)} r={hover === p.r.nhlId ? 6 : 4}
                    fill={p.r.owner ? COLOR_OWNED : COLOR_FREE}
                    fillOpacity={hover === null || hover === p.r.nhlId ? 0.85 : 0.35}
                    stroke="#fff" strokeWidth={1.5}
                  />
                ))}
                {points.filter(p => labelled.has(p.r.nhlId)).map(p => (
                  <text key={`l${p.r.nhlId}`} x={sx(p.x) + 7} y={sy(p.y) - 6} fontSize={11} fill="#374151" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                    {p.r.name}
                  </text>
                ))}
                {/* Cibles de survol plus grandes que les points, par-dessus tout le reste */}
                {points.map(p => (
                  <circle
                    key={`h${p.r.nhlId}`}
                    cx={sx(p.x)} cy={sy(p.y)} r={9} fill="transparent" className="cursor-pointer"
                    onMouseEnter={() => setHover(p.r.nhlId)}
                    onClick={() => openPlayer(p.r.nhlId)}
                  />
                ))}
              </svg>
              {hovered && (
                <div
                  className="pointer-events-none absolute z-10 rounded-lg bg-gray-900 text-white text-xs px-3 py-2 shadow-lg whitespace-nowrap"
                  style={{
                    left: `${(sx(hovered.x) / W) * 100}%`,
                    top: `${(sy(hovered.y) / H) * 100}%`,
                    transform: `translate(${sx(hovered.x) > W * 0.7 ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
                  }}
                >
                  <p className="font-semibold">{hovered.r.name} <span className="font-normal text-gray-300">{[hovered.r.team, hovered.r.position].filter(Boolean).join(' · ')}</span></p>
                  <p>{mx.label} : {fmt(mx, hovered.x)}</p>
                  <p>{my.label} : {fmt(my, hovered.y)}</p>
                  <p>Écart à la tendance : {fmt({ ...my, signed: true }, hovered.res)}</p>
                  <p className="text-gray-300">{hovered.r.owner ? hovered.r.owner.poolerName : 'Disponible'}</p>
                </div>
              )}
            </div>
            )}
          </div>

          <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full bg-white rounded-lg shadow overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
                <p className="text-sm font-semibold text-gray-700">Joueurs affichés</p>
                <input type="text" placeholder="Nom ou équipe" value={search} onChange={e => setSearch(e.target.value)} className={`${selectCls} w-36 sm:w-48`} />
              </div>
              <div className="overflow-x-auto max-h-[70vh]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="sticky top-0 left-0 z-20 bg-gray-50 px-2 sm:px-3 py-2.5 font-medium text-gray-600">Joueur</th>
                      <th className="hidden sm:table-cell sticky top-0 z-10 bg-gray-50 px-3 py-2.5 font-medium text-gray-600">Éq.</th>
                      <th className="hidden sm:table-cell sticky top-0 z-10 bg-gray-50 px-3 py-2.5 font-medium text-gray-600">Pos</th>
                      {([['x', mx.label], ['y', my.label], ['res', 'Écart à la tendance'], ['ptsPerM', 'Pts par M$']] as const).map(([k, label]) => (
                        <th key={k} onClick={() => onSort(k)}
                          className={`sticky top-0 z-10 bg-gray-50 px-2 sm:px-3 py-2.5 font-medium text-right sm:whitespace-nowrap cursor-pointer select-none ${sort.key === k ? 'text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}>
                          {label}{arrow(k)}
                        </th>
                      ))}
                      <th className="hidden sm:table-cell sticky top-0 z-10 bg-gray-50 px-3 py-2.5 font-medium text-gray-600">Pool</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map(p => (
                      <tr key={p.r.nhlId} className={`border-b last:border-0 ${hover === p.r.nhlId ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        onMouseEnter={() => setHover(p.r.nhlId)} onMouseLeave={() => setHover(null)}>
                        <td className="sticky left-0 z-10 bg-white px-2 sm:px-3 py-2 font-medium text-gray-800 max-sm:max-w-[9rem] sm:whitespace-nowrap">
                          <PlayerLink nhlId={p.r.nhlId}>{p.r.name}</PlayerLink>
                          <span className="sm:hidden block text-[11px] font-normal text-gray-400">
                            {[p.r.team, p.r.position, p.r.owner ? p.r.owner.poolerName : 'Disponible'].filter(Boolean).join(' · ')}
                          </span>
                        </td>
                        <td className="hidden sm:table-cell px-3 py-2"><TeamBadge code={p.r.team} size="sm" /></td>
                        <td className="hidden sm:table-cell px-3 py-2 text-gray-500">{p.r.position}</td>
                        <td className="px-2 sm:px-3 py-2 text-right tabular-nums text-gray-700">{fmt(mx, p.x)}</td>
                        <td className="px-2 sm:px-3 py-2 text-right tabular-nums text-gray-700">{fmt(my, p.y)}</td>
                        <td className="px-2 sm:px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{fmt({ ...my, signed: true }, p.res)}</td>
                        <td className="px-2 sm:px-3 py-2 text-right tabular-nums text-gray-700">{fmt(METRIC.ptsPerM, p.r.m.ptsPerM)}</td>
                        <td className="hidden sm:table-cell px-3 py-2 whitespace-nowrap text-xs">
                          {p.r.owner
                            ? <span className="text-gray-500">{p.r.owner.poolerName}</span>
                            : <span className="inline-flex items-center gap-1.5 text-green-600 font-medium"><span className="inline-block w-2 h-2 rounded-full bg-green-500" />Disponible</span>}
                        </td>
                      </tr>
                    ))}
                    {tableRows.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-10 text-gray-400 text-sm">Aucun joueur ne correspond aux filtres.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="w-full xl:w-96 shrink-0 bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-semibold text-gray-700">Rendement par pooler</p>
                <p className="text-xs text-gray-400 mt-0.5">Patineurs actifs et réservistes, points de la saison de stats choisie</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2 font-medium text-gray-600">Pooler</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">Joueurs</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">M$</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">Pts</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-right">Pts par M$</th>
                  </tr>
                </thead>
                <tbody>
                  {poolerSummary.map(p => (
                    <tr key={p.name} className="border-t">
                      <td className="px-3 py-2 text-gray-800">
                        <button type="button" onClick={() => setOwner(p.name)} className="hover:underline text-left">{p.name}</button>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{p.n}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{p.cap.toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{p.pts}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{p.perM === null ? '—' : p.perM.toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                    </tr>
                  ))}
                  {poolerSummary.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-6 text-gray-400 text-sm">Aucun alignement pour la saison active.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
