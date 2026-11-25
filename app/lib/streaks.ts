import { NHL_SEASON } from './nhl-stats'

export type BadgeType =
  | 'en_feu'
  | 'en_forme'
  | 'en_panne'
  | 'en_crise'
  | 'en_hausse'
  | 'en_baisse'
  | null

export type GoalieBadgeType =
  | 'wins_streak'   // N victoires consécutives (départs)
  | 'sv_elite'      // % arrêts récent ≥ seuil
  | 'gaa_basse'     // GAA récente ≤ seuil
  | null

export type StreakInfo = {
  badge: BadgeType
  count: number    // matchs consécutifs dans la séquence chaude ou froide
  tendance: number // pts/match récents − pts/match précédents (positif = hausse)
  goalieBadge?: GoalieBadgeType  // badge spécifique gardien (uniquement si isGoalie)
  goalieValue?: number           // valeur associée (sv% en %, GAA, ou nb victoires)
}

export type IndicatorConfig = {
  streakChaud: number      // min matchs consécutifs avec pts pour EN FEU
  streakForme: number      // min matchs consécutifs avec pts pour EN FORME
  streakFroid: number      // min matchs consécutifs sans pts pour EN PANNE
  streakCrise: number      // min matchs consécutifs sans pts pour EN CRISE
  fenetreTendance: number  // taille fenêtre pour le calcul de tendance
  // Indicateurs spécifiques gardiens
  goalieWinsStreak: number        // min victoires consécutives (départs)
  goalieSvPctThreshold: number    // sv% moyen minimum (0.0–1.0), ex : 0.930
  goalieGaaThreshold: number      // GAA maximale, ex : 2.50
  goalieMinGames: number          // min matchs (départs) dans la fenêtre sv%/GAA
}

export const DEFAULT_INDICATOR_CONFIG: IndicatorConfig = {
  streakChaud: 3,
  streakForme: 2,
  streakFroid: 5,
  streakCrise: 8,
  fenetreTendance: 5,
  goalieWinsStreak: 3,
  goalieSvPctThreshold: 0.930,
  goalieGaaThreshold: 2.50,
  goalieMinGames: 3,
}

