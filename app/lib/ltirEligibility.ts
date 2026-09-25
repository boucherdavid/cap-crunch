/**
 * Admissibilité au LTIR (David, 2026-09-23, règles resserrées le 2026-09-25) — la table
 * `player_injuries` (CBS Sports + ESPN en recoupement, voir python_script/scrape_injuries.py)
 * ne fait qu'informer : le geste "mettre sur LTIR" passe par une demande soumise à l'admin
 * (voir app/lib/ltirRequests.ts). Ce fichier calcule le signal "admissible" affiché comme aide
 * à la décision (pooler ET admin), dans cet ordre :
 * 1. Mis sur la liste des blessés par son équipe LNH (CBS préfixe "IR." / ESPN "Injured
 *    Reserve") → toujours admissible, pour coller à la réalité.
 * 2. Retour estimé (`est_return_date`) à 14 jours ou plus → admissible.
 * 3. Retour estimé proche (moins de 14 jours, ou dépassé depuis moins de
 *    PROLONGATION_GRACE_DAYS) → PAS admissible, même blessé depuis longtemps : période tampon
 *    anti-abus — un joueur annoncé de retour le 2 oct ne peut pas être mis sur LTIR le 2 oct, il
 *    faut d'abord voir la blessure se prolonger (date dépassée et toujours listé blessé).
 * 4. Sinon (aucune date claire, ou date dépassée et toujours blessé) : blessé depuis 14 jours
 *    ou plus (`first_seen_at`) → admissible — couvre le "day-to-day" qui traîne.
 * Calculé à la volée (jamais stocké) pour rester exact entre deux scrapes quotidiens.
 */

export type InjuryEligibilityInput = {
  estReturnDate: string | null  // ISO 'YYYY-MM-DD'
  firstSeenAt: string           // ISO timestamp
  onNhlIr: boolean              // voir isOnNhlIr()
}

const LTIR_THRESHOLD_DAYS = 14
// Délai après la date de retour annoncée avant de considérer la blessure "prolongée" — laisse
// à CBS le temps de mettre à jour son statut (un joueur réellement rétabli disparaît de la
// liste ; s'il y est encore quelques jours après sa date, la blessure se prolonge).
const PROLONGATION_GRACE_DAYS = 3

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000)
}

/** Placé sur la liste des blessés par son équipe LNH — CBS : statut commençant par "IR." ou
 * "LTIR" ; ESPN : statut canonique "Injured Reserve" (ou mention LTIR). */
export function isOnNhlIr(cbsStatus: string | null, espnStatusDesc: string | null): boolean {
  if (/^\s*(LT)?IR\b/i.test(cbsStatus ?? '')) return true
  return /injured reserve|\bLTIR\b|long[- ]term/i.test(espnStatusDesc ?? '')
}

export function daysSinceFirstSeen(injury: InjuryEligibilityInput, today: Date = new Date()): number {
  return daysBetween(new Date(injury.firstSeenAt), today)
}

export function computeLtirEligible(injury: InjuryEligibilityInput, today: Date = new Date()): boolean {
  if (injury.onNhlIr) return true
  if (injury.estReturnDate) {
    const daysUntilReturn = daysBetween(today, new Date(injury.estReturnDate + 'T12:00:00'))
    if (daysUntilReturn >= LTIR_THRESHOLD_DAYS) return true
    if (daysUntilReturn > -PROLONGATION_GRACE_DAYS) return false  // période tampon
  }
  return daysSinceFirstSeen(injury, today) >= LTIR_THRESHOLD_DAYS
}

/** Désaccord CBS/ESPN sur la date de retour (David, 2026-09-24) — purement informatif : le
 * calcul d'admissibilité ci-dessus reste basé sur `est_return_date` (CBS d'abord), on signale
 * seulement l'écart pour que le pooler/l'admin aille vérifier. Faux si l'une des deux manque
 * (rien à comparer) ou si `est_return_date` vient lui-même du repli ESPN (dates identiques). */
const DISAGREEMENT_THRESHOLD_DAYS = 5

export function computeDatesDisagree(estReturnDate: string | null, espnEstReturnDate: string | null): boolean {
  if (!estReturnDate || !espnEstReturnDate) return false
  const diff = daysBetween(new Date(estReturnDate + 'T12:00:00'), new Date(espnEstReturnDate + 'T12:00:00'))
  return Math.abs(diff) >= DISAGREEMENT_THRESHOLD_DAYS
}
