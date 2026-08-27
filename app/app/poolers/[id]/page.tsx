import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import TeamBadge from '@/components/TeamBadge'
import PoolerSwitcher from '@/components/PoolerSwitcher'
import PoolerPageTabs from './PoolerPageTabs'
import PlayerLink from '@/components/PlayerLink'
import { buildStandings } from '@/lib/standings'
import { fetchStreaks, DEFAULT_INDICATOR_CONFIG } from '@/lib/streaks'
import type { StreakInfo } from '@/lib/streaks'
import { getEffectiveCap } from '@/lib/capUtils'

const DASH = '\u2014'
const STAR = '\u2605'
const PROTECTION_SEASONS = 5

const getSaisonFin = (season: string): number =>
  parseInt(season.split('-')[0], 10) + 1

const isProtected = (row: RosterRow, saisonFin: number): boolean => {
  if (!row.rookie_type) return true
  if (row.rookie_type === 'repeche') {
    return (row.pool_draft_year ?? 0) + PROTECTION_SEASONS >= saisonFin
  }
  // agent_libre : protégé tant que ELC
  return row.players?.status === 'ELC'
}

type PlayerRow = {
  id: number
  nhl_id: number | null
  first_name: string
  last_name: string
  position: string | null
  status: string | null
  is_rookie: boolean
  draft_year: number | null
  draft_round: number | null
  draft_overall: number | null
  teams: { code: string } | null
  player_contracts: { season: string; cap_number: number }[]
}

type DraftPickRow = {
  id: number
  round: number
  is_used: boolean
  original_pooler: { id: string; name: string } | null
  pool_seasons: { season: string } | null
}

type RosterRow = {
  id: number
  player_type: string
  rookie_type: 'repeche' | 'agent_libre' | null
  pool_draft_year: number | null
  players: PlayerRow | null
}

type Bucket = 'forward' | 'defense' | 'goalie'

const normalizePlayerType = (playerType: string) => {
  if (playerType === 'agent_libre') return 'reserviste'
  return playerType
}

const getPlayerBucket = (position: string | null): Bucket => {
  const normalizedPosition = (position ?? '').toUpperCase()
  if (normalizedPosition.includes('G')) return 'goalie'
  if (normalizedPosition.includes('D')) return 'defense'
  return 'forward'
}

