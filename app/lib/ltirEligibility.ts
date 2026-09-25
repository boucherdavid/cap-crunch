/**
 * Admissibilité au LTIR (David, 2026-09-23, règles resserrées le 2026-09-25) — la table
 * `player_injuries` (CBS Sports + ESPN en recoupement, voir python_script/scrape_injuries.py)
 * ne fait qu'informer : le geste "mettre sur LTIR" passe par une demande soumise à l'admin
 * (voir app/lib/ltirRequests.ts). Ce fichier calcule le signal "admissible" affiché comme aide
 * à la décision (pooler ET admin), dans cet ordre :
 * 1. Mis sur la liste des blessés par son équipe LNH (CBS préfixe "IR." / ESPN "Injured
 *    Reserve") → toujours admissible, pour coller à la réalité.
 * 2. Retour estimé (`est_return_date`) à `returnMinDays` jours ou plus → admissible.
 * 3. Retour estimé proche (moins de `returnMinDays`, ou dépassé depuis moins de `graceDays`)
 *    → PAS admissible, même blessé depuis longtemps : période tampon anti-abus — un joueur
 *    annoncé de retour le 2 oct ne peut pas être mis sur LTIR le 2 oct, il faut d'abord voir la
 *    blessure se prolonger (date dépassée et toujours listé blessé).
 * 4. Sinon (aucune date claire, ou date dépassée et toujours blessé) : blessé depuis
 *    `injuredMinDays` jours ou plus (`first_seen_at`) → admissible — couvre le "day-to-day"
 *    qui traîne.
 * Calculé à la volée (jamais stocké) pour rester exact entre deux scrapes quotidiens.
 *
 * Seuils paramétrables par l'admin (David, 2026-09-25 — sujets à discussion avec les poolers) :
 * `app_settings.ltir_*`/`injury_*`, édités dans /admin/effectifs?tab=approbation, lus par
 * `fetchLtirSettings()` (app/lib/injuries.ts). Les défauts ci-dessous ne servent que de repli.
 */

export type LtirSettings = {
  returnMinDays: number       // règle 2 — retour annoncé assez loin
  injuredMinDays: number      // règle 4 — blessé depuis assez longtemps
  graceDays: number           // règle 3 — délai après la date de retour avant "prolongée"
  disagreementDays: number    // écart CBS/ESPN signalé (purement informatif)
  removalAbsenceDays: number  // lu par le scraper seulement — runs quotidiens d'absence avant retrait
}

export const DEFAULT_LTIR_SETTINGS: LtirSettings = {
  returnMinDays: 14,
  injuredMinDays: 14,
  graceDays: 3,
  disagreementDays: 5,
  removalAbsenceDays: 2,
}

export type InjuryEligibilityInput = {
  estReturnDate: string | null  // ISO 'YYYY-MM-DD'
  firstSeenAt: string           // ISO timestamp
  onNhlIr: boolean              // voir isOnNhlIr()
}

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

export function computeLtirEligible(
  injury: InjuryEligibilityInput,
  settings: LtirSettings = DEFAULT_LTIR_SETTINGS,
  today: Date = new Date(),
): boolean {
  if (injury.onNhlIr) return true
  if (injury.estReturnDate) {
    const daysUntilReturn = daysBetween(today, new Date(injury.estReturnDate + 'T12:00:00'))
    if (daysUntilReturn >= settings.returnMinDays) return true
    if (daysUntilReturn > -settings.graceDays) return false  // période tampon
  }
  return daysSinceFirstSeen(injury, today) >= settings.injuredMinDays
}

/** Désaccord CBS/ESPN sur la date de retour (David, 2026-09-24) — purement informatif : le
 * calcul d'admissibilité ci-dessus reste basé sur `est_return_date` (CBS d'abord), on signale
 * seulement l'écart pour que le pooler/l'admin aille vérifier. Faux si l'une des deux manque
 * (rien à comparer) ou si `est_return_date` vient lui-même du repli ESPN (dates identiques). */
export function computeDatesDisagree(
  estReturnDate: string | null,
  espnEstReturnDate: string | null,
  settings: LtirSettings = DEFAULT_LTIR_SETTINGS,
): boolean {
  if (!estReturnDate || !espnEstReturnDate) return false
  const diff = daysBetween(new Date(estReturnDate + 'T12:00:00'), new Date(espnEstReturnDate + 'T12:00:00'))
  return Math.abs(diff) >= settings.disagreementDays
}