async function fetchGameLog(nhlId: number, gameType: 2 | 3, nhlSeason = NHL_SEASON): Promise<unknown[]> {
  try {
    const res = await fetch(
      `https://api-web.nhle.com/v1/player/${nhlId}/game-log/${nhlSeason}/${gameType}`,
      { next: { revalidate: 1800 } },
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.gameLog ?? []
  } catch {
    return []
  }
}

/**
 * Matchs du plus récent au plus ancien, triés par date. L'API de la LNH donne déjà le plus récent
 * en premier : l'ancien `.reverse()` faisait partir les séquences du premier match de la saison
 * (2026-11-25 — Logan Thompson « en feu » sur ses 3 premières victoires, 2 défaites de suite).
 */
function newestFirst(log: unknown[]): Record<string, unknown>[] {
  return (log as Record<string, unknown>[])
    .slice()
    .sort((a, b) => String(b.gameDate ?? '').localeCompare(String(a.gameDate ?? '')))
}

function gamePts(g: Record<string, unknown>, isGoalie: boolean): number {
  if (isGoalie) {
    const wins     = typeof g.wins === 'number' ? g.wins : (g.decision === 'W' ? 1 : 0)
    const otLosses = typeof g.otLosses === 'number' ? g.otLosses : (g.decision === 'O' ? 1 : 0)
    const shutouts = typeof g.shutouts === 'number' ? g.shutouts : 0
    return wins * 2 + otLosses + shutouts * 2
  }
  return (typeof g.goals === 'number' ? g.goals : 0)
       + (typeof g.assists === 'number' ? g.assists : 0)
}

/** Convertit "MM:SS" en minutes (float). Ex : "63:06" → 63.1 */
function parseTOIMinutes(toi: string): number {
  const parts = toi.split(':')
  const mins = parseInt(parts[0] ?? '0', 10)
  const secs = parseInt(parts[1] ?? '0', 10)
  return mins + secs / 60
}

/**
 * Calcule le badge spécifique gardien (séquence victoires, sv% élevé, GAA basse).
 * N'utilise que les matchs où le gardien était titulaire (gamesStarted === 1).
 * Priorité : wins_streak > sv_elite > gaa_basse
 */
function computeGoalieBadge(
  log: unknown[],
  config: IndicatorConfig,
): { badge: GoalieBadgeType; value?: number } {
  const all = newestFirst(log)
  const started = all.filter(g => g.gamesStarted === 1)

  if (started.length === 0) return { badge: null }

  // 1. Séquence de victoires consécutives (départs uniquement)
  let winsStreak = 0
  for (const g of started) {
    if (g.decision === 'W') winsStreak++
    else break
  }
  if (winsStreak >= config.goalieWinsStreak) {
    return { badge: 'wins_streak', value: winsStreak }
  }

  // Fenêtre récente pour sv% et GAA
  const recent = started.slice(0, config.fenetreTendance)
  if (recent.length < config.goalieMinGames) return { badge: null }

  // 2. Sv% moyen élevé
  const svGames = recent.filter(g => typeof g.savePctg === 'number')
  if (svGames.length >= config.goalieMinGames) {
    const avgSv = svGames.reduce((sum, g) => sum + (g.savePctg as number), 0) / svGames.length
    if (avgSv >= config.goalieSvPctThreshold) {
      // Stocker comme pourcentage (ex : 93.5)
      return { badge: 'sv_elite', value: Math.round(avgSv * 1000) / 10 }
    }
  }

  // 3. GAA basse
  const gaaGames = recent.filter(
    g => typeof g.goalsAgainst === 'number' && typeof g.toi === 'string',
  )
  if (gaaGames.length >= config.goalieMinGames) {
    const totalGA  = gaaGames.reduce((sum, g) => sum + (g.goalsAgainst as number), 0)
    const totalTOI = gaaGames.reduce((sum, g) => sum + parseTOIMinutes(g.toi as string), 0)
    const gaa = totalTOI > 0 ? (totalGA / totalTOI) * 60 : 99
    if (gaa <= config.goalieGaaThreshold) {
      return { badge: 'gaa_basse', value: Math.round(gaa * 100) / 100 }
    }
  }

  return { badge: null }
}

function computeIndicator(
  log: unknown[],
  isGoalie: boolean,
  config: IndicatorConfig,
): StreakInfo {
  const games = newestFirst(log)

  if (games.length === 0) return { badge: null, count: 0, tendance: 0 }

  // Streak
  const firstPts = gamePts(games[0], isGoalie)
  const isHot = firstPts >= 1
  let count = 0
  for (const g of games) {
    const pts = gamePts(g, isGoalie)
    if (isHot && pts >= 1) count++
    else if (!isHot && pts === 0) count++
    else break
  }

  // Tendance : fenêtre récente vs fenêtre précédente
  const { fenetreTendance } = config
  const recent   = games.slice(0, fenetreTendance)
  const previous = games.slice(fenetreTendance, fenetreTendance * 2)
  const avgRecent   = recent.length   > 0 ? recent.reduce((s, g)   => s + gamePts(g, isGoalie), 0) / recent.length   : 0
  const avgPrevious = previous.length > 0 ? previous.reduce((s, g) => s + gamePts(g, isGoalie), 0) / previous.length : 0
  const tendance = previous.length > 0 ? avgRecent - avgPrevious : 0

  // Badge — priorité : streak > tendance
  let badge: BadgeType = null
  if (isHot) {
    if (count >= config.streakChaud)     badge = 'en_feu'
    else if (count >= config.streakForme) badge = 'en_forme'
  } else {
    if (count >= config.streakCrise)     badge = 'en_crise'
    else if (count >= config.streakFroid) badge = 'en_panne'
  }
  if (badge === null) {
    if (tendance >= 0.5)       badge = 'en_hausse'
    else if (tendance <= -0.5) badge = 'en_baisse'
  }

  return { badge, count, tendance }
}

export async function fetchStreak(
  nhlId: number,
  isGoalie: boolean,
  gameType: 2 | 3,
  config: IndicatorConfig = DEFAULT_INDICATOR_CONFIG,
  nhlSeason = NHL_SEASON,
): Promise<StreakInfo> {
  const log = await fetchGameLog(nhlId, gameType, nhlSeason)
  const base = computeIndicator(log, isGoalie, config)
  if (!isGoalie) return base
  const { badge: goalieBadge, value: goalieValue } = computeGoalieBadge(log, config)
  return { ...base, goalieBadge, goalieValue }
}

export async function fetchStreaks(
  players: { nhlId: number | null; isGoalie: boolean }[],
  gameType: 2 | 3,
  config: IndicatorConfig = DEFAULT_INDICATOR_CONFIG,
  batchSize?: number,
  nhlSeason = NHL_SEASON,
): Promise<Map<number, StreakInfo>> {
  const valid = players.filter((p): p is { nhlId: number; isGoalie: boolean } => p.nhlId !== null)

  let results: StreakInfo[]
  if (batchSize && batchSize > 0 && valid.length > batchSize) {
    results = []
    for (let i = 0; i < valid.length; i += batchSize) {
      const batch = valid.slice(i, i + batchSize)
      results.push(...await Promise.all(batch.map(p => fetchStreak(p.nhlId, p.isGoalie, gameType, config, nhlSeason))))
    }
  } else {
    results = await Promise.all(valid.map(p => fetchStreak(p.nhlId, p.isGoalie, gameType, config, nhlSeason)))
  }

  const map = new Map<number, StreakInfo>()
  valid.forEach((p, i) => map.set(p.nhlId, results[i]))
  return map
}
