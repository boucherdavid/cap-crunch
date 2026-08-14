import { createAdminClient } from '@/lib/supabase/admin'

export type PeriodContrib = {
  goals: number
  assists: number
  goalie_wins: number
  goalie_otl: number
  goalie_shutouts: number
  gamesPlayed: number
  points: number
  addedAt: string        // ISO — début de la période
  removedAt: string | null  // null = période ouverte (joueur toujours actif)
}

export type PlayerContrib = {
  nhlId: number | null
  firstName: string
  lastName: string
  position: string
  playerType: string
  stillRostered: boolean  // false = a quitté le pooler (échangé/libéré) — playerType reflète son dernier statut, pas son état actuel
  teamAbbrev: string
  gamesPlayed: number
  goals: number
  assists: number
  goalieWins: number
  goalieOtl: number
  goalieShutouts: number
  poolPoints: number
  addedAt: string | null
  periods: PeriodContrib[]  // une entrée par fenêtre d'activation (>1 si trade + re-acquisition)
}

export type PoolerStanding = {
  poolerId: string
  poolerName: string
  totalPoints: number
  players: PlayerContrib[]
}

type StatBlock = {
  goals: number
  assists: number
  goalie_wins: number
  goalie_otl: number
  goalie_shutouts: number
}

type ScoringPts = {
  goal: number
  assist: number
  goalie_win: number
  goalie_otl: number
  goalie_shutout: number
}

function calcPoints(s: StatBlock, pts: ScoringPts): number {
  return (
    s.goals           * pts.goal +
    s.assists         * pts.assist +
    s.goalie_wins     * pts.goalie_win +
    s.goalie_otl      * pts.goalie_otl +
    s.goalie_shutouts * pts.goalie_shutout
  )
}

/** "2025-26" → 20252026 */
function toNhlSeasonInt(season: string): number {
  const startYear = parseInt(season.split('-')[0])
  return startYear * 10000 + (startYear + 1)
}

