/**
 * Admissibilité au LTIR (David, 2026-09-23) — la table `player_injuries` (CBS Sports + ESPN
 * en recoupement, voir python_script/scrape_injuries.py) ne fait qu'informer : rien n'empêche
 * un pooler de mettre n'importe qui sur LTIR, mais le geste passe maintenant par une demande
 * soumise à l'admin (voir app/lib/ltirRequests.ts) plutôt qu'un effet immédiat. Ce fichier
 * calcule le signal "admissible" affiché comme aide à la décision (pooler ET admin), à partir
 * des règles de David :
 * - blessure dont le retour estimé (`est_return_date`, calculé par le scraper à partir du
 *   texte CBS/ESPN) est à 14 jours ou plus — couvre "semaine à semaine"/"mois à mois" ;
 * - sinon, blessé (peu importe le statut exact) depuis 14 jours ou plus sans date de retour
 *   claire — couvre le cas "day-to-day" qui traîne en longueur.
 * Calculé à la volée (jamais stocké) pour rester exact entre deux scrapes quotidiens.
 */

export type InjuryEligibilityInput = {
  estReturnDate: string | null  // ISO 'YYYY-MM-DD'
  firstSeenAt: string           // ISO timestamp
}

const LTIR_THRESHOLD_DAYS = 14

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000)
}

export function daysSinceFirstSeen(injury: InjuryEligibilityInput, today: Date = new Date()): number {
  return daysBetween(new Date(injury.firstSeenAt), today)
}

export function computeLtirEligible(injury: InjuryEligibilityInput, today: Date = new Date()): boolean {
  if (injury.estReturnDate) {
    const days = daysBetween(today, new Date(injury.estReturnDate + 'T12:00:00'))
    if (days >= LTIR_THRESHOLD_DAYS) return true
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
