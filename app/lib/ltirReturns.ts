/**
 * Retour au jeu des joueurs sur LTIR (David, 2026-10-05) — un joueur mis sur LTIR ne compte pas
 * dans la masse salariale ; s'il recommence à jouer, le pooler doit le remettre dans son
 * alignement dans un délai paramétrable (`app_settings.ltir_return_deadline_days`, 14 jours par
 * défaut). Rien n'est jamais déplacé automatiquement : passé le délai, c'est l'admin qui décide.
 *
 * Signal retenu : le joueur a **joué un match de la LNH** (`player_game_logs`) depuis sa mise sur
 * LTIR — plus fiable que les listes de blessés, qui gardent souvent un joueur plusieurs jours
 * après son retour. Un joueur qui n'est plus listé blessé par aucune source mais n'a pas encore
 * joué est seulement signalé aux admins (`reason='not_injured'`), sans date limite.
 *
 * Rechute (David, 2026-10-09) : si le joueur se blesse de nouveau avant d'avoir été réintégré
 * (blessure confirmée par 2 sources, apparue après son dernier match, délai pas encore échu) et
 * qu'il manque `app_settings.ltir_relapse_games` matchs consécutifs de son équipe (2 par défaut,
 * calendrier de l'API de la LNH), le suivi est fermé et le retour obligatoire annulé. Tant que le
 * compte n'est pas atteint, rien ne change : un « day-to-day » sans match manqué ne suffit pas.
 * Un nouveau délai complet repart à son prochain match : seuls les matchs joués APRÈS la
 * fermeture du suivi précédent comptent comme un retour au jeu.
 *
 * Détection paresseuse, même patron que le ballotage (`resolveExpiredWaiverClaims`) : lancée au
 * chargement de l'accueil, de Gestion d'effectifs et du panneau Approbations — pas de tâche
 * planifiée. L'index unique partiel de `ltir_return_watch` (un seul suivi ouvert par joueur) et
 * les mises à jour conditionnelles (`reminder_sent_at IS NULL`...) garantissent une seule
 * notification même si deux pages lancent la détection en même temps.
 */

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser, sendPushToAdmins } from '@/lib/push'
import { sendEmailToIds } from '@/lib/email'
import { emailLinkHtml } from '@/lib/siteUrl'
import { getTodayET, addDaysToDate } from '@/lib/daily-recap'
import { localMidnightUTC } from '@/lib/dateRanges'
import { toNhlSeasonId } from '@/lib/nhl-stats'
import { DEFAULT_LTIR_SETTINGS, MIN_INJURY_SOURCES, countInjurySources } from '@/lib/ltirEligibility'

const MOUVEMENTS_PATH = '/gestion-effectifs'
const APPROBATION_PATH = '/admin/effectifs?tab=approbation'
const REMINDER_DAYS_BEFORE = 2
const SYNC_THROTTLE_MS = 5 * 60_000

type AdminDb = ReturnType<typeof createAdminClient>

export type LtirReturnWatchView = {
  id: number
  poolerId: string
  poolerName: string
  playerId: number
  playerName: string
  reason: 'played' | 'not_injured'
  firstGameDate: string | null
  /** Dernier jour permis (YYYY-MM-DD, heure de l'Est) — null pour 'not_injured'. */
  deadlineDay: string | null
  overdue: boolean
}

type WatchRow = {
  id: number
  pooler_id: string
  player_id: number
  reason: 'played' | 'not_injured'
  first_game_date: string | null
  deadline_at: string | null
  reminder_sent_at: string | null
  overdue_notified_at: string | null
}

