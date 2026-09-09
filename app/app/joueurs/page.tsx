import JoueursTable from './JoueursTable'
import { fetchAllPages } from '@/lib/supabase/fetch-all'
import { createClient } from '@/lib/supabase/server'

export type Team = {
  code: string
  name: string
} | null

export type PlayerContract = {
  season: string
  cap_number: number | null
  contract_status: string | null
}

export type PlayerRow = {
  id: string
  nhl_id: number | null
  first_name: string
  last_name: string
  position: string | null
  age: number | null
  status: string | null
  is_available: boolean
  is_rookie: boolean
  draft_year: number | null
  draft_round: number | null
  draft_overall: number | null
  teams: Team
  player_contracts: PlayerContract[] | null
}

export default async function JoueursPage() {
  const supabase = await createClient()

  // Saison active
  const { data: saison } = await supabase
    .from('pool_seasons')
    .select('id, season')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .single()

  // Joueurs déjà dans un roster actif cette saison (actif, reserviste, ltir, recrue)
  const takenSet = new Set<number>()
  if (saison) {
    const { data: rosters } = await supabase
      .from('pooler_rosters')
      .select('player_id')
      .eq('pool_season_id', saison.id)
      .eq('is_active', true)
    for (const row of rosters ?? []) {
      if (row.player_id) takenSet.add(row.player_id)
    }
  }

  const rawPlayers = await fetchAllPages<Omit<PlayerRow, 'is_available'> & { id: number }>(async (from, to) =>
    supabase
      .from('players')
      .select(`
        *,
        teams (code, name),
        player_contracts (season, cap_number, contract_status)
      `)
      .range(from, to),
  )

  const players: PlayerRow[] = rawPlayers.map(p => ({
    ...p,
    id: String(p.id),
    is_available: !takenSet.has(p.id),
  }))

  // Ancre les colonnes de contrats sur la saison active du pool (David, 2026-09-08) —
  // auparavant codée en dur ('2025-26'), donc désynchronisée dès la transition suivante.
  // Repli sur '2025-26' seulement si aucune saison active n'existe (ne devrait pas arriver).
  const currentSeason = saison?.season ?? '2025-26'

  return <JoueursTable players={players} currentSeason={currentSeason} />
}