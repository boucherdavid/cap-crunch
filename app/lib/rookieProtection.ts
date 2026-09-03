// Protection recrue (CLAUDE.md section 1) : la fin de l'ELC est ce qui déclenche la perte de
// protection — pour un joueur repêché par le pool, les 5 saisons depuis l'année de repêchage
// ne sont qu'un plafond dur (jamais protégé au-delà), pas une garantie que l'ELC dure aussi
// longtemps. Pour un agent libre, protégé tant que son contrat ELC est actif (inchangé).
// Partagé entre previewTransitionAction/transitionSeasonAction (admin/config/actions.ts) et
// loadPresaisonDataAction (admin/presaison/actions.ts) — même définition partout, pour ne
// jamais désaccorder l'aperçu d'une action de ce qu'elle fait réellement. (David, 2026-09-03 :
// checkSeasonConformity et BanqueRecruesManager.tsx ont leur propre copie divergente,
// pré-existant, hors scope d'unifier complètement ici.)
export function isRookieProtectionExpired(
  rookieType: 'repeche' | 'agent_libre' | null,
  poolDraftYear: number | null,
  isElcActive: boolean,
  seasonStartYear: number,
): boolean {
  if (rookieType === 'repeche' && poolDraftYear !== null) {
    return !isElcActive || (seasonStartYear - poolDraftYear) >= 5
  }
  if (rookieType === 'agent_libre') {
    return !isElcActive
  }
  // rookie_type indéfini (jamais classé) : traité comme expiré par sécurité, même
  // comportement que le code existant qu'on remplace.
  return true
}
