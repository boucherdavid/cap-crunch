'use server'

import { createClient } from '@/lib/supabase/server'
import { fetchInjuriesByPlayerId, type InjuryInfo } from '@/lib/injuries'
import { normalizeSearch } from '@/lib/normalizeSearch'

/**
 * Recherche globale de joueurs (barre du haut) et sommaire « dans le pool » de la fiche joueur
 * (`PlayerSlideOver`) — David, 2026-10-01. Lecture seule, mêmes données que les pages publiques
 * (contrats, alignements de la saison active, blessures confirmées).
 */

export type PlayerSearchResult = {
  id: number
  nhlId: number | null
  name: string
  teamCode: string | null
  position: string | null
  ownerName: string | null  // null = disponible
}

export type PlayerPoolSummary = {
  id: number
  nhlId: number | null
  name: string
  teamCode: string | null
  position: string | null
  age: number | null
  status: string | null  // ELC, RFA, UFA
  draft: { year: number; round: number | null; overall: number | null } | null
  season: string | null  // saison active du pool
  contracts: { season: string; capNumber: number | null; status: string | null }[]
  owner: { poolerId: string; poolerName: string; playerType: string } | null
  injury: InjuryInfo | null
}

const MAX_RESULTS = 8

type PlayerRow = {
  id: number
  nhl_id: number | null
  first_name: string
  last_name: string
  position: string | null
  team_id: number | null
}

async function fetchActiveSeason(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from('pool_seasons')
    .select('id, season')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .maybeSingle()
  return data
}

export async function searchPlayersGlobalAction(query: string): Promise<PlayerSearchResult[]> {
  const tokens = normalizeSearch(query.trim()).split(/\s+/).filter(t => t.length >= 2)
  if (tokens.length === 0) return []
  const supabase = await createClient()

  // Le RPC cherche UN terme dans le prénom ou le nom : on lui passe le mot le plus long, puis on
  // exige tous les mots dans le nom complet (« connor mcdavid », « mcdavid connor »).
  const longest = [...tokens].sort((a, b) => b.length - a.length)[0]
  const { data } = await supabase
    .rpc('search_players_unaccent', { search_term: longest })
    .select('id, nhl_id, first_name, last_name, position, team_id')
    .order('id')
    .limit(300)

  const matches = ((data ?? []) as PlayerRow[])
    .filter(p => {
      const full = normalizeSearch(`${p.first_name} ${p.last_name}`)
      return tokens.every(t => full.includes(t))
    })
    .sort((a, b) => {
      // Fiches LNH d'abord, puis nom de famille qui commence par le terme, puis ordre alphabétique.
      const nhl = Number(!!b.nhl_id) - Number(!!a.nhl_id)
      if (nhl) return nhl
      const starts = (p: PlayerRow) => Number(tokens.some(t => normalizeSearch(p.last_name).startsWith(t)))
      return starts(b) - starts(a) || a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
    })
    .slice(0, MAX_RESULTS)
  if (matches.length === 0) return []

  const ids = matches.map(p => p.id)
  const season = await fetchActiveSeason(supabase)
  const [{ data: teams }, { data: rosters }] = await Promise.all([
    supabase.from('teams').select('id, code'),
    season
      ? supabase
          .from('pooler_rosters')
          .select('player_id, poolers (name)')
          .eq('pool_season_id', season.id)
          .eq('is_active', true)
          .in('player_id', ids)
      : Promise.resolve({ data: [] }),
  ])
  const teamCode = new Map((teams ?? []).map(t => [t.id, t.code as string]))
  const ownerName = new Map<number, string>()
  for (const r of (rosters ?? []) as unknown as { player_id: number; poolers: { name: string } | null }[]) {
    if (r.poolers) ownerName.set(r.player_id, r.poolers.name)
  }

  return matches.map(p => ({
    id: p.id,
    nhlId: p.nhl_id,
    name: `${p.first_name} ${p.last_name}`,
    teamCode: p.team_id ? teamCode.get(p.team_id) ?? null : null,
    position: p.position,
    ownerName: ownerName.get(p.id) ?? null,
  }))
}

/** Sommaire d'un joueur par `nhlId` (fiche LNH) ou par `playerId` interne (prospect sans nhl_id). */
export async function getPlayerPoolSummaryAction(ref: { nhlId?: number | null; playerId?: number | null }): Promise<PlayerPoolSummary | null> {
  if (!ref.nhlId && !ref.playerId) return null
  const supabase = await createClient()

  const base = supabase
    .from('players')
    .select('id, nhl_id, first_name, last_name, position, age, status, draft_year, draft_round, draft_overall, teams (code)')
  const { data: player } = await (ref.playerId ? base.eq('id', ref.playerId) : base.eq('nhl_id', ref.nhlId!)).maybeSingle()
  if (!player) return null

  const season = await fetchActiveSeason(supabase)
  const [{ data: contracts }, { data: roster }, injuries] = await Promise.all([
    supabase
      .from('player_contracts')
      .select('season, cap_number, contract_status')
      .eq('player_id', player.id)
      .order('season'),
    season
      ? supabase
          .from('pooler_rosters')
          .select('pooler_id, player_type, poolers (name)')
          .eq('pool_season_id', season.id)
          .eq('is_active', true)
          .eq('player_id', player.id)
          .limit(1)
      : Promise.resolve({ data: [] }),
    fetchInjuriesByPlayerId(supabase),
  ])

  const own = ((roster ?? []) as unknown as { pooler_id: string; player_type: string; poolers: { name: string } | null }[])[0]
  return {
    id: player.id,
    nhlId: player.nhl_id,
    name: `${player.first_name} ${player.last_name}`,
    teamCode: (player.teams as unknown as { code: string } | null)?.code ?? null,
    position: player.position,
    age: player.age != null ? Number(player.age) : null,
    status: player.status,
    draft: player.draft_year
      ? { year: player.draft_year, round: player.draft_round, overall: player.draft_overall }
      : null,
    season: season?.season ?? null,
    contracts: (contracts ?? [])
      // Saison active et suivantes seulement (les saisons passées n'aident pas la décision).
      .filter(c => !season || c.season >= season.season)
      .map(c => ({ season: c.season, capNumber: c.cap_number != null ? Number(c.cap_number) : null, status: c.contract_status })),
    owner: own?.poolers ? { poolerId: own.pooler_id, poolerName: own.poolers.name, playerType: own.player_type } : null,
    injury: injuries.get(player.id) ?? null,
  }
}
