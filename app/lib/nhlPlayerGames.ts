import { unstable_cache } from 'next/cache'

/**
 * Matchs de saison régulière réellement joués par un joueur selon la LNH, avec l'heure de début
 * (David, 2026-10-18 — vérification des matchs comptés, Journal des activités).
 *
 * Le relevé du joueur (`game-log`) ne donne que la date ; l'heure vient du calendrier de chaque
 * équipe pour laquelle il a joué. Aucune lecture de Supabase. Mis en cache 1 h (les matchs d'un
 * soir n'apparaissent de toute façon qu'après leur fin) — un seul appel à la LNH par joueur et par
 * heure, peu importe le nombre de visites. Indisponible → null, jamais une liste vide.
 */
export type NhlPlayedGame = { gameId: number; gameDate: string; startTimeUTC: string }

type GameLogEntry = { gameId: number; gameDate: string; teamAbbrev: string }
type ScheduleGame = { id: number; startTimeUTC?: string }

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

async function loadPlayedGames(nhlId: number, nhlSeason: number): Promise<NhlPlayedGame[] | null> {
  const log = await fetchJson<{ gameLog?: GameLogEntry[] }>(
    `https://api-web.nhle.com/v1/player/${nhlId}/game-log/${nhlSeason}/2`,
  )
  if (!log) return null
  const entries = log.gameLog ?? []
  const teams = Array.from(new Set(entries.map(e => e.teamAbbrev).filter(Boolean)))
  const startById = new Map<number, string>()
  for (const team of teams) {
    const sched = await fetchJson<{ games?: ScheduleGame[] }>(
      `https://api-web.nhle.com/v1/club-schedule-season/${team}/${nhlSeason}`,
    )
    if (!sched) return null
    for (const g of sched.games ?? []) if (g.startTimeUTC) startById.set(g.id, g.startTimeUTC)
  }
  return entries.map(e => ({
    gameId: e.gameId,
    gameDate: e.gameDate,
    // Repli improbable (match absent du calendrier) : midi UTC de la date du match.
    startTimeUTC: startById.get(e.gameId) ?? `${e.gameDate}T12:00:00Z`,
  }))
}

const cachedPlayedGames = unstable_cache(
  async (nhlId: number, nhlSeason: number) => {
    const games = await loadPlayedGames(nhlId, nhlSeason)
    // unstable_cache garde aussi null : on lève pour ne jamais mettre un échec en cache.
    if (!games) throw new Error('LNH indisponible')
    return games
  },
  ['nhl-played-games'],
  { revalidate: 3600 },
)

export async function getNhlPlayedGames(nhlId: number, nhlSeason: number): Promise<NhlPlayedGame[] | null> {
  try {
    return await cachedPlayedGames(nhlId, nhlSeason)
  } catch {
    return null
  }
}

/** '2026-27' → 20262027 */
export function poolSeasonToNhl(season: string): number {
  const start = Number(season.slice(0, 4))
  return start * 10000 + start + 1
}
