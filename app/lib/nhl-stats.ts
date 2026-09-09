/**
 * Utilitaire partagé — fetch des stats joueurs depuis l'API NHL publique.
 * Utilisé par /classement et /pool-series (playoffs).
 */

import { createClient } from '@/lib/supabase/server'

const NHL_REST = 'https://api.nhle.com/stats/rest/en'
// Repli seulement — utilisé quand aucune saison active n'est trouvée en base.
// Ne pas bumper à la main chaque année : voir fetchActiveNhlSeasonId ci-dessous,
// qui dérive dynamiquement l'id NHL depuis pool_seasons.is_active.
export const NHL_SEASON = '20252026'

/** "2025-26" → "20252026", "2026-PO" → "20252026" (les séries d'avril-juin 2026 concluent la saison 2025-26) */
export function toNhlSeasonId(season: string): string {
  if (season.endsWith('-PO')) {
    const endYear = parseInt(season.replace('-PO', ''), 10)
    return String((endYear - 1) * 10000 + endYear)
  }
  const start = parseInt(season.split('-')[0], 10)
  return String(start * 10000 + (start + 1))
}

/** Lit la saison active depuis pool_seasons et retourne l'id NHL (ex: "20262027"). Fallback sur NHL_SEASON. */
export async function fetchActiveNhlSeasonId(isPlayoff: boolean): Promise<string> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('pool_seasons')
      .select('season')
      .eq('is_active', true)
      .eq('is_playoff', isPlayoff)
      .single()
    if (data?.season) return toNhlSeasonId(data.season)
    return NHL_SEASON
  } catch {
    return NHL_SEASON
  }
}

export type NhlSkaterStat = {
  playerId: number
  firstName: string
  lastName: string
  teamAbbrev: string
  position: string
  gamesPlayed: number
  goals: number
  assists: number
  gameWinningGoals: number
}

export type NhlGoalieStat = {
  playerId: number
  firstName: string
  lastName: string
  teamAbbrev: string
  gamesStarted: number
  wins: number
  otLosses: number
  shutouts: number
  goals: number
  assists: number
}

export function normName(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/-/g, ' ').trim()
}

function splitName(full: string): { firstName: string; lastName: string } {
  const i = full.indexOf(' ')
  if (i < 0) return { firstName: full, lastName: '' }
  return { firstName: full.slice(0, i), lastName: full.slice(i + 1) }
}

type Row = Record<string, unknown>

function buildUrl(type: 'skater' | 'goalie', gameType: number, nhlSeason = NHL_SEASON): string {
  const cayenne = `gameTypeId=${gameType} and seasonId<=${nhlSeason} and seasonId>=${nhlSeason}`
  return (
    `${NHL_REST}/${type}/summary` +
    `?isAggregate=false&isGame=false` +
    `&start=0&limit=-1` +
    `&factCayenneExp=${encodeURIComponent('gamesPlayed>=1')}` +
    `&cayenneExp=${encodeURIComponent(cayenne)}`
  )
}

async function fetchRawSkaters(gameType: number, nhlSeason = NHL_SEASON): Promise<Row[]> {
  try {
    const res = await fetch(buildUrl('skater', gameType, nhlSeason), { cache: 'no-store' })
    if (!res.ok) return []
    return ((await res.json()).data as Row[]) ?? []
  } catch {
    return []
  }
}

async function fetchRawGoalies(gameType: number, nhlSeason = NHL_SEASON): Promise<Row[]> {
  try {
    const res = await fetch(buildUrl('goalie', gameType, nhlSeason), { cache: 'no-store' })
    if (!res.ok) return []
    return ((await res.json()).data as Row[]) ?? []
  } catch {
    return []
  }
}

