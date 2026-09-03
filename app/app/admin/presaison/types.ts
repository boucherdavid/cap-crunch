export const FREE_AGENT_THRESHOLD = 500_000

export type RosterEntry = {
  roster_id: number
  player_id: number
  player_type: string
  playerName: string
  position: string | null
  cap_number: number
  isEstimatedCap: boolean
}

export type PoolerCapInfo = {
  id: string
  name: string
  capUsed: number
  capSpace: number
  isCompliant: boolean
  counts: { forward: number; defense: number; goalie: number; reserviste: number }
  roster: RosterEntry[]
}

// État partagé (en base) de la file d'attente du repêchage des agents libres — remplace
// l'ancien état 100% local (queue/draftActive/draftDone) pour survivre à une navigation hors
// de PresaisonManager et rester visible côté pooler.
export type DraftState = {
  pool_season_id: number
  is_active: boolean
  queue: string[] // ids poolers restants, queue[0] = à qui le tour
  turn_started_at: string | null
  turn_duration_seconds: number
  ended_at: string | null
}
