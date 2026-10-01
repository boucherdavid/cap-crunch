'use server'

export type NhlSeasonTotal = {
  season: number
  gameTypeId: number
  leagueAbbrev: string
  teamName: { default: string }
  gamesPlayed: number
  goals?: number
  assists?: number
  wins?: number
  losses?: number
  otLosses?: number
  shutouts?: number
  savePct?: number
  goalsAgainstAvg?: number
  gamesStarted?: number
}

export type NhlPlayerLanding = {
  playerId: number
  firstName: { default: string }
  lastName: { default: string }
  headshot: string
  position: string
  sweaterNumber?: number
  currentTeamAbbrev?: string
  birthDate?: string
  birthCity?: { default: string }
  birthCountry?: string
  heightInInches?: number
  weightInPounds?: number
  seasonTotals: NhlSeasonTotal[]
}

export type NhlPlayerLandingResult = { data: NhlPlayerLanding | null; error: string | null }

// La LNH est derrière Cloudflare, qui refuse parfois les requêtes sans navigateur identifiable.
const NHL_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; CapCrunch/1.0)', Accept: 'application/json' }

/** Fiche LNH d'un joueur, avec le motif de l'échec s'il y en a un (affiché dans la fiche pour
 * pouvoir diagnostiquer sans les journaux du serveur — David, 2026-10-01). Deux essais : avec
 * le cache d'une heure, puis sans cache, pour qu'une erreur passagère ne reste pas servie. */
export async function fetchPlayerLanding(nhlId: number): Promise<NhlPlayerLandingResult> {
  const url = `https://api-web.nhle.com/v1/player/${nhlId}/landing`
  let error = 'aucune réponse'
  for (const init of [{ next: { revalidate: 3600 } }, { cache: 'no-store' as const }]) {
    try {
      const res = await fetch(url, { ...init, headers: NHL_HEADERS })
      if (res.ok) return { data: await res.json(), error: null }
      error = `la LNH a répondu ${res.status}`
    } catch (e) {
      error = e instanceof Error ? e.message : 'erreur réseau'
    }
    console.error(`[fetchPlayerLanding] ${nhlId} : ${error}`)
  }
  return { data: null, error }
}
