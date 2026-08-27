type ContractRow = { season: string; cap_number: number | null }

export function previousSeason(season: string): string {
  const start = parseInt(season.split('-')[0], 10)
  return `${start - 1}-${String(start).slice(-2)}`
}

/**
 * Cap effectif d'un joueur pour une saison. Sans contrat réel pour cette saison, simule un
 * cap à partir du contrat de la saison précédente × multiplicateur (app_settings) — évite
 * qu'un joueur non signé compte 0$ (avantage caché) le temps que son vrai contrat soit connu.
 */
export function getEffectiveCap(
  contracts: ContractRow[] | null | undefined,
  season: string,
  unsignedMultiplier: number,
): { cap: number; isEstimated: boolean } {
  const real = contracts?.find(c => c.season === season)
  if (real?.cap_number) return { cap: real.cap_number, isEstimated: false }

  const prev = contracts?.find(c => c.season === previousSeason(season))
  if (prev?.cap_number) {
    return { cap: Math.round(prev.cap_number * unsignedMultiplier), isEstimated: true }
  }
  return { cap: 0, isEstimated: false }
}
