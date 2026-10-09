import { createClient } from '@/lib/supabase/server'
import PlayerLink from '@/components/PlayerLink'
import TeamSelect from './TeamSelect'
import { INJURY_STATUS_LABEL, POSITION_LABEL, groupLabel, type LineComboRow } from '@/lib/lineCombos'
import { teamColor } from '@/lib/nhl-colors'
import { seasonLabel } from '@/lib/advancedMetrics'
import CollapsibleLegend from '@/components/CollapsibleLegend'

export const metadata = { title: 'Trios et paires' }
export const dynamic = 'force-dynamic'

/**
 * Trios, paires et unités spéciales actuels d'une équipe (David, 2026-10-02) — « où joue-t-il
 * en ce moment », avantage numérique compris. Données Daily Faceoff, relues chaque jour
 * (python_script/scrape_line_combos.py → team_line_combos). Chaque joueur indique s'il est
 * disponible ou à qui il appartient dans le pool.
 */

type Row = LineComboRow & { players: { nhl_id: number | null } | null; source_name: string | null; source_updated_at: string | null }
type Owner = { poolerName: string; playerType: string }

const TYPE_SHORT: Record<string, string> = { actif: 'A', reserviste: 'R', recrue: 'Rc', ltir: 'LTIR' }

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' }) : ''
}

// Couleurs de l'équipe (David, 2026-10-02) — mêmes couleurs et même logique que la page des
// contrats (JoueursTable) : bandeau en dégradé, titres de section dans la couleur secondaire, ou
// la primaire si la secondaire est trop pâle pour porter du texte blanc. Les couleurs viennent
// de lib/nhl-colors.ts, d'où le `style` (valeurs dynamiques, pas des classes Tailwind).
function sectionColor(code: string): string {
  const colors = teamColor(code)
  const hex = colors.secondary.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
  return (r * 299 + g * 587 + b * 114) / 1000 > 180 ? colors.primary : colors.secondary
}

function SectionTitle({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <h2
      className="-mx-4 -mt-4 mb-3 rounded-t-lg px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white"
      style={{ backgroundColor: sectionColor(code) }}
    >
      {children}
    </h2>
  )
}

