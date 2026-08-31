// Insensible aux accents pour la recherche (ex: "dobias" trouve "Dobiáš") — n'affecte que
// la comparaison, jamais les noms affichés.
export function normalizeSearch(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
