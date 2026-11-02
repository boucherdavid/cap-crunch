/**
 * Admissibilité au LTIR (David, 2026-09-23, règles resserrées le 2026-09-25) — la table
 * `player_injuries` (CBS Sports + ESPN en recoupement, voir python_script/scrape_injuries.py)
 * ne fait qu'informer : le geste "mettre sur LTIR" passe par une demande soumise à l'admin
 * (voir app/lib/ltirRequests.ts). Ce fichier calcule le signal "admissible" affiché comme aide
 * à la décision (pooler ET admin), dans cet ordre :
 * 1. Mis sur la liste des blessés par son équipe LNH (CBS préfixe "IR." / ESPN "Injured
 *    Reserve" / MoneyPuck IR, IR-LT, IR-NR) → toujours admissible, pour coller à la réalité.
 * 2. Absence prévue (début de l'absence → `est_return_date`) de `returnMinDays` jours ou plus,
 *    et au moins `returnBufferDays` jours avant la date de retour → admissible. Revu le
 *    2026-11-01 (David) : la règle comptait les jours restants à partir d'aujourd'hui, si bien
 *    qu'un joueur annoncé absent « au moins 2 semaines » perdait son admissibilité dès le
 *    lendemain de l'annonce (Matheson : 14 jours restants le 30 oct, 13 le 31). Début de
 *    l'absence = lendemain du dernier match joué, sinon la date de détection (`absenceStart`).
 * 3. Sinon, retour estimé encore à venir (absence prévue trop courte, ou moins de
 *    `returnBufferDays` jours avant le retour) ou dépassé depuis moins de `graceDays` → PAS
 *    admissible, même blessé depuis longtemps : période tampon anti-abus — un joueur annoncé de
 *    retour le 2 oct ne peut pas être mis sur LTIR le 1er ou le 2 oct.
 * 4. Sinon (aucune date claire, ou date dépassée et toujours blessé) : blessé depuis
 *    `injuredMinDays` jours ou plus (`first_seen_at`) → admissible — couvre le "day-to-day"
 *    qui traîne.
 * 0. Avant tout (David, 2026-10-05) : le joueur a joué un match de la LNH après que sa blessure
 *    a été listée, et dans les `recentGameDays` derniers jours → PAS admissible, peu importe
 *    les listes — elles gardent souvent un joueur plusieurs jours après son retour (Marchand :
 *    « IR jusqu'au 25 octobre » chez les trois sources, un but le 4). Voir `playedSinceInjury`.
 * Calculé à la volée (jamais stocké) pour rester exact entre deux scrapes quotidiens.
 *
 * Seuils paramétrables par l'admin (David, 2026-09-25 — sujets à discussion avec les poolers) :
 * `app_settings.ltir_*`/`injury_*`, édités dans /admin/effectifs?tab=approbation, lus par
 * `fetchLtirSettings()` (app/lib/injuries.ts). Les défauts ci-dessous ne servent que de repli.
 */

export type LtirSettings = {
  returnMinDays: number       // règle 2 — absence prévue assez longue
  returnBufferDays: number    // règle 2 — jours minimum avant la date de retour (anti-abus)
  injuredMinDays: number      // règle 4 — blessé depuis assez longtemps
  graceDays: number           // règle 3 — délai après la date de retour avant "prolongée"
  disagreementDays: number    // écart CBS/ESPN signalé (purement informatif)
  removalAbsenceDays: number  // lu par le scraper seulement — runs quotidiens d'absence avant retrait
  returnDeadlineDays: number  // délai pour réintégrer un joueur sur LTIR qui a recommencé à jouer (lib/ltirReturns.ts)
  recentGameDays: number      // règle 0 — un match joué depuis moins de N jours annule l'admissibilité
  relapseGames: number        // rechute d'un joueur sur LTIR : matchs consécutifs manqués avant d'annuler le retour obligatoire (lib/ltirReturns.ts) — un nombre de matchs, pas de jours
}

export const DEFAULT_LTIR_SETTINGS: LtirSettings = {
  returnMinDays: 14,
  returnBufferDays: 2,
  injuredMinDays: 14,
  graceDays: 3,
  disagreementDays: 5,
  removalAbsenceDays: 2,
  returnDeadlineDays: 14,
  recentGameDays: 7,
  relapseGames: 2,
}

