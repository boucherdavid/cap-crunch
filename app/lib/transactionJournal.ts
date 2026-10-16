// Journal des transactions pour les lots de Gestion d'effectifs (David, 2026-10-16) — partagé par
// submitBatchAction (gestion-effectifs/actions.ts) et /journal-transactions. Même conversion que
// python_script/backfill_journal_gestion.py (reconstitution des mouvements déjà faits).

export const JOURNAL_NOTES_GESTION = "Gestion d'effectifs"
// La contrainte de transaction_items n'accepte pas 'ballotage' : le lot est reconnu par sa note.
export const JOURNAL_NOTES_BALLOTAGE = 'Ballotage'

// change_type de roster_change_log → action_type de transaction_items.
export function journalActionType(changeType: string, oldType: string | null, newType: string | null): string {
  if (['signature_agent_libre', 'signature_ltir', 'ballotage', 'ajout_recrue'].includes(changeType)) return 'sign'
  if (changeType === 'retour_ltir' && oldType === 'ltir') return 'reactivate'
  if (changeType === 'retrait' || newType === null) return 'release'
  if (changeType === 'activation' && oldType === 'recrue') return 'promote'
  return 'type_change'
}
