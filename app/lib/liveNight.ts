/**
 * Pointage en direct de la soirée (David, 2026-10-04) — « non officiel ».
 *
 * Lit les feuilles de match de la LNH (boxscore) des matchs de la soirée et y applique notre
 * barème (`scoring_config`). Rien n'est écrit en base : les points officiels restent ceux de
 * `player_game_logs`, importés chaque nuit (`import_regular_stats.py`, ~2 h ET).
 *
 * Soirée = date ET de (maintenant − 6 h) : un match commencé à 22 h 30 reste « ce soir » jusqu'à
 * 6 h du matin. Tant qu'aucun match de la soirée n'est commencé, on montre la soirée d'avant.
 *
 * Charge : tout le calcul est mis en cache 45 s côté serveur (`unstable_cache`, sans cookies —
 * client admin), peu importe le nombre de poolers connectés. Si la LNH ne répond pas, `error`
 * est vrai et les poolers ne voient pas de zéros trompeurs (leçon du pool des séries 2026).
 */

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

const NHL_WEB = 'https://api-web.nhle.com'
const NIGHT_ROLLOVER_HOURS = 6

export type LiveGame = {
  id: number
  away: string
  home: string
  awayScore: number | null
  homeScore: number | null
  state: string           // FUT, PRE, LIVE, CRIT, FINAL, OFF
  startTimeUTC: string
  label: string           // « 2e · 12:34 », « Fin », « Fin (prol.) », « 19 h 00 »
}

export type LivePlayer = {
  nhlId: number
  name: string
  team: string
  position: string
  goals: number
  assists: number
  wins: number
  otl: number
  shutouts: number
  pts: number              // selon notre barème
  played: boolean          // présent sur la feuille d'un match commencé
  gameLabel: string
  ownerId: string | null
  ownerName: string | null
  ownerType: string | null // actif, reserviste, recrue, ltir
}

export type LivePooler = {
  poolerId: string
  name: string
  pj: number               // joueurs actifs ayant joué ce soir
  pts: number
  players: LivePlayer[]    // joueurs actifs dont l'équipe joue ce soir
}

export type LiveNight = {
  date: string             // YYYY-MM-DD (ET)
  isLive: boolean          // au moins un match en cours
  allFinal: boolean
  games: LiveGame[]
  poolers: LivePooler[]
  scorers: LivePlayer[]    // tous les pointeurs de la LNH, triés par points
  error: boolean
  updatedAt: string
}

const STARTED = new Set(['LIVE', 'CRIT', 'FINAL', 'OFF'])
const FINISHED = new Set(['FINAL', 'OFF'])

function etDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

function previousDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function fmtStart(utc: string): string {
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(utc)).replace(':', ' h ')
  } catch { return '' }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gameLabel(state: string, startTimeUTC: string, period: any, clock: any): string {
  if (FINISHED.has(state)) {
    const type = period?.periodType
    return type === 'OT' ? 'Fin (prol.)' : type === 'SO' ? 'Fin (t.b.)' : 'Fin'
  }
  if (state === 'LIVE' || state === 'CRIT') {
    if (!period?.number) return 'En cours'
    const name = period.periodType === 'OT' ? 'Prol.' : period.periodType === 'SO' ? 'T.b.' : `${period.number}e`
    if (clock?.inIntermission) return `Entracte (${name})`
    return clock?.timeRemaining ? `${name} · ${clock.timeRemaining}` : name
  }
  return fmtStart(startTimeUTC)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJson(url: string, revalidate: number): Promise<any | null> {
  try {
    const res = await fetch(url, { next: { revalidate } })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchScheduleGames(date: string): Promise<any[] | null> {
  const data = await fetchJson(`${NHL_WEB}/v1/schedule/${date}`, 60)
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const day = (data.gameWeek ?? []).find((d: any) => d.date === date)
  // Saison régulière seulement : un match préparatoire ne compte pas au pool.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (day?.games ?? []).filter((g: any) => Number(g.gameType) === 2)
}

type Owner = { poolerId: string; poolerName: string; type: string; name: string; team: string | null; position: string }

/** nhl_id → « Prénom Nom » de tous les joueurs en base (noms complets pour les pointeurs qui
 * n'appartiennent à personne ; le boxscore ne donne que « V. Gavrikov »). Cache 1 h. */
const getPlayerNames = unstable_cache(async (): Promise<Record<number, string>> => {
  const db = createAdminClient()
  const names: Record<number, string> = {}
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db.from('players').select('id, nhl_id, first_name, last_name')
      .not('nhl_id', 'is', null).order('id').range(offset, offset + 999)
    for (const p of data ?? []) names[p.nhl_id as number] = `${p.first_name} ${p.last_name}`
    if (!data || data.length < 1000) break
  }
  return names
}, ['live-night-player-names'], { revalidate: 3600 })

async function loadPoolContext() {
  const db = createAdminClient()
  const { data: season } = await db
    .from('pool_seasons').select('id').eq('is_active', true).eq('is_playoff', false).maybeSingle()
  const [{ data: poolers }, { data: rosters }, { data: scoringRows }, playerNames] = await Promise.all([
    db.from('poolers').select('id, name').order('name'),
    season
      ? db.from('pooler_rosters')
          .select('pooler_id, player_type, players(nhl_id, first_name, last_name, position, teams(code))')
          .eq('pool_season_id', season.id)
          .is('removed_at', null)
      : Promise.resolve({ data: [] }),
    db.from('scoring_config').select('stat_key, points').in('scope', ['regular', 'both']),
    getPlayerNames(),
  ])
  const scoring: Record<string, number> = {}
  for (const r of scoringRows ?? []) scoring[r.stat_key] = Number(r.points)
  const names = new Map((poolers ?? []).map(p => [p.id as string, p.name as string]))
  const owners = new Map<number, Owner>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (rosters ?? []) as any[]) {
    const p = r.players
    if (!p?.nhl_id) continue
    owners.set(p.nhl_id, {
      poolerId: r.pooler_id,
      poolerName: names.get(r.pooler_id) ?? '?',
      type: r.player_type,
      name: `${p.first_name} ${p.last_name}`,
      team: p.teams?.code ?? null,
      position: p.position ?? '',
    })
  }
  return {
    poolers: (poolers ?? []) as { id: string; name: string }[],
    owners,
    playerNames,
    pts: {
      goal: scoring.goal ?? 1,
      assist: scoring.assist ?? 1,
      win: scoring.goalie_win ?? 2,
      otl: scoring.goalie_otl ?? 1,
      shutout: scoring.goalie_shutout ?? 2,
    },
  }
}

async function computeLiveNight(): Promise<LiveNight> {
  const updatedAt = new Date().toISOString()
  let date = etDate(new Date(Date.now() - NIGHT_ROLLOVER_HOURS * 3600_000))
  let schedule = await fetchScheduleGames(date)
  if (schedule && !schedule.some(g => STARTED.has(g.gameState))) {
    const prev = previousDate(date)
    const prevSchedule = await fetchScheduleGames(prev)
    if (prevSchedule && prevSchedule.length > 0) { date = prev; schedule = prevSchedule }
  }
  const empty = { date, isLive: false, allFinal: false, games: [], poolers: [], scorers: [], updatedAt }
  if (!schedule) return { ...empty, error: true }

  const ctx = await loadPoolContext()
  const games: LiveGame[] = []
  const stats = new Map<number, LivePlayer>()
  let error = false

  await Promise.all(schedule.map(async g => {
    const state: string = g.gameState ?? 'FUT'
    const game: LiveGame = {
      id: g.id,
      away: g.awayTeam?.abbrev ?? '',
      home: g.homeTeam?.abbrev ?? '',
      awayScore: g.awayTeam?.score ?? null,
      homeScore: g.homeTeam?.score ?? null,
      state,
      startTimeUTC: g.startTimeUTC ?? '',
      label: gameLabel(state, g.startTimeUTC ?? '', g.periodDescriptor, null),
    }
    games.push(game)
    if (!STARTED.has(state)) return

    // Match terminé : feuille définitive, cache plus long ; en cours : 30 s.
    const box = await fetchJson(`${NHL_WEB}/v1/gamecenter/${g.id}/boxscore`, FINISHED.has(state) ? 600 : 30)
    if (!box) { error = true; return }
    game.state = box.gameState ?? state
    game.awayScore = box.awayTeam?.score ?? game.awayScore
    game.homeScore = box.homeTeam?.score ?? game.homeScore
    game.label = gameLabel(game.state, game.startTimeUTC, box.periodDescriptor, box.clock)
    const final = FINISHED.has(game.state)

    for (const side of ['awayTeam', 'homeTeam'] as const) {
      const team: string = box[side]?.abbrev ?? ''
      const sideStats = box.playerByGameStats?.[side] ?? {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const skaters = [...(sideStats.forwards ?? []), ...(sideStats.defense ?? [])] as any[]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const goalies = (sideStats.goalies ?? []) as any[]
      for (const p of skaters) {
        const goals = Number(p.goals ?? 0)
        const assists = Number(p.assists ?? 0)
        stats.set(p.playerId, makePlayer(p, team, game.label, ctx, { goals, assists, wins: 0, otl: 0, shutouts: 0 }))
      }
      for (const p of goalies) {
        const toi = String(p.toi ?? '0:00').split(':')
        const toiSecs = Number(toi[0] ?? 0) * 60 + Number(toi[1] ?? 0)
        // Victoire/défaite seulement une fois la décision connue ; blanchissage seulement à la
        // fin du match (même règle que import_regular_stats.py). Buts/passes d'un gardien :
        // absents du boxscore, ignorés ici (rarissimes, corrigés par l'import de nuit).
        const wins = p.decision === 'W' ? 1 : 0
        const otl = p.decision === 'O' ? 1 : 0
        const shutouts = final && Number(p.goalsAgainst ?? 0) === 0 && p.decision && toiSecs >= 3600 ? 1 : 0
        stats.set(p.playerId, makePlayer(p, team, game.label, ctx, { goals: 0, assists: 0, wins, otl, shutouts }))
      }
    }
  }))

  games.sort((a, b) => a.startTimeUTC.localeCompare(b.startTimeUTC) || a.id - b.id)
  const labelByTeam = new Map<string, string>()
  for (const g of games) { labelByTeam.set(g.away, g.label); labelByTeam.set(g.home, g.label) }

  // Par pooler : ses joueurs ACTIFS dont l'équipe joue ce soir (même ceux pas encore en jeu).
  const poolerMap = new Map<string, LivePooler>(
    ctx.poolers.map(p => [p.id, { poolerId: p.id, name: p.name, pj: 0, pts: 0, players: [] }]),
  )
  for (const [nhlId, owner] of ctx.owners) {
    if (owner.type !== 'actif') continue
    const live = stats.get(nhlId)
    const team = live?.team ?? owner.team ?? ''
    if (!live && !labelByTeam.has(team)) continue
    const pooler = poolerMap.get(owner.poolerId)
    if (!pooler) continue
    const player = live ?? {
      nhlId, name: owner.name, team, position: owner.position,
      goals: 0, assists: 0, wins: 0, otl: 0, shutouts: 0, pts: 0, played: false,
      gameLabel: labelByTeam.get(team) ?? '',
      ownerId: owner.poolerId, ownerName: owner.poolerName, ownerType: owner.type,
    }
    pooler.players.push(player)
    if (player.played) { pooler.pj++; pooler.pts += player.pts }
  }
  const poolers = [...poolerMap.values()]
  for (const p of poolers) p.players.sort((a, b) => b.pts - a.pts || Number(b.played) - Number(a.played) || a.name.localeCompare(b.name))
  poolers.sort((a, b) => b.pts - a.pts || b.pj - a.pj || a.name.localeCompare(b.name))

  const scorers = [...stats.values()]
    .filter(p => p.pts > 0 || p.goals > 0 || p.assists > 0)
    .sort((a, b) => b.pts - a.pts || b.goals - a.goals || a.name.localeCompare(b.name))

  return {
    date,
    isLive: games.some(g => g.state === 'LIVE' || g.state === 'CRIT'),
    allFinal: games.length > 0 && games.every(g => FINISHED.has(g.state)),
    games, poolers, scorers, error, updatedAt,
  }
}

function makePlayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  p: any, team: string, label: string, ctx: Awaited<ReturnType<typeof loadPoolContext>>,
  s: { goals: number; assists: number; wins: number; otl: number; shutouts: number },
): LivePlayer {
  const owner = ctx.owners.get(p.playerId)
  return {
    nhlId: p.playerId,
    name: owner?.name ?? ctx.playerNames[p.playerId] ?? p.name?.default ?? '?',
    team,
    position: p.position ?? owner?.position ?? '',
    ...s,
    pts: s.goals * ctx.pts.goal + s.assists * ctx.pts.assist + s.wins * ctx.pts.win
      + s.otl * ctx.pts.otl + s.shutouts * ctx.pts.shutout,
    played: true,
    gameLabel: label,
    ownerId: owner?.poolerId ?? null,
    ownerName: owner?.poolerName ?? null,
    ownerType: owner?.type ?? null,
  }
}

export const getLiveNight = unstable_cache(computeLiveNight, ['live-night-v1'], { revalidate: 45 })
