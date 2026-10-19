/**
 * Délai de réclamation au ballotage (`app_settings.waiver_claim_days`) — réglé dans Admin →
 * Gestion du pool → Configuration → Général (David, 2026-10-19, ex-onglet Conformité cap).
 * Un joueur libéré le jour J est réclamable jusqu'à 23 h 59 (heure de l'Est) du jour J + N.
 * Fichier sans dépendance serveur : importable par un composant client.
 */

export const DEFAULT_WAIVER_CLAIM_DAYS = 2
export const MIN_WAIVER_CLAIM_DAYS = 1
export const MAX_WAIVER_CLAIM_DAYS = 14

// `any` : accepte le client de la requête comme le client admin (même forme d'appel).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchWaiverClaimDays(supabase: any): Promise<number> {
  const { data } = await supabase.from('app_settings').select('waiver_claim_days').eq('id', 1).maybeSingle()
  return data?.waiver_claim_days ?? DEFAULT_WAIVER_CLAIM_DAYS
}

/** « 1er », « 2e », « 3e »… pour « le 2e jour suivant la libération ». */
export function ordinalFr(n: number): string {
  return n === 1 ? '1er' : `${n}e`
}
