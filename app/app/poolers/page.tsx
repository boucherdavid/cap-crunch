import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { buildStandings } from '@/lib/standings'

export const metadata = { title: 'Tous les alignements' }
export const dynamic = 'force-dynamic'

const RANK_COLOR = ['text-yellow-500', 'text-gray-400', 'text-amber-600']
const PROTECTION_SEASONS = 5

const getSaisonFin = (season: string) => parseInt(season.split('-')[0], 10) + 1

const isProtected = (
  row: { rookie_type: string | null; pool_draft_year: number | null; players: { status: string | null } | null },
  saisonFin: number
) => {
  if (!row.rookie_type) return true
  if (row.rookie_type === 'repeche') return (row.pool_draft_year ?? 0) + PROTECTION_SEASONS >= saisonFin
  return row.players?.status === 'ELC'
}

const formatCap = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const getCurrentCap = (
  player: { player_contracts?: { season: string; cap_number: number }[] } | null,
  season: string
) => player?.player_contracts?.find(c => c.season === season)?.cap_number ?? 0

const getPlayerBucket = (pos: string | null) => {
  const p = (pos ?? '').toUpperCase()
  if (p.includes('G')) return 'goalie'
  if (p.includes('D')) return 'defense'
  return 'forward'
}

type RosterEntry = {
  pooler_id: string
  player_type: string
  rookie_type: string | null
  pool_draft_year: number | null
  players: { last_name: string; status: string | null; position: string | null; player_contracts: { season: string; cap_number: number }[] } | null
}

type PickEntry = {
  current_owner_id: string
  round: number
  pool_seasons: { season: string } | null
}

