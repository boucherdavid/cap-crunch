/**
 * Année d'un repêchage du pool à partir de la saison de ses choix (David, 2026-10-14) : un
 * repêchage et ses choix se désignent par une seule année — les choix de la saison 2027-28 sont
 * « les choix de 2027 », jamais « 2027-28 ». À utiliser partout où un choix ou un repêchage du
 * pool est affiché.
 */
export function poolDraftYear(season: string | null | undefined): string {
  return season ? season.slice(0, 4) : '?'
}

/**
 * Libellé d'un choix du pool, avec son propriétaire d'origine (David, 2026-10-23) : un pooler peut
 * détenir plusieurs choix de la même ronde (le sien et un choix acquis) — sans le nom, impossible de
 * savoir lequel est offert. `year` est déjà passé par poolDraftYear().
 */
export function pickLabel(round: number | null | undefined, year: string, originalOwnerName?: string | null): string {
  return `Choix ronde ${round ?? '?'} (${year})${originalOwnerName ? ` de ${originalOwnerName}` : ''}`
}
