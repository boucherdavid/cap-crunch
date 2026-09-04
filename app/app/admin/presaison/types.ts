// Salaire minimum LNH — utilisé comme seuil de participation au repêchage AL et comme coût
// par poste manquant pour l'indicateur de préparation. Valeur réelle stockée dans
// app_settings.nhl_minimum_salary (change chaque convention collective) ; ceci n'est que le
// repli si la colonne n'a pas encore été migrée.
export const DEFAULT_NHL_MINIMUM_SALARY = 850_000

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
  // Indicateur de préparation au repêchage AL (informationnel, pas un blocage) : espace cap
  // minimum réel pour compléter légalement l'alignement (12A/6D/2G actifs + 2 réservistes min),
  // au salaire minimum LNH par poste manquant.
  slotsManquants: number
  capNeededForReady: number
  isReadyForDraft: boolean
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
