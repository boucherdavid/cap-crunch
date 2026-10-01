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

export async function fetchPlayerLanding(nhlId: number): Promise<NhlPlayerLanding | null> {
  const url = `https://api-web.nhle.com/v1/player/${nhlId}/landing`
  // Deux essais : d'abord avec le cache d'une heure, puis sans cache — une réponse en erreur de
  // la LNH (limite de débit, panne passagère) ne doit pas rester servie pendant une heure
  // (fiche « Impossible de charger les données de ce joueur », David, 2026-10-01).
  for (const init of [{ next: { revalidate: 3600 } }, { cache: 'no-store' as const }]) {
    try {
      const res = await fetch(url, init)
      if (res.ok) return await res.json()
      console.error(`[fetchPlayerLanding] ${nhlId} : HTTP ${res.status}`)
    } catch (e) {
      console.error(`[fetchPlayerLanding] ${nhlId} :`, e)
    }
  }
  return null
}
