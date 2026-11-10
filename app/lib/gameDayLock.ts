import { createClient } from './supabase/server'

// Reporte au lendemain l'effet d'un lot de mouvements si un des joueurs touchés a déjà
// un match commencé aujourd'hui — évite qu'un même lot (ex: échange même pooler, où un
// joueur sort pendant qu'un autre entre) applique le nouveau statut pour aujourd'hui à
// l'un des deux joueurs mais pas à l'autre selon l'heure de leur propre match respectif.
// Horaire NHL interrogé en direct (pas via player_game_logs, qui n'est peuplé qu'après
// coup par le pipeline nocturne).

type ScheduledGame = { awayAbbrev: string; homeAbbrev: string; startTimeUTC: string; gameState: string }

// Heure réelle de la mise au jeu (David, 2026-11-09) : un match prévu à 19 h commence parfois à
// 19 h 15. Un match est « commencé » quand l'horaire LNH le dit en cours ou terminé (`gameState`),
// pas dès que l'heure prévue est passée. `FUT` (à venir) et `PRE` (échauffement) = pas commencé.
// État inconnu (champ absent) → on retombe sur l'heure prévue, par prudence.
const NOT_STARTED_STATES = new Set(['FUT', 'PRE'])
const STARTED_STATES = new Set(['LIVE', 'CRIT', 'FINAL', 'OFF'])

function isGameStarted(g: ScheduledGame, nowMs: number): boolean {
  if (STARTED_STATES.has(g.gameState)) return true
  if (NOT_STARTED_STATES.has(g.gameState)) return false
  return !!g.startTimeUTC && new Date(g.startTimeUTC).getTime() <= nowMs
}

// Le calcul des points compare le statut du joueur à l'heure PRÉVUE du match
// (`player_game_logs.game_start_time`). Un changement accepté après l'heure prévue, mais avant
// la vraie mise au jeu, est donc daté juste avant l'heure prévue — sinon il serait accepté sans
// compter pour ce match. Le décalage (1 ms par 2 s de retard, au plus 998 ms) garde l'ordre de
// plusieurs changements faits pendant le retard.
function backdateBeforeScheduledStart(scheduledMs: number, nowMs: number): string {
  const offset = Math.min(998, Math.floor((nowMs - scheduledMs) / 2000))
  return new Date(scheduledMs - 1000 + offset).toISOString()
}