export type InjuryEligibilityInput = {
  estReturnDate: string | null  // ISO 'YYYY-MM-DD'
  firstSeenAt: string           // ISO timestamp
  onNhlIr: boolean              // voir isOnNhlIr()
  lastGameAt?: string | null    // dernier match de la LNH joué (ISO), voir fetchLastGameByPlayerId — seulement les `recentGameDays` derniers jours
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000)
}

/** Date civile en heure de l'Est ('YYYY-MM-DD') — compte en jours, pas selon l'heure du calcul. */
function etDate(d: Date): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

function calendarDaysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
}

/** Premier jour d'absence : lendemain du dernier match joué avant que la blessure soit listée,
 * sinon le jour de la détection. Le dernier match n'est connu que s'il date de moins de
 * `recentGameDays` jours : au-delà, la date de détection sous-estime un peu l'absence. */
function absenceStart(injury: InjuryEligibilityInput): string {
  const seen = etDate(new Date(injury.firstSeenAt))
  if (!injury.lastGameAt) return seen
  const dayAfterGame = new Date(Date.parse(etDate(new Date(injury.lastGameAt)) + 'T12:00:00Z') + 86_400_000)
    .toISOString().slice(0, 10)
  return dayAfterGame < seen ? dayAfterGame : seen
}

/** Placé sur la liste des blessés par son équipe LNH — CBS : statut commençant par "IR." ou
 * "LTIR" ; ESPN : statut canonique "Injured Reserve" (ou mention LTIR) ; MoneyPuck : statut
 * officiel IR, IR-LT (LTIR LNH) ou IR-NR (David, 2026-10-01). */
export function isOnNhlIr(cbsStatus: string | null, espnStatusDesc: string | null, mpStatus: string | null = null): boolean {
  if (/^\s*(LT)?IR\b/i.test(cbsStatus ?? '')) return true
  if (/^IR\b/i.test(mpStatus ?? '')) return true
  return /injured reserve|\bLTIR\b|long[- ]term/i.test(espnStatusDesc ?? '')
}

/** Recoupement (David, 2026-10-01) : `player_injuries` contient l'union des trois sources ; un
 * joueur n'est considéré blessé (badge, admissibilité LTIR) que si au moins
 * `MIN_INJURY_SOURCES` sources le listent. Une seule source = « à confirmer », affiché
 * seulement sur /statistiques/blessures. */
export const MIN_INJURY_SOURCES = 2

export type InjurySourcesRow = {
  in_cbs: boolean | null
  espn_status_desc: string | null
  espn_est_return_date: string | null
  mp_status: string | null
  mp_return_date?: string | null
}

export function countInjurySources(row: InjurySourcesRow): number {
  const cbs = row.in_cbs !== false  // null = ligne antérieure à la colonne, forcément issue de CBS
  const espn = !!(row.espn_status_desc || row.espn_est_return_date)
  const mp = !!(row.mp_status || row.mp_return_date)
  return Number(cbs) + Number(espn) + Number(mp)
}

export function daysSinceFirstSeen(injury: InjuryEligibilityInput, today: Date = new Date()): number {
  return daysBetween(new Date(injury.firstSeenAt), today)
}

/** Règle 0 : a joué après que la blessure a été listée, il y a moins de `recentGameDays` jours.
 * S'il se blesse de nouveau, il redevient admissible une fois ce délai passé sans jouer. */
export function playedSinceInjury(
  injury: InjuryEligibilityInput,
  settings: LtirSettings = DEFAULT_LTIR_SETTINGS,
  today: Date = new Date(),
): boolean {
  if (!injury.lastGameAt) return false
  const lastGame = new Date(injury.lastGameAt)
  if (lastGame.getTime() <= new Date(injury.firstSeenAt).getTime()) return false
  return today.getTime() - lastGame.getTime() < settings.recentGameDays * 86_400_000
}

export function computeLtirEligible(
  injury: InjuryEligibilityInput,
  settings: LtirSettings = DEFAULT_LTIR_SETTINGS,
  today: Date = new Date(),
): boolean {
  if (playedSinceInjury(injury, settings, today)) return false
  if (injury.onNhlIr) return true
  if (injury.estReturnDate) {
    const daysUntilReturn = calendarDaysBetween(etDate(today), injury.estReturnDate)
    const plannedAbsence = calendarDaysBetween(absenceStart(injury), injury.estReturnDate)
    if (plannedAbsence >= settings.returnMinDays && daysUntilReturn >= settings.returnBufferDays) return true
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
