import type { SupabaseClient } from '@supabase/supabase-js'

// Un changement de type (actif ↔ réserviste ↔ recrue ↔ ltir) sur une ligne pooler_rosters
// existante ne crée jamais de nouvelle ligne — added_at reste donc celui du tout premier
// ajout. Si la date effective de ce changement est antérieure à added_at (ex: ajout en
// temps réel suivi d'une correction à une date passée via "Forcer une date effective" ou
// l'onglet Historique), buildStandings() ignorerait tous les matchs entre les deux, même
// avec le bon statut dans roster_change_log — added_at borne la fenêtre en premier lieu.
// La date effective saisie fait foi comme date de début : on recule added_at, avec un
// avertissement non bloquant pour que l'admin le sache.
export function computeTypeChangeAddedAt(
  currentAddedAt: string | null,
  effectiveTs: string,
): { addedAtOverride?: string; warning?: string } {
  if (currentAddedAt && effectiveTs < currentAddedAt) {
    return {
      addedAtOverride: effectiveTs,
      warning: `Date d'ajout au roster reculée du ${currentAddedAt.slice(0, 10)} au ${effectiveTs.slice(0, 10)} pour couvrir la transaction.`,
    }
  }
  return {}
}

// Garde-fou — période fantôme dans roster_change_log (corrigé le 2026-07-20, voir
// SUIVI_PROJET.md et CLAUDE.md section 6). statusAt() (app/lib/standings.ts) trie tous les
// événements d'un (pooler, joueur) par date effective (changed_at), pas par date de saisie.
// Si on applique un changement de type avec une date effective antérieure à un événement
// déjà journalisé pour ce même (pooler, joueur) — ex: une correction Historique a posteriori,
// ou une saisie "Forcer une date effective" — ce vieil événement s'appliquerait chronologi-
// quement APRÈS le nouveau statut et le ferait réapparaître à tort à partir de sa date (une
// fausse "Période 2" dans le popup /classement, /poolers/[id]).
// Volontairement bloquant plutôt qu'auto-nettoyant : impossible de distinguer ici un artefact
// obsolète (sûr à supprimer) d'un véritable événement futur réel (ex: un vrai retrait déjà
// survenu) sans risquer d'effacer une donnée réelle. L'admin tranche via /admin/communaute?tab=suivi.
export async function checkFutureRosterConflict(
  db: SupabaseClient,
  poolerId: string,
  playerId: number,
  poolSeasonId: number,
  effectiveTs: string,
  finalType: string,
): Promise<{ error?: string }> {
  const { data: futureEvents } = await db
    .from('roster_change_log')
    .select('new_type, changed_at')
    .eq('pooler_id', poolerId)
    .eq('player_id', playerId)
    .eq('pool_season_id', poolSeasonId)
    .gt('changed_at', effectiveTs)
    .order('changed_at', { ascending: false })
    .limit(1)

  const last = futureEvents?.[0]
  if (last && last.new_type !== finalType) {
    const d = new Date(last.changed_at).toLocaleDateString('fr-CA')
    return {
      error: `Un événement déjà journalisé pour ce joueur est daté du ${d} (postérieur à cette correction) et indique un statut différent ("${last.new_type ?? 'retiré'}") — l'appliquer créerait une période fantôme dans le classement. Supprime cet événement dans Admin → Pool → Suivi s'il s'agit d'un artefact obsolète, ou choisis une date effective postérieure au ${d} si ce statut du ${d} est réel.`,
    }
  }
  return {}
}
