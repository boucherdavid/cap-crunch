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
  // new_player_type 'recrue' (David, 2026-09-09) — remettre en banque un joueur encore sous
  // protection recrue, même geste que le libre-service admin (PoolerCard) mais initié par le
  // pooler lui-même. Revérifié côté serveur (rookie_type non-null) — voir plus bas.
  | { action_type: 'type_change'; player_id: number; old_player_type: 'actif' | 'reserviste'; new_player_type: 'actif' | 'reserviste' | 'recrue' }
  | { action_type: 'release'; player_id: number }
  | { action_type: 'promote'; player_id: number; new_player_type: 'actif' | 'reserviste' }

const ACTIF_OU_RESERVISTE = new Set(['actif', 'reserviste'])
const ACTIF_RESERVISTE_OU_RECRUE = new Set(['actif', 'reserviste', 'recrue'])

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
      && typeof it.new_player_type === 'string' && ACTIF_RESERVISTE_OU_RECRUE.has(it.new_player_type)
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

  // Remettre en banque (David, 2026-09-09) — seulement un joueur encore sous protection
  // recrue (rookie_type non-null malgré player_type actif/réserviste). Vérifié ici plutôt que
  // de faire confiance au client — un item forgé pourrait viser n'importe quel vétéran sinon.
  const demoteToRecrueIds = items
    .filter((it): it is Extract<SelfServiceItem, { action_type: 'type_change' }> => it.action_type === 'type_change' && it.new_player_type === 'recrue')
    .map(it => it.player_id)
  if (demoteToRecrueIds.length > 0) {
    const { data: rosterRows } = await supabase
      .from('pooler_rosters')
      .select('player_id, rookie_type')
      .eq('pooler_id', user.id)
      .eq('pool_season_id', saisonId)
      .eq('is_active', true)
      .in('player_id', demoteToRecrueIds)
    const rookieMap = new Map((rosterRows ?? []).map(r => [r.player_id, r.rookie_type]))
    const ineligible = demoteToRecrueIds.some(id => !rookieMap.get(id))
    if (ineligible) {
      return { error: 'Un des joueurs sélectionnés n\'est plus sous protection recrue — impossible de le remettre en banque.' }
    }
  }

  // Phase "libération de joueurs" (David, 2026-09-08) — une fois fermée par l'admin (avant de
  // démarrer le repêchage AL), seules les recrues de banque restent libérables/activables ;
  // libérer un joueur déjà signé (actif/réserviste) redevient admin-only (/admin/transactions).
  // type_change (actif↔réserviste ET remise en banque) et promote (activer une recrue) restent
  // toujours permis, peu importe la phase (David, 2026-09-09 — remettre en banque devait
  // rester possible aussi longtemps que le changement de statut, contrairement à un premier
  // essai qui l'avait soumis au même verrou que "libérer" ; voir SUIVI_PROJET.md).
  const releaseIds = items.filter(it => it.action_type === 'release').map(it => it.player_id)
  if (releaseIds.length > 0) {
    const { data: stateRow } = await supabase
      .from('presaison_draft_state')
      .select('release_phase_open')
      .eq('pool_season_id', saisonId)
      .maybeSingle()
    if (!(stateRow?.release_phase_open ?? false)) {
      const { data: rosterRows } = await supabase
        .from('pooler_rosters')
        .select('player_id, player_type')
        .eq('pooler_id', user.id)
        .eq('pool_season_id', saisonId)
        .eq('is_active', true)
        .in('player_id', releaseIds)
      const releasingSignedPlayer = (rosterRows ?? []).some(r => r.player_type !== 'recrue')
      if (releasingSignedPlayer) {
        return { error: 'La phase de libération de joueurs est fermée — seules les recrues de ta banque peuvent encore être libérées.' }
      }
    }
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
    // Un changement réel sur l'alignement invalide toute déclaration "prêt" antérieure (David,
    // 2026-09-08) — le "prêt" ne sert qu'à confirmer que les actifs/réservistes sont placés
    // comme voulu, donc toute modification doit le remettre à zéro plutôt que de laisser une
    // déclaration caduque.
    await adminSupabase.from('presaison_pooler_ready').upsert({
      pool_season_id: saisonId, pooler_id: user.id, ready_at: null,
    })
    revalidatePath('/repechage-agents-libres')
    revalidatePath('/admin/init')
  }
  return result
}

