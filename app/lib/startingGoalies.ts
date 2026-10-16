/**
 * Gardiens partants de la soirée (David, 2026-10-16) — page /statistiques/gardiens-partants et
 * carte « Gardiens du pool ce soir » de l'accueil.
 *
 * Deux sources lues au moment de l'affichage, rien n'est écrit en base :
 * - Daily Faceoff (`/starting-goalies/<date>`) : JSON `__NEXT_DATA__` de la page, statut
 *   Confirmed / Likely / Unconfirmed et source de la nouvelle. Pas d'identifiant LNH : le gardien
 *   est jumelé par le nom (puis par le nom de famille, s'il est unique dans son équipe).
 * - Goaliepost (DobberHockey) : données du rendu Next.js (`self.__next_f.push`), gardien prévu
 *   avec son identifiant LNH (`externalId`), niveau de certitude, arrêts projetés, back-to-back.
 *   Les matchs sont jumelés au calendrier de la LNH par leur numéro de match.
 *
 * Chaque source est mise en cache 10 minutes ; une lecture ratée n'est jamais mise en cache et
 * la page affiche alors ce que l'autre source donne, ou « Non disponible ».
 */

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDataVersion } from '@/lib/dataVersion'
import { normName } from '@/lib/nhl-stats'

const NHL_WEB = 'https://api-web.nhle.com'
const DFO_URL = 'https://www.dailyfaceoff.com/starting-goalies'
const GOALIEPOST_URL = 'https://goaliepost.com/'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}
const SOURCE_TTL = 600

export type GoalieStatus = 'confirme' | 'probable' | 'incertain'

export type SourceGoalie = {
  name: string
  nhlId: number | null
  status: GoalieStatus
  /** Libellé d'origine de la source (« Confirmed », « PROBABLE »…). */
  label: string | null
}

export type DfoGoalie = SourceGoalie & { newsSource: string | null; newsUrl: string | null }
export type GoaliepostGoalie = SourceGoalie & { projectedSaves: number | null; backToBack: boolean }

export type GoalieOwner = { poolerId: string; poolerName: string; playerType: string }

export type Verdict = GoalieStatus | 'desaccord' | 'non_disponible'

export type GoalieSide = {
  teamAbbrev: string
  teamName: string
  dfo: DfoGoalie | null
  goaliepost: GoaliepostGoalie | null
  /** Gardien retenu (null en cas de désaccord ou sans source). */
  goalie: { name: string; nhlId: number | null } | null
  verdict: Verdict
  /** Propriétaire dans le pool, par nhl_id (gardien retenu, ou chacun des deux en désaccord). */
  owners: Record<number, GoalieOwner>
}

export type StartingGoaliesGame = {
  gameId: number
  startUTC: string
  state: string
  away: GoalieSide
  home: GoalieSide
}

export type StartingGoalies = {
  date: string
  games: StartingGoaliesGame[]
  sources: { dailyFaceoff: boolean; goaliepost: boolean }
  /** Calendrier de la LNH illisible : on ne sait pas quels matchs ont lieu. */
  error: boolean
}

// ---------- date et calendrier ----------

/** Date de la soirée en heure de l'Est (même règle que le pointage en direct : jusqu'à 6 h, la
 * soirée d'avant). */
