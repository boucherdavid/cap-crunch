import { createClient } from '@/lib/supabase/server'
import PlayerLink from '@/components/PlayerLink'
import TeamSelect from './TeamSelect'
import { INJURY_STATUS_LABEL, POSITION_LABEL, groupLabel, type LineComboRow } from '@/lib/lineCombos'
import { teamColor } from '@/lib/nhl-colors'

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

export default async function TriosPage({ searchParams }: { searchParams: Promise<{ equipe?: string }> }) {
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
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Trios et paires</h1>
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

  return (
    <div className="px-2 sm:px-4 py-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Trios et paires</h1>
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

      <p className="mt-4 text-[11px] text-gray-400">
        Alignement du dernier match ou annoncé par un journaliste : il peut changer d&apos;ici le prochain match. Pour les blessures, la page Blessures reste la référence.
      </p>
    </div>
  )
}