// Déclaration "mon alignement est prêt" (David, 2026-09-08) — confirme que le pooler a placé
// ses actifs/réservistes comme il le désire avant le début de saison. Distinct de la
// conformité (12/6/2 + cap, vérifiée séparément) : les deux doivent être vrais pour tout le
// monde avant que "Démarrer la saison" se débloque (voir demarrerSaisonAction). Remis à zéro
// automatiquement dès que submitSelfServiceAction s'exécute avec succès.
export async function setReadyAction(saisonId: number, ready: boolean): Promise<{ error?: string; readyAt?: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { data: saison } = await supabase.from('pool_seasons').select('season_started').eq('id', saisonId).single()
  if (saison?.season_started) {
    return { error: 'La saison est démarrée.' }
  }

  const readyAt = ready ? new Date().toISOString() : null
  const adminSupabase = createAdminClient()
  const { error } = await adminSupabase.from('presaison_pooler_ready').upsert({
    pool_season_id: saisonId, pooler_id: user.id, ready_at: readyAt,
  })
  if (error) return { error: error.message }

  revalidatePath('/repechage-agents-libres')
  revalidatePath('/admin/init')
  return { readyAt }
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

export type SandboxFreeAgentResult = {
  id: number
  first_name: string
  last_name: string
  position: string | null
  cap_number: number
  is_elc: boolean
  team_code: string | null
}

function posBucket(position: string | null): 'forward' | 'defense' | 'goalie' {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

// Recherche filtrable pour le Bac à sable (David, 2026-09-10) — les poolers cherchent souvent
// "un défenseur à moins de X$" sans connaître de nom précis, ce que searchFreeAgentsAction
// (admin/transactions/actions.ts, réutilisée par la signature en direct pendant le repêchage)
// ne permet pas — action séparée exprès pour ne rien risquer sur ce chemin critique. Sans nom
// (2+ caractères) ni filtre, retourne une liste vide comme avant.
export async function searchSandboxFreeAgentsAction(
  saisonId: number,
  opts: { query?: string; position?: 'forward' | 'defense' | 'goalie'; maxSalary?: number; elcOnly?: boolean; teamCode?: string },
): Promise<{ players: SandboxFreeAgentResult[]; truncated: boolean }> {
  const supabase = await createClient()

  const { data: saison } = await supabase.from('pool_seasons').select('season').eq('id', saisonId).single()
  if (!saison) return { players: [], truncated: false }

  const q = (opts.query ?? '').trim()

  const { data: onRoster } = await supabase
    .from('pooler_rosters')
    .select('player_id')
    .eq('pool_season_id', saisonId)
    .eq('is_active', true)
  const takenIds = (onRoster ?? []).map(r => r.player_id)

  // player_contracts!inner + filtre de saison toujours actif (David, 2026-09-10) — un joueur
  // sans contrat connu pour la saison courante n'a rien à montrer comme impact cap, donc rien
  // à faire dans un outil dont le but est justement de voir cet impact ; les résultats sans
  // salaire (auparavant affichés avec un montant vide) sont maintenant exclus d'office.
  // teams!inner seulement si un filtre d'équipe est demandé (une équipe manquante serait un
  // vrai problème de données, pas juste "rien à montrer").
  const contractsSelect = 'player_contracts!inner (season, cap_number, is_elc)'
  const teamsSelect = opts.teamCode ? 'teams!inner (code)' : 'teams (code)'
  const selectStr = `id, first_name, last_name, position, ${teamsSelect}, ${contractsSelect}`

  // Pas le RPC search_players_unaccent (utilisé par searchFreeAgentsAction) — PostgREST ne
  // sait pas combiner un filtre sur une table liée (player_contracts) avec une requête basée
  // sur un appel RPC ("column pgrst_call.cap_number does not exist", vérifié en direct). ilike
  // simple à la place, moins tolérant aux accents mais fonctionne avec les filtres.
  let dbQuery = supabase.from('players').select(selectStr)
  if (q.length >= 2) {
    // Virgules/parenthèses retirées — casseraient la syntaxe du filtre .or() de PostgREST
    // (séparateurs de conditions / groupement), pas un risque de sécurité mais un échec de
    // requête sinon.
    const safeQ = q.replace(/[,()]/g, '')
    dbQuery = dbQuery.or(`first_name.ilike.%${safeQ}%,last_name.ilike.%${safeQ}%`)
  }

  dbQuery = dbQuery.eq('player_contracts.season', saison.season)
  // La ligne de contrat peut exister pour la saison avec cap_number à null (fin de contrat,
  // donnée incomplète) — !inner seul ne suffit pas à exclure ces cas, vérifié en direct.
  dbQuery = dbQuery.not('player_contracts.cap_number', 'is', null)
  if (opts.maxSalary != null) dbQuery = dbQuery.lte('player_contracts.cap_number', opts.maxSalary)
  if (opts.elcOnly) dbQuery = dbQuery.eq('player_contracts.is_elc', true)
  if (opts.teamCode) dbQuery = dbQuery.eq('teams.code', opts.teamCode)
  if (takenIds.length > 0) dbQuery = dbQuery.not('id', 'in', `(${takenIds.join(',')})`)
  // Tri par équipe fait au niveau de la base (David, 2026-09-10, correction d'un vrai bug) —
  // un premier essai triait seulement côté client après réception, avec order('last_name')
  // seul côté serveur : la limite s'appliquait donc sur une tranche alphabétique de noms de
  // famille toutes équipes confondues (~A à C), donnant l'impression de "quelques joueurs par
  // équipe" au lieu de rosters complets. Le tri par salaire décroissant à l'intérieur de chaque
  // équipe reste fait côté client ci-dessous.
  // Piège supabase-js (vérifié en direct, deux essais) : .order('code', { referencedTable:
  // 'teams' }) génère "teams.order=code.asc" — trie l'INTÉRIEUR d'une relation imbriquée
  // (utile pour un un-à-plusieurs, ex: trier les commentaires d'un post), pas les lignes
  // players PAR la relation. teams est plusieurs-à-un ici (contrairement à player_contracts,
  // où order() est carrément refusé par PostgREST — PGRST118, déjà établi) : passer la chaîne
  // littérale 'teams(code)' comme nom de colonne (au lieu de l'option referencedTable) génère
  // la vraie syntaxe PostgREST "order=teams(code).asc" et trie bien les lignes principales.
  const limit = q.length >= 2 ? 15 : (opts.teamCode ? 40 : 150)
  dbQuery = dbQuery
    .order('teams(code)', { ascending: true })
    .order('last_name')
    .limit(limit)

  const { data } = await dbQuery
  const truncated = (data ?? []).length >= limit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players = ((data ?? []) as any[]).map(p => {
    const contract = (p.player_contracts ?? []).find((c: { season: string }) => c.season === saison.season)
    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      position: p.position ?? null,
      team_code: p.teams?.code ?? null,
      cap_number: contract?.cap_number ?? 0,
      is_elc: contract?.is_elc ?? false,
    }
  })

  const filtered = opts.position ? players.filter(p => posBucket(p.position) === opts.position) : players

  // Tri équipe (alphabétique) → salaire décroissant → alphabétique, demandé par David
  // (2026-09-10) pour balayer un roster d'équipe visuellement plutôt qu'en vrac.
  filtered.sort((a, b) =>
    (a.team_code ?? '').localeCompare(b.team_code ?? '')
    || b.cap_number - a.cap_number
    || a.last_name.localeCompare(b.last_name),
  )

  return { players: filtered, truncated }
}

// Pour le filtre d'équipe du Bac à sable (David, 2026-09-10).
export async function listTeamsAction(): Promise<{ teams: { code: string; name: string }[] }> {
  const supabase = await createClient()
  const { data } = await supabase.from('teams').select('code, name').order('code')
  return { teams: data ?? [] }
}
