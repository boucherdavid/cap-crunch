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

async function loadAhlRows(): Promise<AhlRow[]> {
  const { data, error } = await createAdminClient()
    .from('player_ahl_assignments')
    .select('player_id, ahl_team_code, ahl_team_name, since, players (nhl_id)')
  if (error || !data) return []
  return data.map(r => ({
    playerId: r.player_id as number,
    // Relation many-to-one : objet simple, pas un tableau (même piège que player_injuries).
    nhlId: (r.players as unknown as { nhl_id: number | null } | null)?.nhl_id ?? null,
    teamCode: r.ahl_team_code as string,
    teamName: r.ahl_team_name as string,
    since: r.since as string,
  }))
}

const cachedAhlRows = unstable_cache(
  async (_version: number) => loadAhlRows(),
  ['ahl-assignments-v1'],
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
