// Protection recrue (CLAUDE.md section 1) : pour un joueur repêché par le pool, les 5 saisons
// depuis l'année de repêchage sont désormais la SEULE limite — la fin de l'ELC ne déclenche
// plus la perte de protection avant que ces 5 ans soient écoulés (David, 2026-09-14 : cas réels
// trouvés en prod — Leo Carlsson et Connor Bedard, ELC terminé et gros nouveau contrat compté
// au complet contre le cap du pooler, alors qu'ils étaient encore dans leur fenêtre de 5 ans.
// Le pooler doit garder l'option de les laisser en banque le temps de décider, sans se sentir
// obligé de payer le plein salaire tout de suite juste parce que l'ELC est fini). Pour un agent
// libre, la règle reste inchangée : protégé tant que son contrat ELC est actif, sans fenêtre de
// 5 ans (repêché par le pool seulement).
// Partagé entre previewTransitionAction/transitionSeasonAction (admin/config/actions.ts),
// loadPresaisonDataAction/syncExpiredRookieProtection (admin/presaison/actions.ts), et la
// promotion manuelle d'une recrue (admin/transactions/actions.ts, TransactionBuilder.tsx) —
// même définition partout, y compris pour l'éligibilité du bouton "remettre en banque" en
// libre-service (AgentsLibresDashboard.tsx, `banqueEligible = !!rookieType` — ce champ n'est
// plus effacé tant que cette fonction retourne false). checkSeasonConformity,
// BanqueRecruesManager.tsx et poolers/[id]/page.tsx ont leur propre copie divergente
// (pré-existant, hors scope d'unifier ici) mais implémentaient déjà cette même règle des 5 ans
// purs pour un repêché — c'était cette fonction-ci, la seule à encore vérifier l'ELC en plus,
// qui causait l'incohérence.
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

// Calcule isElcActive à partir des contrats réels — à utiliser par TOUS les appelants de
// isRookieProtectionExpired plutôt que `!!contract?.is_elc` en direct. Un repêché tout juste
// sélectionné par le pool n'a souvent aucun contrat NHL du tout (encore junior/AHL/Europe) —
// l'absence de ligne pour la saison ne veut PAS dire "ELC terminé", et ne doit surtout pas
// être traitée comme une expiration (bug trouvé par David, 2026-09-03 : des recrues fraîchement
// repêchées, sans contrat, se retrouvaient comptées comme actives/hors protection dès le
// chargement de la pré-saison). Seule une ligne de contrat existante avec is_elc=false prouve
// que la protection est réellement terminée.
// Sans ligne pour la saison mais avec des contrats d'avant (David, 2026-10-14) : le contrat est
// terminé (ex : ELC fini, joueur pas encore re-signé) — l'ELC n'est donc plus actif.
export function isElcActiveForSeason(
  contracts: { season: string; is_elc: boolean | null }[] | null | undefined,
  season: string,
): boolean {
  const all = contracts ?? []
  const contract = all.find(c => c.season === season)
  if (contract) return !!contract.is_elc
  return !all.some(c => c.season < season)
}

export type RookieTag = 'repeche' | 'agent_libre' | null

/**
 * Règle unique de la banque de recrues (David, 2026-10-14, après consultation des poolers) :
 * - repêché par le repêchage des recrues du pool : protégé pendant 5 saisons, incluant celle de
 *   son repêchage (repêché en 2026 → protégé de 2026-27 à 2030-31), peu importe son contrat ;
 * - tout autre joueur (agent libre, ou jamais étiqueté) : protégé tant que son contrat de la
 *   saison est un ELC.
 * Pendant la protection, le pooler peut le remettre dans sa banque quand il veut ; après, il doit
 * l'activer (activation automatique). À utiliser PARTOUT où l'on décide si un joueur peut être
 * (ou rester) en banque — jamais le statut recrue ni l'année de repêchage de la LNH.
 */
export function isRookieProtected(
  rookieType: RookieTag,
  poolDraftYear: number | null,
  contracts: { season: string; is_elc: boolean | null }[] | null | undefined,
  season: string,
): boolean {
  const type = rookieType === 'repeche' && poolDraftYear !== null ? 'repeche' : 'agent_libre'
  return !isRookieProtectionExpired(type, poolDraftYear, isElcActiveForSeason(contracts, season), parseInt(season.slice(0, 4), 10))
}

/** Dernière saison protégée, pour l'affichage (« protégé jusqu'en 2030-31 ») ; null pour un agent
 * libre, dont la fin dépend de son contrat. */
export function lastProtectedSeason(rookieType: RookieTag, poolDraftYear: number | null): string | null {
  if (rookieType !== 'repeche' || poolDraftYear === null) return null
  const start = poolDraftYear + 4
  return `${start}-${String(start + 1).slice(2)}`
}
