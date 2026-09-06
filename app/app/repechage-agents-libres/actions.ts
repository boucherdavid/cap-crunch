'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { applyTransactionItems, type TxItemPayload } from '../admin/transactions/actions'

// Libre-service pooler — David, 2026-09-06 : plutôt que de dépendre de l'admin pour chaque
// ajustement pré-saison, un pooler peut lui-même basculer actif↔réserviste, libérer et
// activer une recrue de sa propre banque, directement depuis /repechage-agents-libres.
// Portée volontairement restreinte : 3 action_type seulement (jamais 'sign'/'transfer'/
// 'reactivate' — ni contourner le tour du repêchage AL, ni échanger avec un autre pooler),
// et from/to_pooler_id toujours forcés à l'utilisateur courant (jamais pris du client) —
// impossible de toucher au roster de quelqu'un d'autre même en falsifiant la requête.
export type SelfServiceItem =
  | { action_type: 'type_change'; player_id: number; old_player_type: 'actif' | 'reserviste'; new_player_type: 'actif' | 'reserviste' }
  | { action_type: 'release'; player_id: number }
  | { action_type: 'promote'; player_id: number; new_player_type: 'actif' | 'reserviste' }

const ACTIF_OU_RESERVISTE = new Set(['actif', 'reserviste'])

// Le type SelfServiceItem ne protège que l'appelant TypeScript de ce projet — un Server
// Action reste un endpoint HTTP appelable avec n'importe quel payload. Sans cette validation
// runtime, un item forgé avec action_type 'sign'/'transfer'/'reactivate' (ou un
// old_player_type/new_player_type hors actif/reserviste, ex: 'ltir') passerait tel quel à
// applyTransactionItems — qui n'a plus le garde-fou is_admin ici (client admin) — et
// contournerait la file du repêchage AL ou créerait un statut LTIR non légitime.
function isValidSelfServiceItem(item: unknown): item is SelfServiceItem {
  if (typeof item !== 'object' || item === null) return false
  const it = item as Record<string, unknown>
  if (typeof it.player_id !== 'number') return false
  if (it.action_type === 'release') return true
  if (it.action_type === 'promote') return typeof it.new_player_type === 'string' && ACTIF_OU_RESERVISTE.has(it.new_player_type)
  if (it.action_type === 'type_change') {
    return typeof it.old_player_type === 'string' && ACTIF_OU_RESERVISTE.has(it.old_player_type)
      && typeof it.new_player_type === 'string' && ACTIF_OU_RESERVISTE.has(it.new_player_type)
  }
  return false
}

export async function submitSelfServiceAction(
  saisonId: number,
  items: SelfServiceItem[],
): Promise<{ error?: string; warning?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  if (items.length === 0) return { error: 'Aucun changement à soumettre.' }
  if (!items.every(isValidSelfServiceItem)) return { error: 'Action non autorisée en libre-service.' }

  // Réservé à la fenêtre de ménage pré-saison — une fois la saison démarrée, place à
  // /gestion-effectifs (self-service validé, avec historique réel).
  const { data: saison } = await supabase.from('pool_seasons').select('season_started').eq('id', saisonId).single()
  if (saison?.season_started) {
    return { error: 'La saison est démarrée — utilise Gestion d\'effectifs pour ajuster ton alignement.' }
  }

  const txItems: TxItemPayload[] = items.map(item => ({
    action_type: item.action_type,
    from_pooler_id: user.id,
    to_pooler_id: user.id,
    player_id: item.player_id,
    old_player_type: 'old_player_type' in item ? item.old_player_type : undefined,
    new_player_type: 'new_player_type' in item ? item.new_player_type : undefined,
  }))

  // transactions/transaction_items sont admin-only en RLS (schema.sql) — comme
  // /gestion-effectifs (submitBatchAction, écritures via un client service role après
  // vérification d'appartenance en code), on utilise le client admin ici pour l'écriture
  // elle-même ; l'autorisation réelle vient d'avoir forcé from/to_pooler_id à l'utilisateur
  // authentifié ci-dessus, pas de la RLS.
  // Notes identiques à ComplianceCard/BanqueRecruesManager ('Ajustement pré-saison', PAS
  // 'Repêchage pré-saison') — même classe de transaction peu importe qui l'initie (admin ou
  // libre-service), pour rester ramassé par la même requête "Activité récente" côté hub et ne
  // pas être annulé par "Réinitialiser le repêchage" (qui ne cible que les signatures AL).
  const adminSupabase = createAdminClient()
  const result = await applyTransactionItems(
    adminSupabase, user.id, saisonId, 'Ajustement pré-saison', txItems,
  )
  if (!result.error) {
    revalidatePath('/repechage-agents-libres')
    revalidatePath('/admin/init')
  }
  return result
}

export async function loadOwnRecrueBankAction(saisonId: number): Promise<{
  players: { roster_id: number; player_id: number; name: string; position: string | null; cap_number: number }[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { players: [] }

  const { data } = await supabase
    .from('pooler_rosters')
    .select('id, player_id, players (first_name, last_name, position, player_contracts (season, cap_number))')
    .eq('pooler_id', user.id)
    .eq('pool_season_id', saisonId)
    .eq('player_type', 'recrue')
    .eq('is_active', true)

  const { data: saisonRow } = await supabase.from('pool_seasons').select('season').eq('id', saisonId).single()
  const season = saisonRow?.season as string | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    players: ((data ?? []) as any[]).map(row => ({
      roster_id: row.id,
      player_id: row.player_id,
      name: `${row.players?.last_name}, ${row.players?.first_name}`,
      position: row.players?.position ?? null,
      cap_number: row.players?.player_contracts?.find((c: any) => c.season === season)?.cap_number ?? 0,
    })),
  }
}
