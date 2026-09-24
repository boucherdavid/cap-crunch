import { createClient } from '@/lib/supabase/server'
import BlessuresTable from './BlessuresTable'
import { computeLtirEligible } from '@/lib/ltirEligibility'

export const metadata = { title: 'Blessures LNH' }
export const dynamic = 'force-dynamic'

export type InjuryRow = {
  playerId: number
  nhlId: number | null
  firstName: string
  lastName: string
  position: string | null
  teamCode: string | null
  injuryType: string
  status: string
  updatedLabel: string
  eligible: boolean
  owner: { poolerName: string; playerType: 'actif' | 'reserviste' | 'recrue' | 'ltir' } | null
}

/** Qui possède chaque joueur dans la saison active, peu importe son type de roster —
 * contexte utile ici (contrairement au widget d'accueil, cette page couvre toute la LNH,
 * pas seulement les actifs/réservistes du pool). */
async function fetchOwnerByPlayerId(): Promise<Map<number, { poolerName: string; playerType: 'actif' | 'reserviste' | 'recrue' | 'ltir' }>> {
  try {
    const supabase = await createClient()
    const { data: season } = await supabase
      .from('pool_seasons')
      .select('id')
      .eq('is_active', true)
      .eq('is_playoff', false)
      .single()
    if (!season) return new Map()

    const { data: rosters } = await supabase
      .from('pooler_rosters')
      .select('player_id, player_type, poolers (name)')
      .eq('pool_season_id', season.id)
      .eq('is_active', true)
    if (!rosters) return new Map()

    const map = new Map<number, { poolerName: string; playerType: 'actif' | 'reserviste' | 'recrue' | 'ltir' }>()
    for (const r of rosters as unknown as { player_id: number; player_type: string; poolers: { name: string } | null }[]) {
      const type = r.player_type === 'agent_libre' ? 'reserviste' : r.player_type
      if (r.poolers && ['actif', 'reserviste', 'recrue', 'ltir'].includes(type)) {
        map.set(r.player_id, { poolerName: r.poolers.name, playerType: type as 'actif' | 'reserviste' | 'recrue' | 'ltir' })
      }
    }
    return map
  } catch {
    return new Map()
  }
}

export default async function BlessuresPage() {
  const supabase = await createClient()

  const [{ data: injuriesData }, ownerByPlayerId] = await Promise.all([
    supabase
      .from('player_injuries')
      .select('player_id, injury_type, status, updated_label, est_return_date, first_seen_at, players (id, nhl_id, first_name, last_name, position, teams (code))')
      .order('player_id'),
    fetchOwnerByPlayerId(),
  ])

  const rows: InjuryRow[] = (injuriesData ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((row: any) => {
      const player = row.players
      if (!player) return null
      return {
        playerId: player.id,
        nhlId: player.nhl_id,
        firstName: player.first_name,
        lastName: player.last_name,
        position: player.position,
        teamCode: player.teams?.code ?? null,
        injuryType: row.injury_type,
        status: row.status,
        updatedLabel: row.updated_label,
        eligible: computeLtirEligible({ estReturnDate: row.est_return_date, firstSeenAt: row.first_seen_at }),
        owner: ownerByPlayerId.get(player.id) ?? null,
      }
    })
    .filter((r: InjuryRow | null): r is InjuryRow => r !== null)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <BlessuresTable rows={rows} />
    </div>
  )
}
