type ContractRow = { season: string; cap_number: number | null; contract_status?: string | null }

export type UnsignedStatus = 'RFA' | 'UFA' | null

export function previousSeason(season: string): string {
  const start = parseInt(season.split('-')[0], 10)
  return `${start - 1}-${String(start).slice(-2)}`
}

/**
 * Cap effectif d'un joueur pour une saison.
 *
 * Sans contrat réel pour cette saison, un cap n'est simulé (contrat de la saison précédente ×
 * multiplicateur de app_settings) que pour un joueur **RFA** (David, 2026-10-01) : comme dans la
 * vraie vie, son équipe garde ses droits et il va signer — sans estimé, il compterait 0 $ le
 * temps que son contrat soit connu (avantage caché). Un **UFA** sans contrat n'appartient à
 * aucune équipe : aucun estimé, il compte 0 $ (ex : Jonathan Toews en 2026-27, estimé à tort à
 * 2,4 M$ par l'ancienne règle qui simulait pour tout joueur sans contrat).
 *
 * `unsignedStatus` : statut du joueur quand il n'a pas de contrat réel pour la saison — pour
 * afficher « RFA (estimé) » ou « UFA (sans contrat) » (`UnsignedBadge`). Toute requête qui
 * alimente cette fonction doit ramener `contract_status` avec `season, cap_number`.
 */
export function getEffectiveCap(
  contracts: ContractRow[] | null | undefined,
  season: string,
  unsignedMultiplier: number,
): { cap: number; isEstimated: boolean; unsignedStatus: UnsignedStatus } {
  const real = contracts?.find(c => c.season === season)
  if (real?.cap_number) return { cap: real.cap_number, isEstimated: false, unsignedStatus: null }

  const status = real?.contract_status === 'RFA' || real?.contract_status === 'UFA' ? real.contract_status : null
  const prev = contracts?.find(c => c.season === previousSeason(season))
  if (status === 'RFA' && prev?.cap_number) {
    return { cap: Math.round(prev.cap_number * unsignedMultiplier), isEstimated: true, unsignedStatus: 'RFA' }
  }
  return { cap: 0, isEstimated: false, unsignedStatus: status }
}
