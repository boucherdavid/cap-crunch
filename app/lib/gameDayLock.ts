import { createClient } from './supabase/server'

// Reporte au lendemain l'effet d'un lot de mouvements si un des joueurs touchés a déjà
// un match commencé aujourd'hui — évite qu'un même lot (ex: échange même pooler, où un
// joueur sort pendant qu'un autre entre) applique le nouveau statut pour aujourd'hui à
// l'un des deux joueurs mais pas à l'autre selon l'heure de leur propre match respectif.
// Horaire NHL interrogé en direct (pas via player_game_logs, qui n'est peuplé qu'après
// coup par le pipeline nocturne).

type ScheduledGame = { awayAbbrev: string; homeAbbrev: string; startTimeUTC: string }

function todayET(): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function addDaysET(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

async function fetchTodayGames(date: string): Promise<ScheduledGame[]> {
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/schedule/${date}`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const day = (data.gameWeek ?? []).find((d: any) => d.date === date)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((day?.games ?? []) as any[]).map(g => ({
      awayAbbrev: g.awayTeam?.abbrev ?? '',
      homeAbbrev: g.homeTeam?.abbrev ?? '',
      startTimeUTC: g.startTimeUTC ?? '',
    }))
  } catch {
    return []
  }
}

export type BatchEffectiveDate = {
  effectiveAt: string
  deferred: boolean
}

// Ne bloque jamais la soumission si l'horaire NHL est indisponible (timeout, erreur
// réseau) — on retombe alors sur le comportement actuel (now(), pas de report).
export async function computeBatchEffectiveDate(playerIds: number[]): Promise<BatchEffectiveDate> {
  const now = new Date()
  const fallback = { effectiveAt: now.toISOString(), deferred: false }
  try {
    const uniqueIds = Array.from(new Set(playerIds)).filter(id => id > 0)
    if (uniqueIds.length === 0) return fallback

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: players } = await supabase.from('players').select('id, teams(code)').in('id', uniqueIds) as { data: any[] | null }

    const teamCodes = new Set(
      (players ?? [])
        .map(p => p.teams?.code as string | undefined)
        .filter((c): c is string => !!c),
    )
    if (teamCodes.size === 0) return fallback

    const today = todayET()
    const games = await fetchTodayGames(today)
    const nowMs = now.getTime()

    const someGameStarted = games.some(g =>
      (teamCodes.has(g.awayAbbrev) || teamCodes.has(g.homeAbbrev)) &&
      !!g.startTimeUTC && new Date(g.startTimeUTC).getTime() <= nowMs,
    )

    if (!someGameStarted) return fallback

    // Même convention que les dates historiques sans heure précise (T12:00:00Z, soit 7h
    // heure de l'Est) — garantit d'être avant tout match du lendemain.
    const tomorrow = addDaysET(today, 1)
    return { effectiveAt: `${tomorrow}T12:00:00Z`, deferred: true }
  } catch {
    return fallback
  }
}
