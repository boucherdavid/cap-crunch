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