type GameLogRow = {
  player_id: number
  game_start_time: string
  goals: number
  assists: number
  goalie_wins: number
  goalie_otl: number
  goalie_shutouts: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildStandings(supabase: any, seasonId: string | number): Promise<PoolerStanding[]> {
  const [
    { data: rosterRows },
    { data: scoringRows },
    { data: seasonRow },
  ] = await Promise.all([
    supabase
      .from('pooler_rosters')
      .select('player_type, added_at, removed_at, poolers(id, name), players(id, first_name, last_name, position, nhl_id, teams(code))')
      .eq('pool_season_id', seasonId),
    supabase.from('scoring_config').select('stat_key, points').in('scope', ['regular', 'both']),
    supabase.from('pool_seasons').select('season').eq('id', seasonId).single(),
  ])

  const scoring: Record<string, number> = {}
  for (const r of scoringRows ?? []) scoring[r.stat_key] = Number(r.points)
  const pts: ScoringPts = {
    goal:           scoring.goal           ?? 1,
    assist:         scoring.assist         ?? 1,
    goalie_win:     scoring.goalie_win     ?? 2,
    goalie_otl:     scoring.goalie_otl     ?? 1,
    goalie_shutout: scoring.goalie_shutout ?? 2,
  }

  const nhlSeason = seasonRow?.season ? toNhlSeasonInt(seasonRow.season) : null
  if (!nhlSeason) return []

  // IDs uniques des joueurs dans le pool
  const playerIds = [...new Set(
    (rosterRows ?? []).map((r: any) => r.players?.id).filter(Boolean) as number[]
  )]
  if (playerIds.length === 0) return []

  // Game logs saison régulière — pagination pour dépasser la limite Supabase
  const admin = createAdminClient()
  const PAGE = 1000
  const gameLogRows: GameLogRow[] = []
  let offset = 0
  while (true) {
    const { data: page } = await admin
      .from('player_game_logs')
      .select('player_id, game_start_time, goals, assists, goalie_wins, goalie_otl, goalie_shutouts')
      .in('player_id', playerIds)
      .eq('season', nhlSeason)
      .eq('game_type', 2)
      .range(offset, offset + PAGE - 1)
    if (!page || page.length === 0) break
    gameLogRows.push(...(page as GameLogRow[]))
    if (page.length < PAGE) break
    offset += PAGE
  }

  // Index par player_id
  const logsByPlayer = new Map<number, GameLogRow[]>()
  for (const gl of (gameLogRows ?? []) as GameLogRow[]) {
    if (!logsByPlayer.has(gl.player_id)) logsByPlayer.set(gl.player_id, [])
    logsByPlayer.get(gl.player_id)!.push(gl)
  }

  // Historique des changements de type (actif/réserviste/ltir/recrue) par (pooler, joueur),
  // pour ne compter les points d'une période que pendant les segments où le joueur était
  // réellement actif — un simple changement de player_type (deactivate/activate/type_change)
  // ne crée pas de nouvelle ligne pooler_rosters, donc une période peut couvrir plusieurs
  // statuts successifs.
  const { data: changeLogRows } = await admin
    .from('roster_change_log')
    .select('pooler_id, player_id, changed_at, new_type, old_type')
    .eq('pool_season_id', seasonId)
    .not('new_type', 'is', null)

  const eventsByKey = new Map<string, { changedAt: number; newType: string; oldType: string | null }[]>()
  for (const r of (changeLogRows ?? []) as { pooler_id: string; player_id: number; changed_at: string; new_type: string; old_type: string | null }[]) {
    const key = `${r.pooler_id}::${r.player_id}`
    if (!eventsByKey.has(key)) eventsByKey.set(key, [])
    eventsByKey.get(key)!.push({ changedAt: new Date(r.changed_at).getTime(), newType: r.new_type, oldType: r.old_type })
  }
  for (const events of eventsByKey.values()) events.sort((a, b) => a.changedAt - b.changedAt)

  // Statut du joueur à un instant donné : dernier événement connu avant ce moment,
  // ou `fallback` (player_type de la ligne) si aucun événement ne précède (ex: rosters
  // initiaux en mode init, qui ne journalisent rien).
  // Cas particulier : si le tout premier événement connu (trié par date effective, pas par
  // date de saisie) survient APRÈS l'instant demandé, `fallback` (le player_type courant,
  // donc le plus récent) serait faux — on utilise plutôt le old_type de cet événement, qui
  // représente le statut juste avant que la date effective saisie ne l'écrase. Arrive quand
  // une correction Historique (ex: Changement de type) porte une date antérieure au premier
  // événement réellement journalisé pour ce joueur (ex: son ajout initial en temps réel).
  function statusAt(key: string, timeMs: number, fallback: string): string {
    const events = eventsByKey.get(key)
    if (!events || events.length === 0) return fallback
    if (timeMs < events[0].changedAt) return events[0].oldType ?? fallback
    let result = fallback
    for (const e of events) {
      if (e.changedAt > timeMs) break
      result = e.newType
    }
    return result
  }

  // Découpe une ligne pooler_rosters (added_at→removed_at) en fenêtres "actif" contiguës,
  // pour qu'un joueur réactivé plusieurs fois dans la saison (recrue/réserviste↔actif, sans
  // jamais quitter le pool) affiche une période distincte par fenêtre plutôt qu'une seule
  // période couvrant toute la ligne.
  function activeSegments(
    key: string,
    addedAtMs: number,
    removedAtMs: number | null,
    fallback: string,
  ): { start: number; end: number | null }[] {
    const events = eventsByKey.get(key) ?? []
    const boundarySet = new Set<number>([addedAtMs])
    for (const e of events) {
      if (e.changedAt > addedAtMs && (removedAtMs === null || e.changedAt < removedAtMs)) {
        boundarySet.add(e.changedAt)
      }
    }
    if (removedAtMs !== null) boundarySet.add(removedAtMs)
    const boundaries = Array.from(boundarySet).sort((a, b) => a - b)

    const segments: { start: number; end: number | null }[] = []
    for (let i = 0; i < boundaries.length; i++) {
      const segStart = boundaries[i]
      const segEnd = i + 1 < boundaries.length ? boundaries[i + 1] : removedAtMs
      if (segEnd !== null && segEnd <= segStart) continue
      if (statusAt(key, segStart, fallback) !== 'actif') continue
      const prev = segments[segments.length - 1]
      if (prev && prev.end === segStart) {
        prev.end = segEnd
      } else {
        segments.push({ start: segStart, end: segEnd })
      }
    }
    return segments
  }

  const poolerMap = new Map<string, { name: string; players: PlayerContrib[] }>()

  // Grouper les roster rows par (pooler.id, player.id)
  // Un joueur échangé puis re-acquis a plusieurs rows → plusieurs périodes
  type GroupEntry = {
    pooler: { id: string; name: string }
    player: { id: number; first_name: string; last_name: string; position: string; nhl_id: number | null; teams: { code: string } | null }
    rows: { player_type: string; added_at: string | null; removed_at: string | null }[]
  }
  const groups = new Map<string, GroupEntry>()

  for (const row of (rosterRows ?? []) as any[]) {
    const pooler = row.poolers as { id: string; name: string } | null
    const player = row.players as GroupEntry['player'] | null
    if (!pooler || !player) continue

    if (!poolerMap.has(pooler.id)) poolerMap.set(pooler.id, { name: pooler.name, players: [] })

    const key = `${pooler.id}::${player.id}`
    if (!groups.has(key)) groups.set(key, { pooler, player, rows: [] })
    groups.get(key)!.rows.push({ player_type: row.player_type, added_at: row.added_at, removed_at: row.removed_at })
  }

  for (const { pooler, player, rows } of groups.values()) {
    // Trier par date d'ajout croissante
    rows.sort((a, b) => (a.added_at ?? '').localeCompare(b.added_at ?? ''))

    const logs = logsByPlayer.get(player.id) ?? []
    const periods: PeriodContrib[] = []
    const key = `${pooler.id}::${player.id}`

    for (const row of rows) {
      const addedAt  = row.added_at  ? new Date(row.added_at)  : null
      const removedAt = row.removed_at ? new Date(row.removed_at) : null
      if (!addedAt) continue

      const segments = activeSegments(key, addedAt.getTime(), removedAt ? removedAt.getTime() : null, row.player_type)

      for (const seg of segments) {
        const earned: StatBlock = { goals: 0, assists: 0, goalie_wins: 0, goalie_otl: 0, goalie_shutouts: 0 }
        let gamesPlayed = 0

        for (const gl of logs) {
          const gameTime = new Date(gl.game_start_time).getTime()
          if (gameTime <= seg.start) continue
          if (seg.end !== null && gameTime > seg.end) continue
          earned.goals           += gl.goals
          earned.assists         += gl.assists
          earned.goalie_wins     += gl.goalie_wins
          earned.goalie_otl      += gl.goalie_otl
          earned.goalie_shutouts += gl.goalie_shutouts
          gamesPlayed++
        }

        periods.push({
          goals:           earned.goals,
          assists:         earned.assists,
          goalie_wins:     earned.goalie_wins,
          goalie_otl:      earned.goalie_otl,
          goalie_shutouts: earned.goalie_shutouts,
          gamesPlayed,
          points:          calcPoints(earned, pts),
          addedAt:         new Date(seg.start).toISOString(),
          removedAt:       seg.end !== null ? new Date(seg.end).toISOString() : null,
        })
      }
    }

    // Totaux : somme de toutes les périodes
    const total: StatBlock = periods.reduce(
      (acc, p) => ({
        goals:           acc.goals           + p.goals,
        assists:         acc.assists         + p.assists,
        goalie_wins:     acc.goalie_wins     + p.goalie_wins,
        goalie_otl:      acc.goalie_otl      + p.goalie_otl,
        goalie_shutouts: acc.goalie_shutouts + p.goalie_shutouts,
      }),
      { goals: 0, assists: 0, goalie_wins: 0, goalie_otl: 0, goalie_shutouts: 0 },
    )

    // player_type = la période la plus récente (dernière row)
    const currentRow = rows[rows.length - 1]

    // Un joueur actuellement `recrue` sans aucune période active n'a jamais quitté la
    // banque de recrues (rien à afficher) — mais s'il a été actif à un moment (périods
    // non vide), sa contribution passée doit rester visible même si son statut final est
    // redevenu recrue (ex: rétrogradé après un échange).
    if (currentRow.player_type === 'recrue' && periods.length === 0) continue

    poolerMap.get(pooler.id)!.players.push({
      nhlId:          player.nhl_id,
      firstName:      player.first_name,
      lastName:       player.last_name,
      position:       player.position,
      playerType:     currentRow.player_type,
      stillRostered:  currentRow.removed_at === null,
      teamAbbrev:     player.teams?.code ?? '—',
      gamesPlayed:    periods.reduce((s, p) => s + p.gamesPlayed, 0),
      goals:          total.goals,
      assists:        total.assists,
      goalieWins:     total.goalie_wins,
      goalieOtl:      total.goalie_otl,
      goalieShutouts: total.goalie_shutouts,
      poolPoints:     periods.reduce((s, p) => s + p.points, 0),
      addedAt:        rows[0].added_at ?? null,  // première activation
      periods,
    })
  }

  return Array.from(poolerMap.entries())
    .map(([poolerId, { name, players }]) => ({
      poolerId,
      poolerName: name,
      // poolPoints est désormais calculé match par match selon le statut réel du joueur
      // à ce moment (statusAt) — plus besoin de filtrer par statut actuel ici, sinon un
      // joueur benché aujourd'hui perdrait les points gagnés pendant qu'il était actif.
      totalPoints: players.reduce((s, p) => s + p.poolPoints, 0),
      players,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints || a.poolerName.localeCompare(b.poolerName))
}
