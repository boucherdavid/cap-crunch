// Stats AHL — HockeyTech/LeagueStat (même fournisseur que theahl.com), client_code=ahl.
// Clé publique trouvée dans les appels réseau de theahl.com/stats (David, 2026-09-17) —
// aucune clé API "secrète" côté HockeyTech, visible par n'importe quel visiteur du site.
const AHL_KEY = 'ccb91f29d6744675'
const AHL_CLIENT = 'ahl'
const AHL_SITE_ID = '3'
const AHL_LEAGUE_ID = '4'
const BASE = 'https://lscluster.hockeytech.com/feed/index.php'

/** Les réponses HockeyTech sont enveloppées dans des parenthèses même avec fmt=json */
function parseHockeyTechJson<T>(text: string): T {
  const t = text.trim()
  return JSON.parse(t.startsWith('(') && t.endsWith(')') ? t.slice(1, -1) : t)
}

export type AhlSkater = {
  id: number
  name: string
  teamCode: string
  position: string
  rookie: boolean
  gamesPlayed: number
  goals: number
  assists: number
  points: number
  plusMinus: number
  penaltyMinutes: number
}

export type AhlGoalie = {
  id: number
  name: string
  teamCode: string
  rookie: boolean
  gamesPlayed: number
  wins: number
  losses: number
  otLosses: number
  shutouts: number
  savePct: number
  gaa: number
}

type HockeyTechRow = { row: Record<string, string> }

async function fetchPlayers(season: string, position: 'skaters' | 'goalies'): Promise<HockeyTechRow[]> {
  const params = new URLSearchParams({
    feed: 'statviewfeed',
    view: 'players',
    season,
    team: 'all',
    position,
    rookies: '0',
    statsType: 'standard',
    rosterstatus: 'undefined',
    site_id: AHL_SITE_ID,
    first: '0',
    limit: '2000',
    sort: position === 'goalies' ? 'goals_against_average' : 'points',
    league_id: AHL_LEAGUE_ID,
    lang: 'en',
    division: '-1',
    conference: '-1',
    qualified: 'all',
    key: AHL_KEY,
    client_code: AHL_CLIENT,
    fmt: 'json',
  })
  const res = await fetch(`${BASE}?${params}`, { next: { revalidate: 3600 } })
  if (!res.ok) return []
  const data = parseHockeyTechJson<Array<{ sections?: Array<{ data?: HockeyTechRow[] }> }>>(await res.text())
  return data[0]?.sections?.[0]?.data ?? []
}

export async function fetchAhlSkaters(season: string): Promise<AhlSkater[]> {
  try {
    const rows = await fetchPlayers(season, 'skaters')
    return rows
      .map(({ row: r }) => ({
        id: Number(r.player_id),
        name: r.name ?? '',
        teamCode: r.team_code ?? '',
        position: r.position ?? '',
        rookie: r.rookie === '1',
        gamesPlayed: Number(r.games_played ?? 0),
        goals: Number(r.goals ?? 0),
        assists: Number(r.assists ?? 0),
        points: Number(r.points ?? 0),
        plusMinus: Number(r.plus_minus ?? 0),
        penaltyMinutes: Number(r.penalty_minutes ?? 0),
      }))
      .sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export async function fetchAhlGoalies(season: string): Promise<AhlGoalie[]> {
  try {
    const rows = await fetchPlayers(season, 'goalies')
    return rows
      .map(({ row: r }) => ({
        id: Number(r.player_id),
        name: r.name ?? '',
        teamCode: r.team_code ?? '',
        rookie: r.rookie === '1',
        gamesPlayed: Number(r.games_played ?? 0),
        wins: Number(r.wins ?? 0),
        losses: Number(r.losses ?? 0),
        otLosses: Number(r.ot_losses ?? 0),
        shutouts: Number(r.shutouts ?? 0),
        savePct: Number(r.save_percentage ?? 0),
        gaa: Number(r.goals_against_average ?? 0),
      }))
      .sort((a, b) => b.wins - a.wins || b.shutouts - a.shutouts || a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export type AhlSeasonInfo = { id: string; name: string }

/** Saisons régulières AHL (exclut pré-saison/séries/all-star), plus récente en premier */
export async function fetchAhlRegularSeasons(): Promise<AhlSeasonInfo[]> {
  try {
    const params = new URLSearchParams({
      feed: 'statviewfeed',
      view: 'bootstrap',
      season: '',
      game_id: 'null',
      pageName: 'player-stats',
      key: AHL_KEY,
      client_code: AHL_CLIENT,
      site_id: AHL_SITE_ID,
      league_id: AHL_LEAGUE_ID,
      lang: 'en',
      fmt: 'json',
    })
    const res = await fetch(`${BASE}?${params}`, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const data = parseHockeyTechJson<{ seasons: Array<{ id: string; name: string }> }>(await res.text())
    return (data.seasons ?? [])
      .filter(s => /Regular Season/i.test(s.name))
      .map(s => ({ id: String(s.id), name: String(s.name) }))
  } catch {
    return []
  }
}
