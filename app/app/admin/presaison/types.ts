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

// Recrue repêchée dans actif/réserviste dont l'ELC est échu → décision requise
export type ElcDecisionEntry = {
  roster_id: number
  pooler_id: string
  poolerName: string
  player_id: number
  playerName: string
  position: string | null
  draft_year: number
  cap_number: number
  player_type: string // 'actif' | 'reserviste'
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
