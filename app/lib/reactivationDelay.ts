// Délai de réactivation compté en jours civils, heure de l'Est (David, 2026-10-17) — pas en heures
// depuis la désactivation. Un joueur désactivé le 17 (peu importe l'heure) est inactif les 17, 18
// et 19 avec un délai de 3 jours, et redevient activable le 20 dès 0 h. Une désactivation reportée
// au lendemain (match déjà commencé) a une date effective le 18 : activable le 21.
// Fonctions pures, partagées par submitBatchAction (serveur, source de vérité) et l'écran de
// Gestion d'effectifs.

function etDay(d: Date): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/** Premier jour (AAAA-MM-JJ, heure de l'Est) où le joueur peut être réactivé. */
export function reactivationUnlockDay(deactivatedAt: string, delaiJours: number): string {
  const d = new Date(etDay(new Date(deactivatedAt)) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + delaiJours)
  return d.toISOString().slice(0, 10)
}

/** Vrai tant que le jour de réactivation (heure de l'Est) n'est pas arrivé. */
export function isReactivationLocked(deactivatedAt: string, delaiJours: number, now: Date = new Date()): boolean {
  return etDay(now) < reactivationUnlockDay(deactivatedAt, delaiJours)
}

/** Jour de réactivation lisible (« 20 oct. »). */
export function formatUnlockDay(deactivatedAt: string, delaiJours: number): string {
  return new Date(reactivationUnlockDay(deactivatedAt, delaiJours) + 'T12:00:00Z')
    .toLocaleDateString('fr-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'short' })
}
