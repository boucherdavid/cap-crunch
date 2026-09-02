// Protection recrue (CLAUDE.md section 1) : 5 saisons depuis l'année de repêchage pour un
// joueur repêché par le pool, ou tant que son contrat ELC est actif pour un agent libre.
// Partagé entre previewTransitionAction/transitionSeasonAction (admin/config/actions.ts),
// loadPresaisonDataAction (admin/presaison/actions.ts) et checkSeasonConformity
// (lib/seasonConformity.ts) — même définition partout, pour ne jamais désaccorder l'aperçu
// d'une action de ce qu'elle fait réellement.
export function isRookieProtectionExpired(
  rookieType: 'repeche' | 'agent_libre' | null,
  poolDraftYear: number | null,
  isElcActive: boolean,
  seasonStartYear: number,
): boolean {
  if (rookieType === 'repeche' && poolDraftYear !== null) {
    return (seasonStartYear - poolDraftYear) >= 5
  }
  if (rookieType === 'agent_libre') {
    return !isElcActive
  }
  // rookie_type indéfini (jamais classé) : traité comme expiré par sécurité, même
  // comportement que le code existant qu'on remplace.
  return true
}
