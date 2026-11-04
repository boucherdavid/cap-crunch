/**
 * Joueurs actuellement dans la Ligue américaine (David, 2026-11-04) — badge « AHL ».
 *
 * Table `player_ahl_assignments`, écrite une fois par jour par
 * python_script/scrape_ahl_assignments.py (alignement d'un club de l'AHL, absent de tout
 * alignement de la LNH). Aucun appel externe ici : une seule lecture de la table, en cache tant
 * que la version `ahl` de data_versions ne bouge pas (elle monte à chaque écriture du script).
 *
 * Table absente (migration pas encore roulée) ou lecture en échec → aucune donnée : pas de badge,
 * jamais d'erreur.
 */

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDataVersion } from '@/lib/dataVersion'

export type AhlInfo = { teamCode: string; teamName: string; since: string }

type AhlRow = AhlInfo & { playerId: number; nhlId: number | null }

const ID_CHUNK = 300

async function loadAhlRows(): Promise<AhlRow[]> {
  const admin = createAdminClient()
  // Pas de jointure `players (nhl_id)` : la table n'a pas de clé étrangère (règle du projet),
  // PostgREST refuserait alors toute la requête (PGRST200) — d'où deux lectures.
  const { data, error } = await admin
    .from('player_ahl_assignments')
    .select('player_id, ahl_team_code, ahl_team_name, since')
    .order('player_id')
    .range(0, 4999)
  if (error || !data) {
    if (error) console.error('player_ahl_assignments', error.message)
    return []
  }
  const ids = data.map(r => r.player_id as number)
  const nhlById = new Map<number, number | null>()
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data: players } = await admin.from('players').select('id, nhl_id').in('id', ids.slice(i, i + ID_CHUNK))
    for (const p of players ?? []) nhlById.set(p.id as number, (p.nhl_id as number | null) ?? null)
  }
  return data.map(r => ({
    playerId: r.player_id as number,
    nhlId: nhlById.get(r.player_id as number) ?? null,
    teamCode: r.ahl_team_code as string,
    teamName: r.ahl_team_name as string,
    since: r.since as string,
  }))
}

const cachedAhlRows = unstable_cache(
  async (_version: number) => loadAhlRows(),
  ['ahl-assignments-v2'],
  { revalidate: 86_400 },
)

async function getAhlRows(): Promise<AhlRow[]> {
  const version = await getDataVersion('ahl')
  return version === null ? loadAhlRows() : cachedAhlRows(version)
}

function toInfo({ teamCode, teamName, since }: AhlRow): AhlInfo {
  return { teamCode, teamName, since }
}

export async function fetchAhlByPlayerId(): Promise<Map<number, AhlInfo>> {
  return new Map((await getAhlRows()).map(r => [r.playerId, toInfo(r)]))
}

/** Pour les composants qui n'ont que le nhl_id (PlayerContrib, stats de la LNH). */
export async function fetchAhlByNhlId(): Promise<Map<number, AhlInfo>> {
  const map = new Map<number, AhlInfo>()
  for (const r of await getAhlRows()) if (r.nhlId) map.set(r.nhlId, toInfo(r))
  return map
}
