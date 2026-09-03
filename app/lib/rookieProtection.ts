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

// Calcule isElcActive à partir des contrats réels — à utiliser par TOUS les appelants de
// isRookieProtectionExpired plutôt que `!!contract?.is_elc` en direct. Un repêché tout juste
// sélectionné par le pool n'a souvent aucun contrat NHL du tout (encore junior/AHL/Europe) —
// l'absence de ligne pour la saison ne veut PAS dire "ELC terminé", et ne doit surtout pas
// être traitée comme une expiration (bug trouvé par David, 2026-09-03 : des recrues fraîchement
// repêchées, sans contrat, se retrouvaient comptées comme actives/hors protection dès le
// chargement de la pré-saison). Seule une ligne de contrat existante avec is_elc=false prouve
// que la protection est réellement terminée.
export function isElcActiveForSeason(
  contracts: { season: string; is_elc: boolean | null }[] | null | undefined,
  season: string,
): boolean {
  const contract = (contracts ?? []).find(c => c.season === season)
  return contract ? !!contract.is_elc : true
}