/** `deadline_at` = minuit ET du lendemain du dernier jour permis → dernier jour affiché. */
function deadlineDayOf(deadlineAt: string | null): string | null {
  if (!deadlineAt) return null
  return new Date(new Date(deadlineAt).getTime() - 60_000).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

function fmtDay(day: string | null): string {
  if (!day) return ''
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

async function fetchDeadlineDays(admin: AdminDb): Promise<number> {
  const { data } = await admin.from('app_settings').select('ltir_return_deadline_days').eq('id', 1).maybeSingle()
  return data?.ltir_return_deadline_days ?? DEFAULT_LTIR_SETTINGS.returnDeadlineDays
}

async function fetchRelapseGames(admin: AdminDb): Promise<number> {
  // Lu à part : avant la migration, la requête échoue et le défaut s'applique.
  const { data } = await admin.from('app_settings').select('ltir_relapse_games').eq('id', 1).maybeSingle()
  return (data as { ltir_relapse_games?: number } | null)?.ltir_relapse_games ?? DEFAULT_LTIR_SETTINGS.relapseGames
}

// Un match de l'équipe ne compte comme « manqué » que s'il a commencé depuis au moins 18 heures :
// les points sont importés la nuit, et un match de la veille au soir pas encore importé ferait
// passer un joueur qui a joué pour un absent.
const MISSED_GAME_MIN_AGE_MS = 18 * 3_600_000

/** Matchs de saison régulière terminés par l'équipe depuis `sinceIso` (le dernier match du joueur).
 * null si le calendrier de la LNH ne répond pas : dans le doute, on n'annule rien. */
async function countTeamGamesSince(teamCode: string, sinceIso: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/club-schedule-season/${teamCode}/now`, {
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const json = await res.json() as { games?: { gameType?: number; startTimeUTC?: string; gameState?: string }[] }
    const since = new Date(sinceIso).getTime()
    const latest = Date.now() - MISSED_GAME_MIN_AGE_MS
    return (json.games ?? []).filter(g => {
      if (g.gameType !== 2 || !g.startTimeUTC) return false
      const start = new Date(g.startTimeUTC).getTime()
      return start > since && start <= latest && (g.gameState === 'OFF' || g.gameState === 'FINAL')
    }).length
  } catch {
    return null
  }
}

async function adminIds(admin: AdminDb): Promise<string[]> {
  const { data } = await admin.from('poolers').select('id').eq('is_admin', true)
  return (data ?? []).map(p => p.id as string)
}

/** Push + courriel au pooler ET aux admins (l'admin suit tout, David 2026-10-05). */
function notifyPoolerAndAdmins(admin: AdminDb, poolerId: string, title: string, poolerBody: string, adminBody: string) {
  after(async () => {
    const admins = (await adminIds(admin)).filter(id => id !== poolerId)
    await Promise.all([
      sendPushToUser(poolerId, { title, body: poolerBody, url: MOUVEMENTS_PATH }).catch(() => {}),
      sendEmailToIds([poolerId], { subject: title, html: `<p>${poolerBody}</p>${emailLinkHtml(MOUVEMENTS_PATH)}` }).catch(() => {}),
      sendPushToAdmins({ title, body: adminBody, url: APPROBATION_PATH }, poolerId).catch(() => {}),
      sendEmailToIds(admins, { subject: title, html: `<p>${adminBody}</p>${emailLinkHtml(APPROBATION_PATH)}` }).catch(() => {}),
    ])
  })
}

function notifyAdminsOnly(admin: AdminDb, title: string, body: string) {
  after(async () => {
    const admins = await adminIds(admin)
    await Promise.all([
      sendPushToAdmins({ title, body, url: APPROBATION_PATH }).catch(() => {}),
      sendEmailToIds(admins, { subject: title, html: `<p>${body}</p>${emailLinkHtml(APPROBATION_PATH)}` }).catch(() => {}),
    ])
  })
}

let lastSyncAt = 0

/**
 * Détecte les retours au jeu et envoie les notifications dues. `force` saute la limite d'un
 * passage aux 5 minutes (par instance de fonction) — utilisé là où l'affichage qui suit doit
 * être à jour. Ne lève jamais : une erreur (ex. migration pas encore roulée) est journalisée.
 */
export async function syncLtirReturns(force = false): Promise<void> {
  if (!force && Date.now() - lastSyncAt < SYNC_THROTTLE_MS) return
  lastSyncAt = Date.now()
  try {
    await runSync()
  } catch (e) {
    console.error('syncLtirReturns —', e)
  }
}

async function runSync(): Promise<void> {
  const admin = createAdminClient()
  const { data: season } = await admin
    .from('pool_seasons')
    .select('id, season, season_started')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .maybeSingle()
  // Pré-saison : aucun match officiel, et le libre-service gère déjà les alignements.
  if (!season?.season_started) return

  const [{ data: ltirRows }, { data: openRows, error: watchError }] = await Promise.all([
    admin
      .from('pooler_rosters')
      .select('pooler_id, player_id, added_at, poolers (name), players (first_name, last_name, teams (code))')
      .eq('pool_season_id', season.id)
      .eq('player_type', 'ltir')
      .eq('is_active', true),
    admin
      .from('ltir_return_watch')
      .select('id, pooler_id, player_id, reason, first_game_date, deadline_at, reminder_sent_at, overdue_notified_at')
      .eq('pool_season_id', season.id)
      .is('resolved_at', null),
  ])
  if (watchError) throw new Error(watchError.message)

  type LtirRow = {
    pooler_id: string
    player_id: number
    added_at: string | null
    poolers: { name: string } | null
    players: { first_name: string; last_name: string; teams: { code: string } | null } | null
  }
  const ltir = (ltirRows ?? []) as unknown as LtirRow[]
  const open = (openRows ?? []) as WatchRow[]
  const key = (poolerId: string, playerId: number) => `${poolerId}::${playerId}`
  const ltirKeys = new Set(ltir.map(r => key(r.pooler_id, r.player_id)))
  const nowIso = new Date().toISOString()

  // 1. Le joueur n'est plus sur LTIR chez ce pooler (réintégré, libéré, échangé) → suivi fermé.
  const resolvedIds = open.filter(w => !ltirKeys.has(key(w.pooler_id, w.player_id))).map(w => w.id)
  if (resolvedIds.length > 0) {
    await admin.from('ltir_return_watch').update({ resolved_at: nowIso }).in('id', resolvedIds)
  }
  if (ltir.length === 0) return

  const openByKey = new Map(open.filter(w => !resolvedIds.includes(w.id)).map(w => [key(w.pooler_id, w.player_id), w]))
  const playerIds = [...new Set(ltir.map(r => r.player_id))]

  // 2. Depuis quand chaque joueur est sur LTIR : dernier passage journalisé, sinon la demande
  //    approuvée (les mises sur LTIR de pré-saison ne journalisent rien), sinon added_at.
  const [{ data: logRows }, { data: requestRows }, { data: gameRows }, { data: injuryRows }, { data: pastRows }, deadlineDays, relapseGames] = await Promise.all([
    admin
      .from('roster_change_log')
      .select('pooler_id, player_id, changed_at')
      .eq('pool_season_id', season.id)
      .eq('new_type', 'ltir')
      .in('player_id', playerIds),
    admin
      .from('ltir_requests')
      .select('pooler_id, ltir_player_id, submitted_at')
      .eq('pool_season_id', season.id)
      .eq('status', 'approved')
      .in('ltir_player_id', playerIds),
    admin
      .from('player_game_logs')
      .select('player_id, game_date, game_start_time')
      .eq('season', Number(toNhlSeasonId(season.season)))
      .eq('game_type', 2)
      .in('player_id', playerIds)
      .order('game_start_time'),
    admin
      .from('player_injuries')
      .select('player_id, first_seen_at, in_cbs, espn_status_desc, espn_est_return_date, mp_status, mp_return_date')
      .in('player_id', playerIds),
    // Suivis « a rejoué » déjà fermés : un match antérieur à leur fermeture ne rouvre rien.
    admin
      .from('ltir_return_watch')
      .select('pooler_id, player_id, resolved_at')
      .eq('pool_season_id', season.id)
      .eq('reason', 'played')
      .not('resolved_at', 'is', null)
      .in('player_id', playerIds),
    fetchDeadlineDays(admin),
    fetchRelapseGames(admin),
  ])

  const sinceByKey = new Map<string, string>()
  const keepLatest = (k: string, ts: string | null) => {
    if (ts && (!sinceByKey.has(k) || ts > sinceByKey.get(k)!)) sinceByKey.set(k, ts)
  }
  for (const r of (logRows ?? []) as { pooler_id: string; player_id: number; changed_at: string }[]) {
    keepLatest(key(r.pooler_id, r.player_id), r.changed_at)
  }
  for (const r of (requestRows ?? []) as { pooler_id: string; ltir_player_id: number; submitted_at: string }[]) {
    const k = key(r.pooler_id, r.ltir_player_id)
    if (!sinceByKey.has(k)) keepLatest(k, r.submitted_at)
  }

  const gamesByPlayer = new Map<number, { game_date: string; game_start_time: string }[]>()
  for (const g of (gameRows ?? []) as { player_id: number; game_date: string; game_start_time: string }[]) {
    if (!gamesByPlayer.has(g.player_id)) gamesByPlayer.set(g.player_id, [])
    gamesByPlayer.get(g.player_id)!.push(g)
  }
  type InjuryRow = {
    player_id: number; first_seen_at: string; in_cbs: boolean | null
    espn_status_desc: string | null; espn_est_return_date: string | null; mp_status: string | null; mp_return_date: string | null
  }
  const injuries = (injuryRows ?? []) as InjuryRow[]
  const listedInjured = new Set(injuries.map(r => r.player_id))
  // Blessure confirmée (2 sources sur 3) → date de sa première apparition.
  const confirmedInjurySince = new Map(
    injuries.filter(r => countInjurySources(r) >= MIN_INJURY_SOURCES).map(r => [r.player_id, r.first_seen_at]),
  )
  for (const r of (pastRows ?? []) as { pooler_id: string; player_id: number; resolved_at: string }[]) {
    keepLatest(key(r.pooler_id, r.player_id), r.resolved_at)
  }

  // Dernier jour permis = aujourd'hui (ET) + N jours, jusqu'à 23 h 59 — même convention que le
  // ballotage. Le délai part de la détection, pas du premier match : un retour repéré en retard
  // ne doit pas arriver déjà échu.
  const deadlineDay = addDaysToDate(getTodayET(), deadlineDays)
  const deadlineAt = localMidnightUTC(addDaysToDate(deadlineDay, 1)).toISOString()

  for (const r of ltir) {
    const k = key(r.pooler_id, r.player_id)
    const since = sinceByKey.get(k) ?? r.added_at
    const firstGame = (gamesByPlayer.get(r.player_id) ?? [])
      .find(g => !since || new Date(g.game_start_time).getTime() > new Date(since).getTime())
    const existing = openByKey.get(k)
    const playerName = r.players ? `${r.players.first_name} ${r.players.last_name}` : 'Un joueur'
    const poolerName = r.poolers?.name ?? 'Un pooler'

    // Rechute avant la réintégration : blessure confirmée apparue après son dernier match, et
    // `relapseGames` matchs de son équipe manqués depuis, délai pas encore échu → suivi fermé,
    // retour annulé. Le prochain match ouvrira un nouveau suivi.
    if (existing?.reason === 'played' && existing.deadline_at && Date.now() < new Date(existing.deadline_at).getTime()) {
      const injuredSince = confirmedInjurySince.get(r.player_id)
      const games = gamesByPlayer.get(r.player_id) ?? []
      const lastGame = games[games.length - 1]
      const teamCode = r.players?.teams?.code
      const reinjured = !!injuredSince && !!lastGame && new Date(lastGame.game_start_time).getTime() < new Date(injuredSince).getTime()
      const missed = reinjured && teamCode ? await countTeamGamesSince(teamCode, lastGame.game_start_time) : null
      if (reinjured && missed !== null && missed >= relapseGames) {
        const { data: closed } = await admin.from('ltir_return_watch')
          .update({ resolved_at: nowIso }).eq('id', existing.id).is('resolved_at', null).select('id')
        openByKey.delete(k)
        if (closed && closed.length > 0) {
          const jours = `${deadlineDays} jour${deadlineDays > 1 ? 's' : ''}`
          notifyPoolerAndAdmins(
            admin, r.pooler_id,
            'Cap Crunch — Retour de LTIR : délai annulé',
            `${playerName} s'est blessé de nouveau et a manqué ${missed} match${missed > 1 ? 's' : ''} de suite avant d'être remis dans ton alignement : le retour obligatoire est annulé et il reste sur le LTIR. Un nouveau délai de ${jours} commencera à son prochain match.`,
            `${playerName} (LTIR de ${poolerName}) s'est blessé de nouveau et a manqué ${missed} match${missed > 1 ? 's' : ''} de suite avant d'être réintégré : le retour obligatoire est annulé. Un nouveau délai de ${jours} commencera à son prochain match.`,
          )
        }
        continue
      }
    }

    if (firstGame) {
      if (existing?.reason === 'played') continue
      const values = { reason: 'played', first_game_date: firstGame.game_date, deadline_at: deadlineAt }
      const { data: written } = existing
        ? await admin.from('ltir_return_watch').update(values).eq('id', existing.id).eq('reason', 'not_injured').select('id')
        : await admin.from('ltir_return_watch')
            .insert({ pool_season_id: season.id, pooler_id: r.pooler_id, player_id: r.player_id, ...values })
            .select('id')
      if (!written || written.length === 0) continue  // une autre requête vient de l'écrire
      const jours = `${deadlineDays} jour${deadlineDays > 1 ? 's' : ''}`
      notifyPoolerAndAdmins(
        admin, r.pooler_id,
        "Cap Crunch — Retour au jeu d'un joueur sur LTIR",
        `${playerName} a recommencé à jouer (match du ${fmtDay(firstGame.game_date)}). Tu as ${jours}, soit jusqu'au ${fmtDay(deadlineDay)} à 23 h 59, pour le remettre dans ton alignement (Gestion d'effectifs → Retour LTIR).`,
        `${playerName} (LTIR de ${poolerName}) a recommencé à jouer (match du ${fmtDay(firstGame.game_date)}). ${poolerName} a jusqu'au ${fmtDay(deadlineDay)} à 23 h 59 pour le remettre dans son alignement.`,
      )
    } else if (!existing && !listedInjured.has(r.player_id)) {
      const { data: written } = await admin.from('ltir_return_watch')
        .insert({ pool_season_id: season.id, pooler_id: r.pooler_id, player_id: r.player_id, reason: 'not_injured' })
        .select('id')
      if (!written || written.length === 0) continue
      notifyAdminsOnly(
        admin,
        'Cap Crunch — Joueur sur LTIR à surveiller',
        `${playerName} (LTIR de ${poolerName}) n'est plus listé blessé par aucune source, mais n'a pas encore joué. À surveiller.`,
      )
    }
  }

  // 3. Rappel avant l'échéance, puis avis de délai dépassé — une seule fois chacun.
  const now = Date.now()
  for (const w of openByKey.values()) {
    if (w.reason !== 'played' || !w.deadline_at) continue
    const row = ltir.find(r => r.pooler_id === w.pooler_id && r.player_id === w.player_id)
    const playerName = row?.players ? `${row.players.first_name} ${row.players.last_name}` : 'Un joueur'
    const poolerName = row?.poolers?.name ?? 'Un pooler'
    const deadlineMs = new Date(w.deadline_at).getTime()
    const day = fmtDay(deadlineDayOf(w.deadline_at))

    if (now >= deadlineMs) {
      if (w.overdue_notified_at) continue
      const { data: marked } = await admin.from('ltir_return_watch')
        .update({ overdue_notified_at: nowIso }).eq('id', w.id).is('overdue_notified_at', null).select('id')
      if (!marked || marked.length === 0) continue
      notifyPoolerAndAdmins(
        admin, w.pooler_id,
        'Cap Crunch — Retour de LTIR : délai dépassé',
        `Le délai pour remettre ${playerName} dans ton alignement est dépassé (${day}). Fais-le dès que possible, sinon l'admin devra intervenir.`,
        `Le délai de ${poolerName} pour remettre ${playerName} dans son alignement est dépassé (${day}). À toi de décider de la suite.`,
      )
    } else if (!w.reminder_sent_at && deadlineMs - now <= REMINDER_DAYS_BEFORE * 86_400_000) {
      const { data: marked } = await admin.from('ltir_return_watch')
        .update({ reminder_sent_at: nowIso }).eq('id', w.id).is('reminder_sent_at', null).select('id')
      if (!marked || marked.length === 0) continue
      notifyPoolerAndAdmins(
        admin, w.pooler_id,
        'Cap Crunch — Rappel : retour de LTIR',
        `Rappel : tu as jusqu'au ${day} à 23 h 59 pour remettre ${playerName} dans ton alignement.`,
        `Rappel : ${poolerName} a jusqu'au ${day} à 23 h 59 pour remettre ${playerName} dans son alignement.`,
      )
    }
  }
}