function todayET(): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function addDaysET(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

async function fetchTodayGames(date: string): Promise<ScheduledGame[]> {
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/schedule/${date}`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const day = (data.gameWeek ?? []).find((d: any) => d.date === date)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((day?.games ?? []) as any[]).map(g => ({
      awayAbbrev: g.awayTeam?.abbrev ?? '',
      homeAbbrev: g.homeTeam?.abbrev ?? '',
      startTimeUTC: g.startTimeUTC ?? '',
      gameState: g.gameState ?? '',
    }))
  } catch {
    return []
  }
}

// Équipes (parmi `teamCodes`) dont un match du jour `date` (AAAA-MM-JJ, heure de l'Est) est
// déjà commencé. Sert à avertir l'admin qu'une date effective forcée sera rétroactive : elle
// prend effet à T12:00:00Z, donc avant ce match. Horaire indisponible → liste vide.
export async function startedTeamsOnDate(date: string, teamCodes: string[]): Promise<string[]> {
  const wanted = new Set(teamCodes)
  if (wanted.size === 0) return []
  const games = await fetchTodayGames(date)
  const nowMs = Date.now()
  const started = new Set<string>()
  for (const g of games) {
    if (!isGameStarted(g, nowMs)) continue
    if (wanted.has(g.awayAbbrev)) started.add(g.awayAbbrev)
    if (wanted.has(g.homeAbbrev)) started.add(g.homeAbbrev)
  }
  return Array.from(started)
}

export type BatchEffectiveDate = {
  effectiveAt: string
  deferred: boolean
}

// Ne bloque jamais la soumission si l'horaire NHL est indisponible (timeout, erreur
// réseau) — on retombe alors sur le comportement actuel (now(), pas de report).
export async function computeBatchEffectiveDate(playerIds: number[]): Promise<BatchEffectiveDate> {
  const now = new Date()
  const fallback = { effectiveAt: now.toISOString(), deferred: false }
  try {
    const uniqueIds = Array.from(new Set(playerIds)).filter(id => id > 0)
    if (uniqueIds.length === 0) return fallback

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: players } = await supabase.from('players').select('id, teams(code)').in('id', uniqueIds) as { data: any[] | null }

    const teamCodes = new Set(
      (players ?? [])
        .map(p => p.teams?.code as string | undefined)
        .filter((c): c is string => !!c),
    )
    if (teamCodes.size === 0) return fallback

    const today = todayET()
    const games = await fetchTodayGames(today)
    const nowMs = now.getTime()

    const teamGames = games.filter(g => teamCodes.has(g.awayAbbrev) || teamCodes.has(g.homeAbbrev))
    const someGameStarted = teamGames.some(g => isGameStarted(g, nowMs))

    if (!someGameStarted) {
      // Heure prévue passée, mise au jeu pas encore faite : effet juste avant l'heure prévue
      // du premier de ces matchs, pour qu'il compte (voir backdateBeforeScheduledStart).
      const lateStarts = teamGames
        .map(g => (g.startTimeUTC ? new Date(g.startTimeUTC).getTime() : NaN))
        .filter(t => Number.isFinite(t) && t <= nowMs)
      if (lateStarts.length === 0) return fallback
      return { effectiveAt: backdateBeforeScheduledStart(Math.min(...lateStarts), nowMs), deferred: false }
    }

    // Même convention que les dates historiques sans heure précise (T12:00:00Z, soit 7h
    // heure de l'Est) — garantit d'être avant tout match du lendemain.
    const tomorrow = addDaysET(today, 1)
    return { effectiveAt: `${tomorrow}T12:00:00Z`, deferred: true }
  } catch {
    return fallback
  }
}

// Désactivations qui déclenchent le délai de réactivation (filtre PostgREST `.or()` sur
// roster_change_log) : mise en réserve, mise sur LTIR, et remise en banque de recrues (David,
// 2026-10-16 — sans elle, banque puis réactivation contournait le délai).
export const REACTIVATION_DELAY_FILTER =
  'change_type.in.(deactivation,ltir),and(change_type.eq.changement_type,new_type.eq.recrue)'

// Annulation le jour même d'une mise en réserve ou d'une remise en banque (David, 2026-10-12,
// banque ajoutée le 2026-10-16) — un joueur envoyé en réserve ou en banque aujourd'hui (heure de
// l'Est) peut être réactivé malgré le délai de réactivation tant
// qu'aucun match de son équipe n'a commencé depuis : la période en réserve ne contient alors
// aucun match, le classement n'est pas touché. Une mise en réserve reportée au lendemain (match
// déjà commencé, voir computeBatchEffectiveDate) a une date future : jamais annulable.
// Horaire de la LNH indisponible → rien n'est annulable (on refuse plutôt que de risquer un abus).
export async function undoableDeactivations(
  items: { playerId: number; teamCode: string | null; changedAt: string }[],
): Promise<Set<number>> {
  const out = new Set<number>()
  const today = todayET()
  const nowMs = Date.now()
  const candidates = items.filter(i => {
    const t = new Date(i.changedAt).getTime()
    return t <= nowMs && todayETOf(new Date(i.changedAt)) === today
  })
  if (candidates.length === 0) return out
  let games: ScheduledGame[]
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/schedule/${today}`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!res.ok) return out
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const day = (data.gameWeek ?? []).find((d: any) => d.date === today)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    games = ((day?.games ?? []) as any[]).map(g => ({
      awayAbbrev: g.awayTeam?.abbrev ?? '',
      homeAbbrev: g.homeTeam?.abbrev ?? '',
      startTimeUTC: g.startTimeUTC ?? '',
      gameState: g.gameState ?? '',
    }))
  } catch {
    return out
  }
  for (const i of candidates) {
    const since = new Date(i.changedAt).getTime()
    const startedSince = games.some(g =>
      !!i.teamCode && (g.awayAbbrev === i.teamCode || g.homeAbbrev === i.teamCode) &&
      isGameStarted(g, nowMs) &&
      !!g.startTimeUTC && new Date(g.startTimeUTC).getTime() >= since,
    )
    if (!startedSince) out.add(i.playerId)
  }
  return out
}

function todayETOf(d: Date): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

// Heure d'effet d'une soumission passée dont on n'a pas calculé l'heure sur le moment (demandes
// de LTIR antérieures au 2026-11-10, David) : l'état en direct des matchs n'est plus connu, on se
// fie à l'heure PRÉVUE. Un match d'un joueur touché prévu avant la soumission, le même jour (heure
// de l'Est) → lendemain 8 h (T12:00:00Z), comme computeBatchEffectiveDate ; sinon l'heure de la
// soumission. Horaire indisponible → l'heure de la soumission.
export async function effectiveAtForPastSubmission(playerIds: number[], submittedAt: string): Promise<BatchEffectiveDate> {
  const submittedMs = new Date(submittedAt).getTime()
  const fallback = { effectiveAt: new Date(submittedMs).toISOString(), deferred: false }
  try {
    const uniqueIds = Array.from(new Set(playerIds)).filter(id => id > 0)
    if (uniqueIds.length === 0) return fallback
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: players } = await supabase.from('players').select('id, teams(code)').in('id', uniqueIds) as { data: any[] | null }
    const teamCodes = new Set(
      (players ?? []).map(p => p.teams?.code as string | undefined).filter((c): c is string => !!c),
    )
    if (teamCodes.size === 0) return fallback
    const day = todayETOf(new Date(submittedMs))
    const games = await fetchTodayGames(day)
    const startedBefore = games.some(g =>
      (teamCodes.has(g.awayAbbrev) || teamCodes.has(g.homeAbbrev))
      && !!g.startTimeUTC && new Date(g.startTimeUTC).getTime() <= submittedMs,
    )
    return startedBefore ? { effectiveAt: `${addDaysET(day, 1)}T12:00:00Z`, deferred: true } : fallback
  } catch {
    return fallback
  }
}