function PlayerCell({ row, owners }: { row: Row; owners: Map<number, Owner> }) {
  const owner = row.player_id != null ? owners.get(row.player_id) : undefined
  return (
    <div
      className="min-w-0 rounded-lg border border-gray-100 border-l-4 bg-white px-3 py-2"
      style={{ borderLeftColor: teamColor(row.team_code).primary }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {POSITION_LABEL[row.position_id ?? ''] ?? ''}
      </p>
      <p className="text-sm font-medium text-gray-800 truncate">
        <PlayerLink nhlId={row.players?.nhl_id}>{row.player_name}</PlayerLink>
      </p>
      <p className="text-xs mt-0.5">
        {row.player_id == null
          ? <span className="text-gray-300">—</span>
          : owner
            ? <span className="text-gray-500">{owner.poolerName} <span className="text-gray-400">({TYPE_SHORT[owner.playerType] ?? owner.playerType})</span></span>
            : <span className="inline-flex items-center gap-1 text-green-600 font-medium"><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />Disponible</span>}
        {row.injury_status && (
          <span className="ml-1.5 text-[10px] font-semibold text-red-600">{INJURY_STATUS_LABEL[row.injury_status] ?? row.injury_status}</span>
        )}
      </p>
    </div>
  )
}

function Group({ groupId, rows, owners, cols }: { groupId: string; rows: Row[]; owners: Map<number, Owner>; cols: string }) {
  if (rows.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1.5">{groupLabel(groupId).replace(/^./, c => c.toUpperCase())}</p>
      <div className={`grid gap-2 ${cols}`}>
        {rows.map(r => <PlayerCell key={`${r.group_id}-${r.slot}`} row={r} owners={owners} />)}
      </div>
    </div>
  )
}

// ─── Performance des combinaisons (MoneyPuck, 5 contre 5) ───────────────────────

type LineStat = {
  season: number
  line_id: string
  kind: 'line' | 'pairing'
  name: string | null
  player_ids: number[]
  games_played: number
  icetime: number
  stats: Record<string, number | null>
}

const MIN_GP_FOR_DEFAULT = 10
const MAX_LINES = 12
const MAX_PAIRS = 8

const pctLabel = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)} %`)
const numLabel = (v: number | null | undefined, d = 0) => (v == null ? '—' : v.toFixed(d))

function LineStatsTable({ title, lines, currentKeys, currentLabel }: { title: string; lines: LineStat[]; currentKeys: Set<string>; currentLabel: string }) {
  if (lines.length === 0) return null
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <p className="px-4 py-2.5 text-sm font-semibold text-gray-700 border-b">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500">
              <th className="sticky left-0 bg-gray-50 px-3 py-2 font-medium">Combinaison</th>
              <th className="px-3 py-2 font-medium text-right" title="Parties jouées ensemble">PJ</th>
              <th className="px-3 py-2 font-medium text-right" title="Minutes jouées ensemble à 5 contre 5">Min</th>
              <th className="px-3 py-2 font-medium text-right" title="Part des buts attendus en leur faveur quand ils sont sur la glace (50 % = neutre)">xB %</th>
              <th className="px-3 py-2 font-medium text-right" title="Corsi : part des tentatives de tir en leur faveur">CF %</th>
              <th className="px-3 py-2 font-medium text-right" title="Buts pour – buts contre, à 5 contre 5">Buts</th>
              <th className="px-3 py-2 font-medium text-right" title="Buts attendus pour – contre, à 5 contre 5">xB</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => {
              const isCurrent = currentKeys.has([...l.player_ids].sort((a, b) => a - b).join('-'))
              return (
                <tr key={l.line_id} className={`border-t ${isCurrent ? 'bg-amber-50' : ''}`}>
                  <td className={`sticky left-0 px-3 py-2 text-gray-800 whitespace-nowrap ${isCurrent ? 'bg-amber-50' : 'bg-white'}`}>
                    {(l.name ?? '').replace(/-/g, ' · ')}
                    {isCurrent && <span className="ml-2 text-[10px] font-bold text-amber-800 bg-amber-200 rounded px-1.5 py-0.5">{currentLabel}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{l.games_played}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{Math.round(l.icetime / 60)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{pctLabel(l.stats.xg_pct)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{pctLabel(l.stats.cf_pct)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 whitespace-nowrap">{numLabel(l.stats.gf)} – {numLabel(l.stats.ga)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 whitespace-nowrap">{numLabel(l.stats.xgf, 1)} – {numLabel(l.stats.xga, 1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function TriosPage({ searchParams }: { searchParams: Promise<{ equipe?: string; saison?: string }> }) {
  const supabase = await createClient()
  const params = await searchParams

  // Équipes pour lesquelles on a des données (32 lignes g1 = une par équipe).
  const [{ data: teamRows }, { data: allTeams }] = await Promise.all([
    supabase.from('team_line_combos').select('team_code').eq('group_id', 'f1').eq('slot', 1),
    supabase.from('teams').select('code, name').order('name'),
  ])
  const withData = new Set((teamRows ?? []).map(t => t.team_code as string))
  const teams = ((allTeams ?? []) as { code: string; name: string }[]).filter(t => withData.has(t.code))
  const requested = (params.equipe ?? '').toUpperCase()
  const teamCode = teams.some(t => t.code === requested) ? requested : teams.find(t => t.code === 'MTL')?.code ?? teams[0]?.code ?? null

  if (!teamCode) {
    return (
      <div className="px-2 sm:px-4 py-8">
        {/* Titre : bandeau de section du layout (SectionEyebrow, Navbar.tsx). */}
        <p className="text-center py-10 text-gray-400 text-sm bg-white rounded-lg shadow">Aucune donnée importée pour l&apos;instant.</p>
      </div>
    )
  }

  const { data: season } = await supabase
    .from('pool_seasons').select('id').eq('is_active', true).eq('is_playoff', false).maybeSingle()
  const [{ data: comboRows }, { data: rosters }] = await Promise.all([
    supabase
      .from('team_line_combos')
      .select('team_code, group_id, slot, position_id, player_id, player_name, injury_status, source_name, source_updated_at, players (nhl_id)')
      .eq('team_code', teamCode)
      .order('group_id')
      .order('slot'),
    season
      ? supabase.from('pooler_rosters').select('player_id, player_type, poolers (name)').eq('pool_season_id', season.id).eq('is_active', true)
      : Promise.resolve({ data: [] }),
  ])
  const rows = (comboRows ?? []) as unknown as Row[]
  const owners = new Map<number, Owner>()
  for (const r of (rosters ?? []) as unknown as { player_id: number; player_type: string; poolers: { name: string } | null }[]) {
    if (r.poolers) owners.set(r.player_id, { poolerName: r.poolers.name, playerType: r.player_type })
  }
  const of = (g: string) => rows.filter(r => r.group_id === g)
  const source = rows[0]

  // Performance des combinaisons de cette équipe (MoneyPuck). Saison par défaut : la plus récente
  // où une combinaison a au moins 10 matchs (MoneyPuck publie la nouvelle saison dès ses débuts).
  const { data: lineRows } = await supabase
    .from('line_advanced_stats')
    .select('season, line_id, kind, name, player_ids, games_played, icetime, stats')
    .eq('team', teamCode)
    .order('season', { ascending: false })
    .order('icetime', { ascending: false })
    .order('line_id')
    .limit(1000)
  const allLines = (lineRows ?? []) as LineStat[]
  const lineSeasons = [...new Set(allLines.map(l => l.season))].sort((a, b) => b - a)
  const maxGpBySeason = new Map<number, number>()
  for (const l of allLines) maxGpBySeason.set(l.season, Math.max(maxGpBySeason.get(l.season) ?? 0, l.games_played))
  const requestedSeason = Number(params.saison)
  const lineSeason = lineSeasons.includes(requestedSeason)
    ? requestedSeason
    : lineSeasons.find(s => (maxGpBySeason.get(s) ?? 0) >= MIN_GP_FOR_DEFAULT) ?? lineSeasons[0] ?? null
  const seasonLines = allLines.filter(l => l.season === lineSeason)
  // Combinaisons de l'alignement actuel (Daily Faceoff), pour les repérer dans le tableau.
  const currentKeys = new Set<string>()
  for (const g of ['f1', 'f2', 'f3', 'f4', 'd1', 'd2', 'd3']) {
    const ids = of(g).map(r => r.players?.nhl_id).filter((id): id is number => id != null)
    if (ids.length >= 2) currentKeys.add([...ids].sort((a, b) => a - b).join('-'))
  }

  return (
    <div className="px-2 sm:px-4 py-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-3">
        <div>
          <p className="text-xs text-gray-400 mt-1">
            Données :{' '}
            <a href="https://www.dailyfaceoff.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">Daily Faceoff</a>
            {source?.source_name && <> · Source de l&apos;alignement : {source.source_name}</>}
            {source?.source_updated_at && <> · mis à jour le {fmtDate(source.source_updated_at)}</>}
          </p>
        </div>
        <TeamSelect teams={teams} selected={teamCode} />
      </div>

      <div
        className="mb-6 rounded-lg px-5 py-3 text-white shadow"
        style={{ background: `linear-gradient(90deg, ${teamColor(teamCode).primary} 0%, ${teamColor(teamCode).secondary} 100%)` }}
      >
        <p className="text-xl font-bold leading-tight">
          {teamCode}
          <span className="ml-3 text-sm font-normal uppercase tracking-wide opacity-90">{teams.find(t => t.code === teamCode)?.name}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-gray-50 rounded-lg shadow p-4 space-y-3 overflow-hidden">
          <SectionTitle code={teamCode}>Attaquants</SectionTitle>
          {['f1', 'f2', 'f3', 'f4'].map(g => <Group key={g} groupId={g} rows={of(g)} owners={owners} cols="grid-cols-3" />)}
        </section>

        <div className="space-y-6">
          <section className="bg-gray-50 rounded-lg shadow p-4 space-y-3 overflow-hidden">
            <SectionTitle code={teamCode}>Défenseurs</SectionTitle>
            {['d1', 'd2', 'd3'].map(g => <Group key={g} groupId={g} rows={of(g)} owners={owners} cols="grid-cols-2" />)}
          </section>
          <section className="bg-gray-50 rounded-lg shadow p-4 space-y-3 overflow-hidden">
            <SectionTitle code={teamCode}>Gardiens</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {of('g').map(r => <PlayerCell key={`g-${r.slot}`} row={r} owners={owners} />)}
            </div>
          </section>
        </div>

        <section className="bg-gray-50 rounded-lg shadow p-4 space-y-3 overflow-hidden">
          <SectionTitle code={teamCode}>Avantage numérique</SectionTitle>
          {['pp1', 'pp2'].map(g => <Group key={g} groupId={g} rows={of(g)} owners={owners} cols="grid-cols-2 sm:grid-cols-5" />)}
        </section>

        <section className="bg-gray-50 rounded-lg shadow p-4 space-y-3 overflow-hidden">
          <SectionTitle code={teamCode}>Désavantage numérique</SectionTitle>
          {['pk1', 'pk2'].map(g => <Group key={g} groupId={g} rows={of(g)} owners={owners} cols="grid-cols-2 sm:grid-cols-4" />)}
        </section>

        {of('ir').length > 0 && (
          <section className="bg-gray-50 rounded-lg shadow p-4 space-y-3 overflow-hidden lg:col-span-2">
            <SectionTitle code={teamCode}>Blessés</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {of('ir').map(r => <PlayerCell key={`ir-${r.slot}`} row={r} owners={owners} />)}
            </div>
          </section>
        )}
      </div>

      {lineSeason !== null && seasonLines.length > 0 && (
        <div className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Combinaisons les plus utilisées — {seasonLabel(lineSeason)}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                À 5 contre 5 seulement · Données :{' '}
                <a href="https://moneypuck.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">MoneyPuck.com</a>
              </p>
            </div>
            {lineSeasons.length > 1 && (
              <div className="flex gap-1.5 text-sm">
                {lineSeasons.map(s => (
                  <a
                    key={s}
                    href={`/analytique/trios?equipe=${teamCode}&saison=${s}`}
                    className={`rounded-lg border px-3 py-1.5 ${s === lineSeason ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {seasonLabel(s)}
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="mb-3">
            <CollapsibleLegend title="Comment lire ces tableaux">
              <ul className="space-y-1 text-xs text-gray-500">
                <li>• Chaque ligne est une combinaison qui a réellement joué ensemble, classée par minutes jouées.</li>
                <li>• <strong>xB %</strong> : part des buts attendus en leur faveur quand ils sont sur la glace. Au-dessus de 50 %, ils dominent ; en dessous, ils se font dominer.</li>
                <li>• <strong>CF %</strong> (Corsi) : part des tentatives de tir en leur faveur, une mesure du contrôle de la rondelle.</li>
                <li>• <strong>Buts</strong> et <strong>xB</strong> : pour – contre. Un écart entre les deux (beaucoup de buts, peu de buts attendus) relève souvent de la chance.</li>
                <li>• Une combinaison surlignée fait partie de l&apos;alignement actuel affiché plus haut.</li>
                <li>• Avec peu de minutes ensemble, les pourcentages varient beaucoup : fie-toi surtout aux combinaisons du haut du tableau.</li>
              </ul>
            </CollapsibleLegend>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <LineStatsTable title="Trios" lines={seasonLines.filter(l => l.kind === 'line').slice(0, MAX_LINES)} currentKeys={currentKeys} currentLabel="Trio actuel" />
            <LineStatsTable title="Paires de défenseurs" lines={seasonLines.filter(l => l.kind === 'pairing').slice(0, MAX_PAIRS)} currentKeys={currentKeys} currentLabel="Paire actuelle" />
          </div>
        </div>
      )}

      <p className="mt-4 text-[11px] text-gray-400">
        Alignement du dernier match ou annoncé par un journaliste : il peut changer d&apos;ici le prochain match. Pour les blessures, la page Blessures reste la référence.
      </p>
    </div>
  )
}