/** Suivis ouverts de la saison — d'un pooler (`poolerId`) ou de tout le pool (admin). */
export async function listOpenLtirReturnWatches(poolSeasonId: number, poolerId?: string): Promise<LtirReturnWatchView[]> {
  const admin = createAdminClient()
  let query = admin
    .from('ltir_return_watch')
    .select('id, pooler_id, player_id, reason, first_game_date, deadline_at, poolers (name), players (first_name, last_name)')
    .eq('pool_season_id', poolSeasonId)
    .is('resolved_at', null)
    .order('deadline_at', { nullsFirst: false })
  if (poolerId) query = query.eq('pooler_id', poolerId).eq('reason', 'played')
  const { data, error } = await query
  if (error) return []  // migration pas encore roulée

  type Row = {
    id: number
    pooler_id: string
    player_id: number
    reason: 'played' | 'not_injured'
    first_game_date: string | null
    deadline_at: string | null
    poolers: { name: string } | null
    players: { first_name: string; last_name: string } | null
  }
  return ((data ?? []) as unknown as Row[]).map(r => ({
    id: r.id,
    poolerId: r.pooler_id,
    poolerName: r.poolers?.name ?? '',
    playerId: r.player_id,
    playerName: r.players ? `${r.players.first_name} ${r.players.last_name}` : '',
    reason: r.reason,
    firstGameDate: r.first_game_date,
    deadlineDay: deadlineDayOf(r.deadline_at),
    overdue: !!r.deadline_at && Date.now() >= new Date(r.deadline_at).getTime(),
  }))
}
