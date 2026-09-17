/**
 * Bornes de semaines/mois (heure de l'Est) pour les classements hebdomadaire/mensuel.
 * Semaine = lundi à dimanche (David, 2026-09-17).
 */
import { getTodayET, addDaysToDate } from '@/lib/daily-recap'
import type { DateRange } from '@/lib/standings'

const TZ = 'America/Toronto'

/** Jour de semaine ISO (1=lundi..7=dimanche) d'une date "YYYY-MM-DD", sans ambiguïté de fuseau
 * (calculé directement sur les composantes Y/M/D, pas sur l'heure locale du serveur). */
function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=dim..6=sam
  return day === 0 ? 7 : day
}

/** Instant UTC correspondant à minuit heure de l'Est pour une date "YYYY-MM-DD" — gère
 * l'heure d'été/hiver (contrairement à un simple décalage fixe -04:00/-05:00). */
function localMidnightUTC(dateStr: string): Date {
  const guess = new Date(`${dateStr}T00:00:00Z`)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = Object.fromEntries(fmt.formatToParts(guess).map(p => [p.type, p.value])) as Record<string, string>
  const asIfUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return new Date(guess.getTime() - (asIfUTC - guess.getTime()))
}

// ─── Semaine ──────────────────────────────────────────────────────────────────

/** Lundi (YYYY-MM-DD) de la semaine contenant `dateStr` */
export function mondayOfWeek(dateStr: string): string {
  return addDaysToDate(dateStr, -(isoWeekday(dateStr) - 1))
}

export function currentMondayET(): string {
  return mondayOfWeek(getTodayET())
}

export function addWeeks(mondayStr: string, n: number): string {
  return addDaysToDate(mondayStr, n * 7)
}

/** [lundi 00:00 ET, lundi suivant 00:00 ET[ */
export function weekRange(mondayStr: string): DateRange {
  const nextMonday = addDaysToDate(mondayStr, 7)
  return { from: localMidnightUTC(mondayStr).toISOString(), to: localMidnightUTC(nextMonday).toISOString() }
}

// ─── Mois ─────────────────────────────────────────────────────────────────────

/** "YYYY-MM" */
export function currentMonthET(): string {
  return getTodayET().slice(0, 7)
}

export function addMonths(monthStr: string, n: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/** [1er du mois 00:00 ET, 1er du mois suivant 00:00 ET[ */
export function monthRange(monthStr: string): DateRange {
  const from = `${monthStr}-01`
  const to = `${addMonths(monthStr, 1)}-01`
  return { from: localMidnightUTC(from).toISOString(), to: localMidnightUTC(to).toISOString() }
}