function eveningDateET(): string {
  return new Date(Date.now() - 6 * 3600_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

type ScheduleGame = {
  id: number; startUTC: string; state: string
  away: { abbrev: string; name: string; common: string }
  home: { abbrev: string; name: string; common: string }
}

async function fetchSchedule(date: string): Promise<ScheduleGame[] | null> {
  try {
    const res = await fetch(`${NHL_WEB}/v1/schedule/${date}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const day = (data.gameWeek ?? []).find((d: any) => d.date === date)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const team = (t: any) => ({
      abbrev: t?.abbrev ?? '',
      name: `${t?.placeName?.default ?? ''} ${t?.commonName?.default ?? ''}`.trim(),
      common: t?.commonName?.default ?? '',
    })
    return (day?.games ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((g: any) => [2, 3].includes(Number(g.gameType)))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((g: any) => ({ id: Number(g.id), startUTC: g.startTimeUTC, state: g.gameState, away: team(g.awayTeam), home: team(g.homeTeam) }))
  } catch {
    return null
  }
}

// ---------- Daily Faceoff ----------

type DfoSide = { teamName: string; goalieName: string; label: string | null; newsSource: string | null; newsUrl: string | null }
type DfoGame = { away: DfoSide; home: DfoSide }

function dfoStatus(label: string | null): GoalieStatus {
  const l = (label ?? '').toLowerCase()
  if (l.startsWith('confirm')) return 'confirme'
  if (l === 'likely' || l === 'expected' || l === 'probable') return 'probable'
  return 'incertain'
}

/** Lève une erreur si la page n'est pas lisible — jamais mis en cache dans ce cas. */
const fetchDfo = unstable_cache(async (date: string): Promise<DfoGame[]> => {
  const res = await fetch(`${DFO_URL}/${date}`, { headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Daily Faceoff : HTTP ${res.status}`)
  const html = await res.text()
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) throw new Error('Daily Faceoff : __NEXT_DATA__ introuvable')
  const rows = JSON.parse(m[1])?.props?.pageProps?.data
  if (!Array.isArray(rows)) throw new Error('Daily Faceoff : données absentes')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const side = (g: any, p: 'home' | 'away'): DfoSide => ({
    teamName: g[`${p}TeamName`] ?? '',
    goalieName: g[`${p}GoalieName`] ?? '',
    label: g[`${p}NewsStrengthName`] ?? null,
    newsSource: g[`${p}NewsSourceName`] ?? null,
    newsUrl: g[`${p}NewsSourceUrl`] ?? null,
  })
  return rows.map(g => ({ away: side(g, 'away'), home: side(g, 'home') }))
}, ['starting-goalies-dfo-v1'], { revalidate: SOURCE_TTL })

// ---------- Goaliepost ----------

type GpSide = { teamAbbrev: string; name: string; nhlId: number | null; label: string | null; projectedSaves: number | null; backToBack: boolean }
type GpGame = { gameId: number; away: GpSide | null; home: GpSide | null }

function gpStatus(label: string | null): GoalieStatus {
  const l = (label ?? '').toUpperCase()
  if (l === 'CONFIRMED') return 'confirme'
  if (['PROBABLE', 'LIKELY', 'EXPECTED', 'PROJECTED'].includes(l)) return 'probable'
  return 'incertain'
}

/** Texte du rendu Next.js (App Router) : concaténation des chaînes `self.__next_f.push([1,"…"])`. */
function flightText(html: string): string {
  const parts: string[] = []
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try { parts.push(JSON.parse(m[1])) } catch { /* fragment illisible ignoré */ }
  }
  return parts.join('')
}

