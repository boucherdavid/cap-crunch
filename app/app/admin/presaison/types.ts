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
  // Indicateur de préparation au repêchage AL (informationnel, pas un blocage). Deux états
  // distincts, pas confondre : "trop de joueurs / trop de cap utilisé" (isOverLimits — il faut
  // libérer des joueurs, pas signer) vs "manque d'espace pour compléter l'alignement au
  // salaire minimum" (slotsManquants>0 avec capSpace insuffisant — il peut manquer d'espace
  // même sans être en surplus). isReadyForDraft est faux dans les deux cas.
  isOverLimits: boolean
  slotsManquants: number
  capNeededForReady: number
  isReadyForDraft: boolean
  // Déclaration "mon alignement est prêt" (David, 2026-09-08, presaison_pooler_ready) —
  // distincte d'isCompliant : une intention du pooler, pas un calcul. Remise à null dès que le
  // pooler soumet un changement réel via le libre-service (submitSelfServiceAction).
  readyAt: string | null
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
  // Phase "libération de joueurs" — tant que true, le libre-service pooler peut libérer
  // n'importe quel joueur signé ; une fois fermée, seules les recrues de banque restent
  // libérables/activables, et le repêchage AL peut démarrer. Voir schema.sql.
  release_phase_open: boolean
}
