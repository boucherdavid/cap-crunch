/**
 * Fetch partagé de `player_injuries` avec le signal d'admissibilité LTIR calculé (David,
 * 2026-09-23) — centralise la requête et le calcul plutôt que de les dupliquer dans les 5
 * endroits qui affichent le badge "Blessé"/"Admissible LTIR" (voir app/lib/ltirEligibility.ts
 * pour la règle elle-même).
 */

import { unstable_cache } from 'next/cache'
import type { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDataVersion } from '@/lib/dataVersion'
import { computeDatesDisagree, computeLtirEligible, countInjurySources, isOnNhlIr, playedSinceInjury, DEFAULT_LTIR_SETTINGS, MIN_INJURY_SOURCES, type LtirSettings } from './ltirEligibility'

export type InjuryInfo = {
  injuryType: string
  status: string
  eligible: boolean
  /** Encore listé blessé, mais a rejoué récemment (règle 0 de ltirEligibility.ts). */
  backInAction: boolean
  estReturnDate: string | null      // CBS d'abord, ESPN en repli — base du calcul LTIR
  espnEstReturnDate: string | null  // ESPN seul, pour signaler un désaccord (voir computeDatesDisagree)
  cbsReturnDate: string | null      // les trois dates sont affichées côte à côte par transparence
  mpReturnDate: string | null
  datesDisagree: boolean
}

type InjuryRowLike = {
  injury_type: string | null
  status: string | null
  est_return_date: string | null
  espn_est_return_date: string | null
  espn_status_desc: string | null
  mp_status: string | null
  mp_return_date: string | null
  in_cbs: boolean | null
  cbs_return_date: string | null
  first_seen_at: string
}

/**
 * Dernier match de la LNH joué par chacun de ces joueurs dans les `recentGameDays` derniers jours
 * (David, 2026-10-05) — alimente la règle 0. Client admin : `player_game_logs` n'est pas lu avec
 * le client de la requête ailleurs non plus (voir buildStandings).
 */
export async function fetchLastGameByPlayerId(playerIds: number[], settings: LtirSettings): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (playerIds.length === 0) return map
  const since = new Date(Date.now() - settings.recentGameDays * 86_400_000).toISOString()
  // Borne sur game_date (indexée), un jour plus tôt pour couvrir le décalage UTC : sans elle,
  // Postgres relisait tous les matchs de toutes les saisons de chaque blessé (requête la plus
  // coûteuse de la base, CPU de la prod saturé le 2026-10-14).
  const sinceDate = new Date(Date.parse(since) - 86_400_000).toISOString().slice(0, 10)
  const { data } = await createAdminClient()
    .from('player_game_logs')
    .select('player_id, game_start_time')
    .gte('game_date', sinceDate)
    .in('player_id', playerIds)
    .gte('game_start_time', since)
    .order('game_start_time')
  for (const g of (data ?? []) as { player_id: number; game_start_time: string }[]) map.set(g.player_id, g.game_start_time)
  return map
}