function groupSkaterRows(rows: Row[]): NhlSkaterStat[] {
  const byPlayer = new Map<number, Row[]>()
  for (const p of rows) {
    const id = Number(p.playerId)
    if (!byPlayer.has(id)) byPlayer.set(id, [])
    byPlayer.get(id)!.push(p)
  }
  const result: NhlSkaterStat[] = []
  for (const entries of byPlayer.values()) {
    entries.sort((a, b) => Number(b.gamesPlayed ?? 0) - Number(a.gamesPlayed ?? 0))
    const main = entries[0]!
    const { firstName, lastName } = splitName(String(main.skaterFullName ?? ''))
    result.push({
      playerId: Number(main.playerId),
      firstName,
      lastName,
      teamAbbrev: entries.length > 1 ? `${entries.length} TM` : String(main.teamAbbrevs ?? ''),
      position: String(main.positionCode ?? ''),
      gamesPlayed: entries.reduce((s, e) => s + Number(e.gamesPlayed ?? 0), 0),
      goals:       entries.reduce((s, e) => s + Number(e.goals ?? 0), 0),
      assists:     entries.reduce((s, e) => s + Number(e.assists ?? 0), 0),
      gameWinningGoals: entries.reduce((s, e) => s + Number(e.gameWinningGoals ?? 0), 0),
    })
  }
  return result
}

function groupGoalieRows(rows: Row[]): NhlGoalieStat[] {
  const byPlayer = new Map<number, Row[]>()
  for (const p of rows) {
    const id = Number(p.playerId)
    if (!byPlayer.has(id)) byPlayer.set(id, [])
    byPlayer.get(id)!.push(p)
  }
  const result: NhlGoalieStat[] = []
  for (const entries of byPlayer.values()) {
    entries.sort((a, b) => Number(b.gamesStarted ?? 0) - Number(a.gamesStarted ?? 0))
    const main = entries[0]!
    const { firstName, lastName } = splitName(String(main.goalieFullName ?? ''))
    result.push({
      playerId: Number(main.playerId),
      firstName,
      lastName,
      teamAbbrev:   entries.length > 1 ? `${entries.length} TM` : String(main.teamAbbrevs ?? ''),
      gamesStarted: entries.reduce((s, e) => s + Number(e.gamesStarted ?? 0), 0),
      wins:         entries.reduce((s, e) => s + Number(e.wins ?? 0), 0),
      otLosses:     entries.reduce((s, e) => s + Number(e.otLosses ?? 0), 0),
      shutouts:     entries.reduce((s, e) => s + Number(e.shutouts ?? 0), 0),
      goals:        entries.reduce((s, e) => s + Number(e.goals ?? 0), 0),
      assists:      entries.reduce((s, e) => s + Number(e.assists ?? 0), 0),
    })
  }
  return result
}

/** Retourne une map normName → stats pour tous les patineurs de la saison. */
export async function fetchNhlSkaters(gameType = 2, nhlSeason = NHL_SEASON): Promise<Map<string, NhlSkaterStat>> {
  const rows = await fetchRawSkaters(gameType, nhlSeason)
  const result = new Map<string, NhlSkaterStat>()
  for (const stat of groupSkaterRows(rows)) {
    result.set(normName(`${stat.firstName} ${stat.lastName}`), stat)
  }
  return result
}

/** Retourne une map nhl_id → stats pour tous les patineurs de la saison. */
export async function fetchNhlSkatersByNhlId(gameType = 2, nhlSeason = NHL_SEASON): Promise<Map<number, NhlSkaterStat>> {
  const rows = await fetchRawSkaters(gameType, nhlSeason)
  const result = new Map<number, NhlSkaterStat>()
  for (const stat of groupSkaterRows(rows)) {
    result.set(stat.playerId, stat)
  }
  return result
}

/** Retourne une map normName → stats pour tous les gardiens de la saison. */
export async function fetchNhlGoalies(gameType = 2, nhlSeason = NHL_SEASON): Promise<Map<string, NhlGoalieStat>> {
  const rows = await fetchRawGoalies(gameType, nhlSeason)
  const result = new Map<string, NhlGoalieStat>()
  for (const stat of groupGoalieRows(rows)) {
    result.set(normName(`${stat.firstName} ${stat.lastName}`), stat)
  }
  return result
}

/** Retourne une map nhl_id → stats pour tous les gardiens de la saison. */
export async function fetchNhlGoaliesByNhlId(gameType = 2, nhlSeason = NHL_SEASON): Promise<Map<number, NhlGoalieStat>> {
  const rows = await fetchRawGoalies(gameType, nhlSeason)
  const result = new Map<number, NhlGoalieStat>()
  for (const stat of groupGoalieRows(rows)) {
    result.set(stat.playerId, stat)
  }
  return result
}

/** Formate un total de points pool : entier si .0, sinon 1 décimale. */
export function fmtPts(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}