/** Tableau JSON qui commence à `start` (un « [ »), en tenant compte des chaînes. */
function sliceJsonArray(text: string, start: number): string | null {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '[' || c === '{') depth++
    else if (c === ']' || c === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

const fetchGoaliepost = unstable_cache(async (): Promise<GpGame[]> => {
  const res = await fetch(GOALIEPOST_URL, { headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Goaliepost : HTTP ${res.status}`)
  const text = flightText(await res.text())
  const games = new Map<number, GpGame>()
  for (let i = text.indexOf('"games":['); i >= 0; i = text.indexOf('"games":[', i + 1)) {
    const raw = sliceJsonArray(text, i + '"games":'.length)
    if (!raw) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let list: any[]
    try { list = JSON.parse(raw) } catch { continue }
    for (const g of list) {
      const gameId = Number(g?.externalId)
      if (!gameId || !g?.predictedGoalies) continue
      const side = (p: 'HOME' | 'AWAY'): GpSide | null => {
        const pick = g.predictedGoalies?.[p]?.[0]
        if (!pick?.goalie) return null
        const saves = Number(pick.projectedSaves)
        return {
          teamAbbrev: g.teams?.[p]?.team?.abbreviation ?? '',
          name: pick.goalie.fullName ?? `${pick.goalie.firstName ?? ''} ${pick.goalie.lastName ?? ''}`.trim(),
          nhlId: Number(pick.goalie.externalId) || null,
          label: pick.likeliness ?? null,
          projectedSaves: Number.isFinite(saves) && saves > 0 ? saves : null,
          // Deuxième match en deux soirs : le partant d'hier joue rarement.
          backToBack: g.teams?.[p]?.gameB2BType === 'SECOND',
        }
      }
      games.set(gameId, { gameId, away: side('AWAY'), home: side('HOME') })
    }
  }
  if (games.size === 0 && !text.includes('"games":[')) throw new Error('Goaliepost : données absentes')
  return [...games.values()]
}, ['starting-goalies-goaliepost-v1'], { revalidate: SOURCE_TTL })

// ---------- données du pool ----------

type GoalieRef = { nhlId: number; team: string | null; lastName: string }

/** Gardiens en base, indexés par nom normalisé — pour jumeler Daily Faceoff. Cache 1 h. */
const getGoalieIndex = unstable_cache(async (): Promise<{ byName: Record<string, GoalieRef[]>; all: GoalieRef[] }> => {
  const { data } = await createAdminClient()
    .from('players').select('nhl_id, first_name, last_name, teams(code)')
    .eq('position', 'G').not('nhl_id', 'is', null).order('id')
  const byName: Record<string, GoalieRef[]> = {}
  const all: GoalieRef[] = []
  for (const p of data ?? []) {
    const team = (p.teams as unknown as { code: string } | null)?.code ?? null
    const ref = { nhlId: p.nhl_id as number, team, lastName: normName(p.last_name) }
    all.push(ref)
    ;(byName[normName(`${p.first_name} ${p.last_name}`)] ??= []).push(ref)
  }
  return { byName, all }
}, ['starting-goalies-goalie-index'], { revalidate: 3600 })

/** Propriétaire des gardiens de la saison active (nhl_id → pooler), en cache tant que la
 * version « standings » (alignements) ne bouge pas. */
async function loadGoalieOwners(): Promise<Record<number, GoalieOwner & { team: string | null; name: string }>> {
  const db = createAdminClient()
  const { data: season } = await db.from('pool_seasons').select('id')
    .eq('is_active', true).eq('is_playoff', false).maybeSingle()
  if (!season) return {}
  const { data } = await db.from('pooler_rosters')
    .select('pooler_id, player_type, poolers(name), players!inner(nhl_id, first_name, last_name, position, teams(code))')
    .eq('pool_season_id', season.id).eq('is_active', true).eq('players.position', 'G')
  const out: Record<number, GoalieOwner & { team: string | null; name: string }> = {}
  for (const r of data ?? []) {
    const p = r.players as unknown as { nhl_id: number | null; first_name: string; last_name: string; teams: { code: string } | null } | null
    if (!p?.nhl_id) continue
    out[p.nhl_id] = {
      poolerId: r.pooler_id as string,
      poolerName: (r.poolers as unknown as { name: string } | null)?.name ?? '?',
      playerType: r.player_type as string,
      team: p.teams?.code ?? null,
      name: `${p.first_name} ${p.last_name}`,
    }
  }
  return out
}

const cachedGoalieOwners = unstable_cache(
  async (_version: number) => loadGoalieOwners(),
  ['starting-goalies-owners-v1'],
  { revalidate: 3600 },
)

export async function getGoalieOwners() {
  try {
    const version = await getDataVersion('standings')
    return version === null ? await loadGoalieOwners() : await cachedGoalieOwners(version)
  } catch {
    return {}
  }
}

// ---------- croisement ----------

function matchDfoGoalie(name: string, team: string, index: { byName: Record<string, GoalieRef[]>; all: GoalieRef[] }): number | null {
  const exact = index.byName[normName(name)] ?? []
  if (exact.length === 1) return exact[0].nhlId
  const sameTeam = exact.filter(r => r.team === team)
  if (sameTeam.length === 1) return sameTeam[0].nhlId
  // Repli : nom de famille unique dans l'équipe (« Matt »/« Matthew »…).
  const last = normName(name.split(' ').slice(1).join(' '))
  const byLast = index.all.filter(r => r.team === team && r.lastName === last)
  return byLast.length === 1 ? byLast[0].nhlId : null
}

function sameGoalie(a: SourceGoalie, b: SourceGoalie): boolean {
  if (a.nhlId && b.nhlId) return a.nhlId === b.nhlId
  return normName(a.name) === normName(b.name)
}

const RANK: Record<GoalieStatus, number> = { confirme: 2, probable: 1, incertain: 0 }

function buildSide(
  team: ScheduleGame['home'],
  dfo: DfoGoalie | null,
  gp: GoaliepostGoalie | null,
  owners: Record<number, GoalieOwner>,
): GoalieSide {
  let goalie: GoalieSide['goalie'] = null
  let verdict: Verdict = 'non_disponible'
  if (dfo && gp) {
    if (sameGoalie(dfo, gp)) {
      goalie = { name: gp.name, nhlId: gp.nhlId ?? dfo.nhlId }
      verdict = RANK[dfo.status] >= RANK[gp.status] ? dfo.status : gp.status
    } else {
      verdict = 'desaccord'
    }
  } else if (dfo || gp) {
    const only = (dfo ?? gp)!
    goalie = { name: only.name, nhlId: only.nhlId }
    verdict = only.status
  }
  const sideOwners: Record<number, GoalieOwner> = {}
  for (const id of [goalie?.nhlId, dfo?.nhlId, gp?.nhlId]) {
    if (id && owners[id]) {
      const { poolerId, poolerName, playerType } = owners[id]
      sideOwners[id] = { poolerId, poolerName, playerType }
    }
  }
  return { teamAbbrev: team.abbrev, teamName: team.name, dfo, goaliepost: gp, goalie, verdict, owners: sideOwners }
}

function dfoMatches(dfoTeam: string, team: ScheduleGame['home']): boolean {
  const n = normName(dfoTeam)
  return n === normName(team.name) || (!!team.common && n.endsWith(normName(team.common)))
}

export async function getStartingGoalies(): Promise<StartingGoalies> {
  const date = eveningDateET()
  const [schedule, dfoGames, gpGames, index, owners] = await Promise.all([
    fetchSchedule(date),
    fetchDfo(date).catch(() => null),
    fetchGoaliepost().catch(() => null),
    getGoalieIndex().catch(() => ({ byName: {}, all: [] })),
    getGoalieOwners(),
  ])
  const sources = { dailyFaceoff: dfoGames !== null, goaliepost: gpGames !== null }
  if (!schedule) return { date, games: [], sources, error: true }

  const gpById = new Map((gpGames ?? []).map(g => [g.gameId, g]))
  const games = schedule.map(g => {
    const dfoGame = (dfoGames ?? []).find(d => dfoMatches(d.home.teamName, g.home) && dfoMatches(d.away.teamName, g.away))
    const gpGame = gpById.get(g.id)
    const dfoSide = (s: DfoSide | undefined, team: string): DfoGoalie | null =>
      s?.goalieName
        ? { name: s.goalieName, nhlId: matchDfoGoalie(s.goalieName, team, index), status: dfoStatus(s.label), label: s.label, newsSource: s.newsSource, newsUrl: s.newsUrl }
        : null
    const gpSide = (s: GpSide | null | undefined): GoaliepostGoalie | null =>
      s?.name ? { name: s.name, nhlId: s.nhlId, status: gpStatus(s.label), label: s.label, projectedSaves: s.projectedSaves, backToBack: s.backToBack } : null
    return {
      gameId: g.id,
      startUTC: g.startUTC,
      state: g.state,
      away: buildSide(g.away, dfoSide(dfoGame?.away, g.away.abbrev), gpSide(gpGame?.away), owners),
      home: buildSide(g.home, dfoSide(dfoGame?.home, g.home.abbrev), gpSide(gpGame?.home), owners),
    }
  })
  return { date, games, sources, error: false }
}

/** Gardiens du pool (actifs et réservistes) dont l'équipe joue ce soir, avec leur situation. */
export type PoolGoalieTonight = {
  nhlId: number
  name: string
  team: string
  opponent: string
  home: boolean
  startUTC: string
  owner: GoalieOwner
  /** partant (avec son statut), auxiliaire (un autre gardien est prévu), désaccord ou inconnu. */
  situation: GoalieStatus | 'auxiliaire' | 'desaccord' | 'non_disponible'
}

export async function getPoolGoaliesTonight(): Promise<{ items: PoolGoalieTonight[]; data: StartingGoalies }> {
  const [data, owners] = await Promise.all([getStartingGoalies(), getGoalieOwners()])
  const items: PoolGoalieTonight[] = []
  for (const g of data.games) {
    for (const [side, other, home] of [[g.home, g.away, true], [g.away, g.home, false]] as const) {
      for (const [idStr, o] of Object.entries(owners)) {
        if (o.team !== side.teamAbbrev || !['actif', 'reserviste'].includes(o.playerType)) continue
        const nhlId = Number(idStr)
        let situation: PoolGoalieTonight['situation']
        if (side.verdict === 'non_disponible') situation = 'non_disponible'
        else if (side.verdict === 'desaccord') {
          const named = side.dfo?.nhlId === nhlId || side.goaliepost?.nhlId === nhlId
          situation = named ? 'desaccord' : 'auxiliaire'
        } else situation = side.goalie?.nhlId === nhlId ? side.verdict : 'auxiliaire'
        items.push({
          nhlId, name: o.name, team: side.teamAbbrev, opponent: other.teamAbbrev, home, startUTC: g.startUTC,
          owner: { poolerId: o.poolerId, poolerName: o.poolerName, playerType: o.playerType },
          situation,
        })
      }
    }
  }
  const order: Record<PoolGoalieTonight['situation'], number> = { confirme: 0, probable: 1, incertain: 2, desaccord: 3, non_disponible: 4, auxiliaire: 5 }
  items.sort((a, b) => order[a.situation] - order[b.situation] || a.startUTC.localeCompare(b.startUTC) || a.name.localeCompare(b.name))
  return { items, data }
}