function toInjuryInfo(row: InjuryRowLike, settings: LtirSettings, lastGameAt: string | null): InjuryInfo {
  const input = {
    estReturnDate: row.est_return_date,
    firstSeenAt: row.first_seen_at,
    onNhlIr: isOnNhlIr(row.status, row.espn_status_desc, row.mp_status),
    lastGameAt,
  }
  return {
    injuryType: row.injury_type ?? '',
    status: row.status ?? row.espn_status_desc ?? '',
    eligible: computeLtirEligible(input, settings),
    backInAction: playedSinceInjury(input, settings),
    estReturnDate: row.est_return_date,
    espnEstReturnDate: row.espn_est_return_date,
    cbsReturnDate: row.cbs_return_date,
    mpReturnDate: row.mp_return_date,
    datesDisagree: computeDatesDisagree(row.est_return_date, row.espn_est_return_date, settings),
  }
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

/** Seuils d'admissibilité LTIR configurés par l'admin (app_settings, voir ltirEligibility.ts) —
 * repli sur les défauts si la ligne ou une colonne manque. */
export async function fetchLtirSettings(supabase: SupabaseLike): Promise<LtirSettings> {
  // Colonne lue à part (2026-10-05) : tant que sa migration n'est pas roulée, une seule requête
  // échouerait en entier et ramènerait tous les seuils à leurs défauts.
  const [{ data }, { data: returnRow }, { data: recentRow }, { data: relapseRow }] = await Promise.all([
    supabase
      .from('app_settings')
      .select('ltir_return_min_days, ltir_injured_min_days, ltir_grace_days, injury_disagreement_days, injury_removal_absence_days')
      .eq('id', 1)
      .maybeSingle(),
    supabase.from('app_settings').select('ltir_return_deadline_days').eq('id', 1).maybeSingle(),
    supabase.from('app_settings').select('ltir_recent_game_days').eq('id', 1).maybeSingle(),
    supabase.from('app_settings').select('ltir_relapse_games').eq('id', 1).maybeSingle(),
  ])
  const d = DEFAULT_LTIR_SETTINGS
  return {
    returnMinDays: data?.ltir_return_min_days ?? d.returnMinDays,
    injuredMinDays: data?.ltir_injured_min_days ?? d.injuredMinDays,
    graceDays: data?.ltir_grace_days ?? d.graceDays,
    disagreementDays: data?.injury_disagreement_days ?? d.disagreementDays,
    removalAbsenceDays: data?.injury_removal_absence_days ?? d.removalAbsenceDays,
    returnDeadlineDays: returnRow?.ltir_return_deadline_days ?? d.returnDeadlineDays,
    recentGameDays: recentRow?.ltir_recent_game_days ?? d.recentGameDays,
    relapseGames: relapseRow?.ltir_relapse_games ?? d.relapseGames,
  }
}

type InjurySnapshotRow = InjuryRowLike & { player_id: number; nhl_id: number | null; last_game_at: string | null }
type InjurySnapshot = { rows: InjurySnapshotRow[]; settings: LtirSettings }

/** Blessés (2 sources sur 3), dernier match récent et seuils LTIR — lecture brute, sans calcul
 * qui dépend de la date du jour (fait à l'affichage par toInjuryInfo). */
async function loadInjurySnapshot(): Promise<InjurySnapshot> {
  const admin = createAdminClient()
  const [{ data }, settings] = await Promise.all([
    admin
      .from('player_injuries')
      .select('player_id, injury_type, status, est_return_date, espn_est_return_date, espn_status_desc, mp_status, mp_return_date, in_cbs, cbs_return_date, first_seen_at, players (nhl_id)'),
    fetchLtirSettings(admin as unknown as SupabaseLike),
  ])
  // Une seule source : pas encore considéré blessé (voir MIN_INJURY_SOURCES).
  const injured = (data ?? []).filter(r => countInjurySources(r) >= MIN_INJURY_SOURCES)
  const lastGames = await fetchLastGameByPlayerId(injured.map(r => r.player_id as number), settings)
  const rows = injured.map(({ players, ...r }) => ({
    ...(r as unknown as InjuryRowLike & { player_id: number }),
    nhl_id: (players as unknown as { nhl_id: number | null } | null)?.nhl_id ?? null,
    last_game_at: lastGames.get(r.player_id as number) ?? null,
  }))
  return { rows, settings }
}

// Même principe que getStandings (lib/standings.ts) : la version de `data_versions` change à
// chaque écriture dans player_injuries, player_game_logs, players ou app_settings.
const cachedInjurySnapshot = unstable_cache(
  async (_version: number) => loadInjurySnapshot(),
  ['injury-snapshot-v1'],
  { revalidate: 86_400 },
)

async function getInjurySnapshot(): Promise<InjurySnapshot> {
  const version = await getDataVersion('injuries')
  return version === null ? loadInjurySnapshot() : cachedInjurySnapshot(version)
}

/** Blessés indexés par player_id. Mis en cache (David, 2026-10-14) : `supabase` n'est plus lu,
 * gardé pour ne pas changer les appelants. */
export async function fetchInjuriesByPlayerId(_supabase?: SupabaseLike): Promise<Map<number, InjuryInfo>> {
  const { rows, settings } = await getInjurySnapshot()
  return new Map(rows.map(r => [r.player_id, toInjuryInfo(r, settings, r.last_game_at)]))
}

/** Même chose, indexé par nhl_id — pour les composants qui n'ont pas le player_id interne
 * (ex: PlayerContrib de buildStandings(), voir /poolers/[id] onglet Alignement). */
export async function fetchInjuriesByNhlId(_supabase?: SupabaseLike): Promise<Map<number, InjuryInfo>> {
  const { rows, settings } = await getInjurySnapshot()
  const map = new Map<number, InjuryInfo>()
  for (const r of rows) if (r.nhl_id) map.set(r.nhl_id, toInjuryInfo(r, settings, r.last_game_at))
  return map
}
