/**
 * Année d'un repêchage du pool à partir de la saison de ses choix (David, 2026-10-14) : un
 * repêchage et ses choix se désignent par une seule année — les choix de la saison 2027-28 sont
 * « les choix de 2027 », jamais « 2027-28 ». À utiliser partout où un choix ou un repêchage du
 * pool est affiché.
 */
export function poolDraftYear(season: string | null | undefined): string {
  return season ? season.slice(0, 4) : '?'
}
