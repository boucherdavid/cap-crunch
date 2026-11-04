/**
 * Joueurs laissés de côté par leur équipe de la LNH (« healthy scratch ») — David, 2026-11-04.
 *
 * Table `player_lineup_status`, écrite une fois par jour par python_script/scrape_ahl_assignments.py
 * (matchs consécutifs de son équipe qu'il n'a pas joués, depuis son dernier match ou son arrivée).
 * Ici : seuils de Configuration → Général (patineurs / gardiens) et blessés retirés (badge Blessé,
 * 2 sources sur 3 — un blessé ne joue pas, ce n'est pas un choix de l'entraîneur).
 *
 * Aucun appel externe. Calcul en cache selon deux versions de data_versions : `lineup` (la table)
 * et `injuries` (blessures et app_settings, donc les seuils). Table absente → aucune donnée.
 */

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDataVersion } from '@/lib/dataVersion'
import { fetchInjuriesByPlayerId } from '@/lib/injuries'
import { fetchScratchSettings } from '@/lib/scratchSettings'

export type ScratchInfo = { games: number; lastPlayed: string | null; teamCode: string }

type ScratchRow = ScratchInfo & { playerId: number; nhlId: number | null }

const ID_CHUNK = 300

async function loadScratches(): Promise<ScratchRow[]> {
  const admin = createAdminClient()
  const [{ data, error }, settings, injuries] = await Promise.all([
    admin
      .from('player_lineup_status')
      .select('player_id, team_code, games_missed, last_played')
      .gte('games_missed', 1)
      .order('player_id')
      .range(0, 1999),
    fetchScratchSettings(admin),
    fetchInjuriesByPlayerId(),
  ])
  if (error || !data) {
    if (error) console.error('player_lineup_status', error.message)
    return []
  }
  const min = Math.min(settings.skaterGames, settings.goalieGames)
  const candidates = data.filter(r => (r.games_missed as number) >= min && !injuries.has(r.player_id as number))

  // Pas de jointure `players` : la table n'a pas de clé étrangère (règle du projet).
  const players = new Map<number, { nhlId: number | null; isGoalie: boolean }>()
  const ids = candidates.map(r => r.player_id as number)
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data: rows } = await admin.from('players').select('id, nhl_id, position').in('id', ids.slice(i, i + ID_CHUNK))
    for (const p of rows ?? []) {
      players.set(p.id as number, { nhlId: (p.nhl_id as number | null) ?? null, isGoalie: ((p.position as string | null) ?? '').includes('G') })
    }
  }

  return candidates.flatMap(r => {
    const p = players.get(r.player_id as number)
    const games = r.games_missed as number
    if (games < (p?.isGoalie ? settings.goalieGames : settings.skaterGames)) return []
    return [{
      playerId: r.player_id as number,
      nhlId: p?.nhlId ?? null,
      games,
      lastPlayed: (r.last_played as string | null) ?? null,
      teamCode: r.team_code as string,
    }]
  })
}

const cachedScratches = unstable_cache(
  async (_lineup: number, _injuries: number) => loadScratches(),
  ['lineup-scratches-v1'],
  { revalidate: 86_400 },
)

async function getScratches(): Promise<ScratchRow[]> {
  const [lineup, injuries] = await Promise.all([getDataVersion('lineup'), getDataVersion('injuries')])
  return lineup === null || injuries === null ? loadScratches() : cachedScratches(lineup, injuries)
}

function toInfo({ games, lastPlayed, teamCode }: ScratchRow): ScratchInfo {
  return { games, lastPlayed, teamCode }
}

export async function fetchScratchesByPlayerId(): Promise<Map<number, ScratchInfo>> {
  return new Map((await getScratches()).map(r => [r.playerId, toInfo(r)]))
}

export async function fetchScratchesByNhlId(): Promise<Map<number, ScratchInfo>> {
  const map = new Map<number, ScratchInfo>()
  for (const r of await getScratches()) if (r.nhlId) map.set(r.nhlId, toInfo(r))
  return map
}