export default async function PoolersPage() {
  const supabase = await createClient()

  const { data: season } = await supabase
    .from('pool_seasons')
    .select('id, season, pool_cap')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .single()

  if (!season) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Tous les alignements</h1>
        <p className="text-gray-500">Aucune saison active.</p>
      </div>
    )
  }

  const [standings, { data: rosterRows }, { data: picksRows }] = await Promise.all([
    buildStandings(supabase, season.id),
    supabase
      .from('pooler_rosters')
      .select(`
        pooler_id, player_type, rookie_type, pool_draft_year,
        players (last_name, status, position, player_contracts (season, cap_number))
      `)
      .eq('pool_season_id', season.id)
      .eq('is_active', true),
    supabase
      .from('pool_draft_picks')
      .select('current_owner_id, round, pool_seasons (season)')
      .eq('is_used', false)
      .order('pool_season_id')
      .order('round'),
  ])

  const rosterByPooler = new Map<string, RosterEntry[]>()
  for (const row of (rosterRows ?? []) as unknown as RosterEntry[]) {
    if (!rosterByPooler.has(row.pooler_id)) rosterByPooler.set(row.pooler_id, [])
    rosterByPooler.get(row.pooler_id)!.push(row)
  }

  const picksByPooler = new Map<string, PickEntry[]>()
  for (const row of (picksRows ?? []) as unknown as PickEntry[]) {
    if (!picksByPooler.has(row.current_owner_id)) picksByPooler.set(row.current_owner_id, [])
    picksByPooler.get(row.current_owner_id)!.push(row)
  }

  const saisonFin = getSaisonFin(season.season)

  const teams = standings.map((s, i) => {
    const roster = (rosterByPooler.get(s.poolerId) ?? []).map(r => ({
      ...r,
      player_type: r.player_type === 'agent_libre' ? 'reserviste' : r.player_type,
    }))

    const actifs     = roster.filter(r => r.player_type === 'actif')
    const reservistes = roster.filter(r => r.player_type === 'reserviste')
    const ltir       = roster.filter(r => r.player_type === 'ltir')
    const recrues    = roster.filter(r => r.player_type === 'recrue')
    const banque     = recrues.filter(r => isProtected(r, saisonFin))

    const capUtilise = [...actifs, ...reservistes].reduce(
      (sum, r) => sum + getCurrentCap(r.players, season.season), 0
    )
    const capPct = season.pool_cap > 0 ? (capUtilise / season.pool_cap) * 100 : 0

    const actifsNoms = [...actifs]
      .sort((a, b) => {
        const bucketOrder = { forward: 0, defense: 1, goalie: 2 }
        return bucketOrder[getPlayerBucket(a.players?.position ?? null)] - bucketOrder[getPlayerBucket(b.players?.position ?? null)]
      })
      .map(r => r.players?.last_name ?? '')

    const picks = picksByPooler.get(s.poolerId) ?? []
    const picksBySaison: Record<string, number[]> = {}
    for (const pick of picks) {
      const sn = pick.pool_seasons?.season ?? '?'
      if (!picksBySaison[sn]) picksBySaison[sn] = []
      picksBySaison[sn].push(pick.round)
    }

    return {
      poolerId: s.poolerId,
      poolerName: s.poolerName,
      rank: i + 1,
      totalPoints: s.totalPoints,
      capUtilise,
      capPct,
      actifsNoms,
      reservistes: reservistes.length,
      ltir: ltir.length,
      banque: banque.length,
      picks: picks.length,
      picksBySaison,
    }
  })

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Tous les alignements</h1>
      <p className="text-sm text-gray-500 mb-6">
        Saison {season.season} &middot; Cap du pool : {formatCap(season.pool_cap)}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {teams.map(team => {
          const capBarColor = team.capPct > 100 ? 'bg-red-500' : team.capPct > 90 ? 'bg-orange-400' : 'bg-green-500'
          const rankColor   = RANK_COLOR[team.rank - 1] ?? 'text-gray-500'
          const picksSummary = Object.entries(team.picksBySaison)
            .map(([sn, rounds]) => `${sn.slice(2, 4)}-${sn.slice(5)} : ${rounds.map(r => `R${r}`).join(', ')}`)
            .join(' · ')

          return (
            <Link
              key={team.poolerId}
              href={`/poolers/${team.poolerId}`}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-4 sm:p-5 flex flex-col gap-3 group"
            >
              {/* En-tête */}
              <div className="flex items-center gap-2">
                <span className={`font-bold text-lg w-7 text-center shrink-0 ${rankColor}`}>{team.rank}</span>
                <span className="flex-1 font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {team.poolerName}
                </span>
                <span className="text-lg font-bold text-blue-600">{team.totalPoints}</span>
                <span className="text-xs text-gray-400">pts</span>
              </div>

              {/* Masse salariale */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Masse salariale</span>
                  <span>
                    <span className={team.capPct > 100 ? 'text-red-600 font-semibold' : ''}>
                      {formatCap(team.capUtilise)}
                    </span>
                    <span className="text-gray-400"> / {formatCap(season.pool_cap)}</span>
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${capBarColor}`}
                    style={{ width: `${Math.min(team.capPct, 100)}%` }}
                  />
                </div>
              </div>

              {/* Joueurs actifs */}
              <div className="bg-gray-50 rounded-md px-3 py-2">
                <div className="text-xs text-gray-400 mb-1.5">Actifs ({team.actifsNoms.length})</div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {team.actifsNoms.map((nom, j) => (
                    <span key={j} className="text-xs text-gray-700">{nom}</span>
                  ))}
                </div>
              </div>

              {/* Compteurs secondaires */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                <span><span className="font-medium text-gray-700">{team.reservistes}</span> réservistes</span>
                {team.banque > 0 && <span><span className="font-medium text-gray-700">{team.banque}</span> recrues</span>}
                {team.ltir > 0 && <span className="text-orange-500"><span className="font-medium">{team.ltir}</span> LTIR</span>}
              </div>

              {/* Choix de repêchage */}
              <div className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">{team.picks} choix</span>
                {picksSummary && <span className="ml-1 text-gray-400">· {picksSummary}</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