const formatCap = (amount: number | null) => {
  if (!amount) return DASH
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

const getCurrentCap = (player: PlayerRow | null, season: string | undefined) => {
  if (!player || !season) return 0
  return player.player_contracts?.find((contract) => contract.season === season)?.cap_number ?? 0
}

const getNextSeason = (season: string): string => {
  const [start] = season.split('-')
  const next = parseInt(start) + 1
  return `${next}-${String(next + 1).slice(-2)}`
}

const getNextCap = (player: PlayerRow | null, nextSeason: string | undefined): number | null => {
  if (!player || !nextSeason) return null
  return player.player_contracts?.find(c => c.season === nextSeason)?.cap_number ?? null
}

const getYearsRemaining = (player: PlayerRow | null, currentSeason: string | undefined): number => {
  if (!player || !currentSeason) return 0
  return (player.player_contracts ?? []).filter(c => c.season >= currentSeason && c.cap_number > 0).length
}

type Trend = 'up' | 'down' | 'flat' | 'none'
const getTrend = (current: number, next: number | null): Trend => {
  if (!next || !current) return 'none'
  if (next > current) return 'up'
  if (next < current) return 'down'
  return 'flat'
}
const TREND = {
  up:   { symbol: '↑', cls: 'text-orange-500 font-bold' },
  down: { symbol: '↓', cls: 'text-emerald-600 font-bold' },
  flat: { symbol: '=', cls: 'text-gray-400' },
  none: { symbol: DASH, cls: 'text-gray-300' },
}

const STATUS_CLS: Record<string, string> = {
  ELC: 'text-amber-600',
  RFA: 'text-blue-600',
  UFA: 'text-gray-400',
}

const draftLabel = (player: PlayerRow | null) => {
  if (!player?.draft_year) return null
  const parts = [String(player.draft_year)]
  if (player.draft_round) parts.push(`R${player.draft_round}`)
  if (player.draft_overall) parts.push(`#${player.draft_overall}`)
  return parts.join(' ')
}

const protectionRestante = (row: RosterRow, saisonFin: number, currentSeason?: string): string => {
  if (row.rookie_type === 'repeche' && row.pool_draft_year) {
    const restant = row.pool_draft_year + PROTECTION_SEASONS - saisonFin
    if (restant < 0) return 'Expirée'
    if (restant === 0) return 'Dernière saison'
    return `${restant} an${restant > 1 ? 's' : ''}`
  }
  if (row.rookie_type === 'agent_libre' || !row.rookie_type) {
    if (row.players?.status !== 'ELC') return 'Expirée'
    if (!currentSeason) return 'ELC'
    const restant = (row.players?.player_contracts ?? [])
      .filter(c => c.season >= currentSeason).length
    if (restant === 0) return 'Dernière saison (ELC)'
    if (restant === 1) return '1 an (ELC)'
    return `${restant} ans (ELC)`
  }
  return DASH
}

const sortByDraftYearAsc = (a: RosterRow, b: RosterRow) => {
  const yearDiff = (a.pool_draft_year ?? 9999) - (b.pool_draft_year ?? 9999)
  if (yearDiff !== 0) return yearDiff
  return (a.players?.last_name ?? '').localeCompare(b.players?.last_name ?? '', 'fr-CA')
    || (a.players?.first_name ?? '').localeCompare(b.players?.first_name ?? '', 'fr-CA')
}

function RosterTable({ rows, title, season, nextSeason, salaryCounts, showDraft, saisonFin, splitByPosition, unsignedMultiplier }: {
  rows: RosterRow[]
  title: string
  season?: string
  nextSeason?: string
  salaryCounts: boolean
  showDraft?: boolean
  saisonFin?: number
  splitByPosition?: boolean
  unsignedMultiplier?: number
}) {
  const renderRows = (rowsToRender: RosterRow[]) => rowsToRender.map((row) => {
    const player = row.players
    const effective = salaryCounts && season
      ? getEffectiveCap(player?.player_contracts, season, unsignedMultiplier ?? 1.20)
      : null
    const capNumber = effective?.cap ?? null
    const isEstimated = effective?.isEstimated ?? false
    const nextCap = getNextCap(player, nextSeason)
    const currentRaw = getCurrentCap(player, season)
    const trend = getTrend(currentRaw, nextCap)
    const years = getYearsRemaining(player, season)

    return (
      <tr key={row.id} className="border-b hover:bg-gray-50">
        <td className="px-3 py-2 font-medium text-gray-800">
          {player?.is_rookie && <span className="text-yellow-500 mr-1">{STAR}</span>}
          <PlayerLink nhlId={player?.nhl_id}>
            {player?.last_name}, {player?.first_name}
          </PlayerLink>
        </td>
        <td className="px-3 py-2 w-14"><TeamBadge code={player?.teams?.code} size="sm" /></td>
        <td className="px-3 py-2 w-10 text-gray-500">{player?.position ?? DASH}</td>
        {showDraft
          ? <>
              <td className="px-3 py-2 text-xs">
                {row.rookie_type === 'repeche'
                  ? <span className="inline-block bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5 font-medium">
                      Repêché {row.pool_draft_year ?? ''}
                    </span>
                  : row.rookie_type === 'agent_libre'
                    ? <span className="inline-block bg-amber-50 text-amber-600 rounded px-1.5 py-0.5 font-medium">Agent libre</span>
                    : <span className="text-gray-400">{DASH}</span>
                }
              </td>
              <td className="px-3 py-2 text-gray-400 text-xs">{draftLabel(player) ?? DASH}</td>
              <td className="px-3 py-2 text-xs">
                {(() => {
                  const p = protectionRestante(row, saisonFin ?? 0, season)
                  const expired = p === 'Expirée'
                  return <span className={expired ? 'text-red-500 font-medium' : 'text-gray-600'}>{p}</span>
                })()}
              </td>
              <td className="px-3 py-2 text-right w-28 tabular-nums text-gray-400 text-xs">
                {(() => {
                  const cap = getCurrentCap(player, season)
                  return cap > 0 ? formatCap(cap) : DASH
                })()}
              </td>
              <td className="px-3 py-2 text-right w-28 tabular-nums text-gray-400 text-xs">
                {(() => {
                  const cap = nextSeason ? getNextCap(player, nextSeason) : null
                  return cap && cap > 0 ? formatCap(cap) : DASH
                })()}
              </td>
            </>
          : <>
              <td className="px-3 py-2 text-right text-gray-700 w-28 tabular-nums">
                {formatCap(capNumber)}
                {isEstimated && (
                  <span
                    className="ml-1 text-amber-600 bg-amber-50 rounded px-1 py-0.5 text-[10px] font-medium align-middle"
                    title="Cap simulé — sans contrat pour cette saison, en attente du vrai contrat."
                  >
                    ≈
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right text-gray-400 w-28 tabular-nums">{nextCap !== null ? formatCap(nextCap) : DASH}</td>
              <td className="px-3 py-2 text-center w-8">
                <span className={TREND[trend].cls}>{TREND[trend].symbol}</span>
              </td>
              <td className="px-3 py-2 text-right w-24">
                {years > 0
                  ? <span className="inline-flex items-center gap-1 justify-end">
                      <span className="tabular-nums text-gray-700">{years}&nbsp;an{years > 1 ? 's' : ''}</span>
                      {player?.status && (
                        <span className={`text-xs font-medium ${STATUS_CLS[player.status] ?? 'text-gray-400'}`}>
                          {player.status}
                        </span>
                      )}
                    </span>
                  : <span className="text-gray-300">{DASH}</span>
                }
              </td>
            </>
        }
      </tr>
    )
  })

  const thead = (
    <thead>
      <tr className="bg-gray-50 border-b">
        <th className="text-left px-3 py-2 font-medium text-gray-600">Joueur</th>
        <th className="text-left px-3 py-2 font-medium text-gray-600 w-14">Équipe</th>
        <th className="text-left px-3 py-2 font-medium text-gray-600 w-10">Pos</th>
        {showDraft
          ? <>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Rep. LNH</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Protection</th>
              <th className="text-right px-3 py-2 font-medium text-gray-400 w-28">Cap {season}</th>
              <th className="text-right px-3 py-2 font-medium text-gray-400 w-28">Cap {nextSeason}</th>
            </>
          : <>
              <th className="text-right px-3 py-2 font-medium text-gray-600 w-28">Cap {season}</th>
              <th className="text-right px-3 py-2 font-medium text-gray-400 w-28">Cap {nextSeason}</th>
              <th className="text-center px-3 py-2 font-medium text-gray-400 w-8">↕</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Contrat</th>
            </>
        }
      </tr>
    </thead>
  )

  if (splitByPosition) {
    const groups: { label: string; bucket: Bucket }[] = [
      { label: 'Attaquants', bucket: 'forward' },
      { label: 'Défenseurs', bucket: 'defense' },
      { label: 'Gardiens', bucket: 'goalie' },
    ]
    return (
      <div className="mb-6">
        {title && <h3 className="font-semibold text-gray-700 mb-2">{title}{!title.includes('(') ? ` (${rows.length})` : ''}</h3>}
        {rows.length === 0
          ? <p className="text-gray-400 text-sm py-2">Aucun joueur</p>
          : groups.map(({ label, bucket }) => {
              const group = rows.filter(r => getPlayerBucket(r.players?.position ?? null) === bucket)
              if (group.length === 0) return null
              return (
                <div key={bucket} className="mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-1">{label} ({group.length})</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">{thead}<tbody>{renderRows(group)}</tbody></table>
                  </div>
                </div>
              )
            })
        }
      </div>
    )
  }

  return (
    <div className="mb-6">
      <h3 className="font-semibold text-gray-700 mb-2">{title}{!title.includes('(') ? ` (${rows.length})` : ''}</h3>
      {rows.length > 0
        ? <div className="overflow-x-auto"><table className="w-full text-sm">{thead}<tbody>{renderRows(rows)}</tbody></table></div>
        : <p className="text-gray-400 text-sm py-2">Aucun joueur</p>
      }
    </div>
  )
}

export default async function PoolerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: saison } = await supabase
    .from('pool_seasons')
    .select('*')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .single()

  const [{ data: pooler }, { data: allPoolers }, { data: settings }] = await Promise.all([
    supabase.from('poolers').select('id, name').eq('id', id).single(),
    supabase.from('poolers').select('id, name').order('name'),
    supabase.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle(),
  ])
  const unsignedMultiplier = settings?.unsigned_player_cap_multiplier ?? 1.20

  if (!pooler) notFound()

  const { data: picksData } = await supabase
    .from('pool_draft_picks')
    .select(`
      id, round, is_used,
      original_pooler:poolers!original_owner_id (id, name),
      pool_seasons (season)
    `)
    .eq('current_owner_id', id)
    .eq('is_used', false)
    .order('pool_season_id')
    .order('round')

  const picks = (picksData ?? []) as unknown as DraftPickRow[]

  // Grouper par saison
  const picksBySaison = picks.reduce<Record<string, DraftPickRow[]>>((acc, pick) => {
    const season = pick.pool_seasons?.season ?? '?'
    acc[season] = [...(acc[season] ?? []), pick]
    return acc
  }, {})

  const saison_ = saison as Record<string, unknown> | null
  let changeLogQuery = supabase
    .from('roster_change_log')
    .select('id, change_type, old_type, new_type, changed_at, is_admin_override, players(first_name, last_name, position)')
    .eq('pooler_id', id)
    .eq('pool_season_id', saison?.id)
    .order('changed_at', { ascending: false })
  if (saison_?.saison_start_date)
    changeLogQuery = changeLogQuery.gte('changed_at', saison_.saison_start_date as string)
  if (saison_?.saison_end_date)
    changeLogQuery = changeLogQuery.lte('changed_at', `${saison_.saison_end_date as string}T23:59:59Z`)

  const { data: changeLogData } = await changeLogQuery

  const changeLog = (changeLogData ?? []) as unknown as {
    id: number
    change_type: string
    old_type: string | null
    new_type: string | null
    changed_at: string
    is_admin_override: boolean | null
    players: { first_name: string; last_name: string; position: string | null } | null
  }[]

  const { data } = await supabase
    .from('pooler_rosters')
    .select(`
      id, player_type, rookie_type, pool_draft_year,
      players (
        id, nhl_id, first_name, last_name, position, status, is_rookie,
        draft_year, draft_round, draft_overall,
        teams (code),
        player_contracts (season, cap_number)
      )
    `)
    .eq('pooler_id', id)
    .eq('pool_season_id', saison?.id)
    .eq('is_active', true)
    .order('player_type')

  const roster = ((data ?? []) as unknown as RosterRow[]).map((row) => ({
    ...row,
    player_type: normalizePlayerType(row.player_type),
  }))

  const saisonFin = saison ? getSaisonFin(saison.season) : 0
  const nextSeason = saison ? getNextSeason(saison.season) : undefined
  const actifs = roster.filter((row) => row.player_type === 'actif')
  const reservistes = roster.filter((row) => row.player_type === 'reserviste')
  const ltir = roster.filter((row) => row.player_type === 'ltir')
  const recrues = roster.filter((row) => row.player_type === 'recrue')
  const banqueRecrues = recrues.filter((row) => isProtected(row, saisonFin))
  const activationObligatoire = recrues.filter((row) => !isProtected(row, saisonFin))

  const activeCounts = actifs.reduce(
    (counts, row) => {
      const bucket = getPlayerBucket(row.players?.position ?? null)
      counts[bucket] += 1
      return counts
    },
    { forward: 0, defense: 0, goalie: 0 } as Record<Bucket, number>,
  )

  const estimatedCapCount = [...actifs, ...reservistes].filter((row) => saison?.season
    && getEffectiveCap(row.players?.player_contracts, saison.season, unsignedMultiplier).isEstimated).length

  const capUtilise = [...actifs, ...reservistes, ...ltir].reduce((sum, row) => {
    if (row.player_type === 'ltir') return sum  // LTIR exclut de la masse salariale
    if (!saison?.season) return sum
    return sum + getEffectiveCap(row.players?.player_contracts, saison.season, unsignedMultiplier).cap
  }, 0)

  const capTotal = saison?.pool_cap ?? 0
  const capPct = capTotal > 0 ? (capUtilise / capTotal) * 100 : 0

  const nextNhlCapVal = (saison as Record<string, unknown> | null)?.next_nhl_cap as number | null ?? null
  const nextPoolCap = nextNhlCapVal && saison?.cap_multiplier
    ? Math.ceil((nextNhlCapVal * saison.cap_multiplier) / 1_000_000) * 1_000_000
    : null
  const capNextSaison = [...actifs, ...reservistes].reduce((sum, row) => {
    return sum + (getNextCap(row.players, nextSeason) ?? 0)
  }, 0)
  const capNextPct = nextPoolCap && nextPoolCap > 0 ? (capNextSaison / nextPoolCap) * 100 : 0

  const byCapDesc = (a: RosterRow, b: RosterRow) =>
    getCurrentCap(b.players, saison?.season) - getCurrentCap(a.players, saison?.season)

  const capAndPicksContent = (
    <>
      <div className="bg-white rounded-lg shadow p-5 mb-6 space-y-3">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-gray-700">Masse salariale</span>
          <span className="font-semibold">
            <span className={capPct > 100 ? 'text-red-600' : 'text-gray-800'}>{formatCap(capUtilise)}</span>
            <span className="text-gray-400"> / {formatCap(capTotal)}</span>
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${capPct > 100 ? 'bg-red-500' : capPct > 90 ? 'bg-orange-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(capPct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 text-right">
          Disponible: {formatCap(capTotal - capUtilise)}
        </p>
        {estimatedCapCount > 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1.5">
            ≈ Inclut {estimatedCapCount} joueur{estimatedCapCount > 1 ? 's' : ''} sans contrat
            connu pour cette saison — cap simulé, à ajuster une fois le vrai contrat signé.
          </p>
        )}
        {nextPoolCap !== null && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium text-gray-600">Masse salariale {nextSeason}</span>
              <span className="font-semibold">
                <span className={capNextPct > 100 ? 'text-red-600 font-bold' : 'text-gray-700'}>{formatCap(capNextSaison)}</span>
                <span className="text-gray-400"> / {formatCap(nextPoolCap)}</span>
                {capNextPct > 100 && <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">⚠ Dépassement</span>}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${capNextPct > 100 ? 'bg-red-400' : capNextPct > 90 ? 'bg-orange-400' : 'bg-indigo-400'}`}
                style={{ width: `${Math.min(capNextPct, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 text-right mt-1">
              Disponible: {formatCap(nextPoolCap - capNextSaison)}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Actifs: {actifs.length} / 20</div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Attaquants: {activeCounts.forward} / 12</div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Defenseurs: {activeCounts.defense} / 6</div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Gardiens: {activeCounts.goalie} / 2</div>
        </div>
        <p className="text-xs text-gray-500">La banque de recrues et les joueurs LTIR ne comptent pas dans la masse salariale. Les joueurs actifs et réservistes comptent toujours, même s&apos;ils sont recrues.</p>
      </div>

      {picks.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Choix de repêchage</h2>
          <div className="space-y-4">
            {Object.entries(picksBySaison)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([season, seasonPicks]) => (
                <div key={season}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Saison {season}
                    {season === saison?.season && (
                      <span className="ml-2 bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded normal-case font-medium">Active</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {seasonPicks.map((pick) => {
                      const isOwn = pick.original_pooler?.id === id
                      return (
                        <div key={pick.id} className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 min-w-[90px]">
                          <span className="text-sm font-bold text-slate-700">Ronde {pick.round}</span>
                          {isOwn
                            ? <span className="text-xs text-gray-400 mt-1">Propre</span>
                            : <span className="text-xs text-amber-600 mt-1 text-center">De: {pick.original_pooler?.name}</span>
                          }
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </>
  )

  const masseSalarialeContent = (
    <>
      {capAndPicksContent}
      <div className="bg-white rounded-lg shadow p-5">
        <RosterTable rows={actifs.filter(r => getPlayerBucket(r.players?.position ?? null) === 'forward').sort(byCapDesc)} title={`Attaquants (${activeCounts.forward} / 12)`} season={saison?.season} nextSeason={nextSeason} salaryCounts={true} unsignedMultiplier={unsignedMultiplier} />
        <RosterTable rows={actifs.filter(r => getPlayerBucket(r.players?.position ?? null) === 'defense').sort(byCapDesc)} title={`Défenseurs (${activeCounts.defense} / 6)`} season={saison?.season} nextSeason={nextSeason} salaryCounts={true} unsignedMultiplier={unsignedMultiplier} />
        <RosterTable rows={actifs.filter(r => getPlayerBucket(r.players?.position ?? null) === 'goalie').sort(byCapDesc)} title={`Gardiens (${activeCounts.goalie} / 2)`} season={saison?.season} nextSeason={nextSeason} salaryCounts={true} unsignedMultiplier={unsignedMultiplier} />
        <RosterTable rows={reservistes} title="Réservistes" season={saison?.season} nextSeason={nextSeason} salaryCounts={true} unsignedMultiplier={unsignedMultiplier} />
        {ltir.length > 0 && (
          <RosterTable rows={ltir} title={`Liste de blessés long terme — LTIR (${ltir.length})`} season={saison?.season} nextSeason={nextSeason} salaryCounts={true} />
        )}
      </div>
    </>
  )

  const recruesContent = (
    <div className="bg-white rounded-lg shadow p-5">
      {banqueRecrues.length === 0 && activationObligatoire.length === 0
        ? <p className="text-gray-400 text-sm py-4">Aucune recrue dans la banque.</p>
        : <>
            <RosterTable rows={[...banqueRecrues].sort(sortByDraftYearAsc)} title="Banque de recrues" season={saison?.season} nextSeason={nextSeason} salaryCounts={false} showDraft={true} saisonFin={saisonFin} splitByPosition={true} />
            {activationObligatoire.length > 0 && (
              <div className="mt-4 border-l-4 border-red-400 pl-4">
                <h3 className="font-semibold text-red-600 mb-1">Activation obligatoire ({activationObligatoire.length})</h3>
                <p className="text-xs text-gray-400 mb-2">La période de protection est terminée. Ces recrues doivent être activées en début de saison.</p>
                <RosterTable rows={[...activationObligatoire].sort(sortByDraftYearAsc)} title="" season={saison?.season} nextSeason={nextSeason} salaryCounts={false} showDraft={true} saisonFin={saisonFin} splitByPosition={true} />
              </div>
            )}
          </>
      }
    </div>
  )

  const alignementPlayers = saison
    ? (await buildStandings(supabase, saison.id)).find(s => s.poolerId === id)?.players ?? []
    : []

  const indicatorConfig = {
    streakChaud:           (saison as any)?.indicator_streak_chaud          ?? DEFAULT_INDICATOR_CONFIG.streakChaud,
    streakForme:           (saison as any)?.indicator_streak_forme          ?? DEFAULT_INDICATOR_CONFIG.streakForme,
    streakFroid:           (saison as any)?.indicator_streak_froid          ?? DEFAULT_INDICATOR_CONFIG.streakFroid,
    streakCrise:           (saison as any)?.indicator_streak_crise          ?? DEFAULT_INDICATOR_CONFIG.streakCrise,
    fenetreTendance:       (saison as any)?.indicator_fenetre_tendance      ?? DEFAULT_INDICATOR_CONFIG.fenetreTendance,
    goalieWinsStreak:      (saison as any)?.indicator_goalie_wins_streak    ?? DEFAULT_INDICATOR_CONFIG.goalieWinsStreak,
    goalieSvPctThreshold:  (saison as any)?.indicator_goalie_sv_pct         ?? DEFAULT_INDICATOR_CONFIG.goalieSvPctThreshold,
    goalieGaaThreshold:    (saison as any)?.indicator_goalie_gaa            ?? DEFAULT_INDICATOR_CONFIG.goalieGaaThreshold,
    goalieMinGames:        (saison as any)?.indicator_goalie_min_games      ?? DEFAULT_INDICATOR_CONFIG.goalieMinGames,
  }
  const streaksMap = await fetchStreaks(
    alignementPlayers.map(p => ({ nhlId: p.nhlId, isGoalie: p.position === 'G' })),
    2,
    indicatorConfig,
  )
  const streaks: Record<number, StreakInfo> = {}
  streaksMap.forEach((v, k) => { streaks[k] = v })

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{pooler.name}</h1>
          {saison && <p className="text-gray-500 text-sm">Saison {saison.season}</p>}
        </div>
        {allPoolers && allPoolers.length > 1 && (
          <PoolerSwitcher poolers={allPoolers} currentId={id} />
        )}
      </div>
      <PoolerPageTabs
        masseSalarialeContent={masseSalarialeContent}
        recruesContent={recruesContent}
        alignementPlayers={alignementPlayers}
        streaks={streaks}
        changeLog={changeLog}
      />
    </div>
  )
}