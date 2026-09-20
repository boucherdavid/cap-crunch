'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeTypeChangeAddedAt, checkFutureRosterConflict } from '@/lib/rosterTypeChange'
import { computeBatchEffectiveDate } from '@/lib/gameDayLock'
import { validateRosterLimits, getPlayerBucket } from '@/lib/rosterLimits'
import { getEffectiveCap } from '@/lib/capUtils'
import { isRookieProtectionExpired } from '@/lib/rookieProtection'
import { createWaiverClaimForRelease } from '@/lib/waiverClaims'
import { DEFAULT_NHL_MINIMUM_SALARY } from '../presaison/types'

const fmtCap = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export type ActionType = 'transfer' | 'promote' | 'sign' | 'reactivate' | 'release' | 'type_change'

export type TxItemPayload = {
  action_type: ActionType
  from_pooler_id?: string
  to_pooler_id?: string
  player_id?: number
  pick_id?: number
  old_player_type?: string
  new_player_type?: string
}

type VEntry = {
  roster_id: number
  player_id: number
  player_type: string
  position: string | null
  cap_number: number
  nhl_id: number | null
}


// Choix du change_type roster_change_log — mêmes libellés que /gestion-effectifs et
// /admin/rosters (CHANGE_LABEL dans admin/pool/page.tsx et poolers/[id]/PoolerPageTabs.tsx)
// pour que le journal (Suivi) reste cohérent peu importe l'interface d'origine.
function pickChangeType(oldType: string | null, newType: string | null): string {
  if (!newType) return oldType === 'actif' ? 'deactivation' : 'retrait'
  if (oldType === 'ltir' && newType === 'actif') return 'retour_ltir'
  if (newType === 'actif') return 'activation'
  if (!oldType) {
    if (newType === 'reserviste') return 'ajout_reserviste'
    if (newType === 'recrue') return 'ajout_recrue'
    if (newType === 'ltir') return 'ltir'
  }
  if (oldType === 'actif') return 'deactivation'
  if (newType === 'ltir') return 'ltir'
  return 'changement_type'
}

export async function loadRosterAction(poolerId: string, saisonId: number) {
  const supabase = await createClient()
  const [{ data: rosterData }, { data: picksData }] = await Promise.all([
    supabase
      .from('pooler_rosters')
      .select(`id, player_id, player_type, rookie_type, pool_draft_year, players (id, first_name, last_name, position, status, is_rookie, teams (code), player_contracts (season, cap_number, is_elc))`)
      .eq('pooler_id', poolerId)
      .eq('pool_season_id', saisonId)
      .eq('is_active', true)
      .order('player_type'),
    supabase
      .from('pool_draft_picks')
      .select(`id, round, pool_season_id, pool_seasons (season), original_owner:poolers!original_owner_id (id, name)`)
      .eq('current_owner_id', poolerId)
      .eq('is_used', false)
      .order('pool_season_id')
      .order('round'),
  ])
  return { roster: (rosterData ?? []) as any[], picks: (picksData ?? []) as any[] }
}

export async function searchFreeAgentsAction(saisonId: number, query: string): Promise<{ players: any[] }> {
  if (query.trim().length < 2) return { players: [] }
  const supabase = await createClient()

  const { data: onRoster } = await supabase
    .from('pooler_rosters')
    .select('player_id')
    .eq('pool_season_id', saisonId)
    .eq('is_active', true)

  const takenIds = (onRoster ?? []).map((r: any) => r.player_id)
  const q = query.trim()

  let dbQuery = supabase
    .rpc('search_players_unaccent', { search_term: q })
    .select(`id, first_name, last_name, position, status, teams (code), player_contracts (season, cap_number)`)
    .limit(15)

  if (takenIds.length > 0) {
    dbQuery = dbQuery.not('id', 'in', `(${takenIds.join(',')})`)
  }

  const { data } = await dbQuery
  return { players: (data ?? []) as any[] }
}

export async function submitTransactionAction(
  saisonId: number,
  notes: string,
  items: TxItemPayload[],
  transactionDate?: string,
): Promise<{ error?: string; warning?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  return applyTransactionItems(supabase, user.id, saisonId, notes, items, transactionDate)
}

// Cœur de la mutation, séparé de submitTransactionAction pour être réutilisable par un
// appelant non-admin déjà validé autrement (ex: libre-service pooler,
// repechage-agents-libres/actions.ts) — la vérification is_admin ci-dessus reste le seul
// point d'entrée admin ; tout appelant de cette fonction doit avoir fait sa propre
// vérification d'autorisation avant (ex: restreindre items à from/to_pooler_id === l'appelant).
// userId est nullable pour le seul cas d'une mutation déclenchée automatiquement par le
// système plutôt que par un utilisateur (syncExpiredRookieProtection, admin/presaison/actions.ts)
// — transactions.created_by (nullable en base) reste alors vide plutôt que d'attribuer
// faussement l'action à quelqu'un.
export async function applyTransactionItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string | null,
  saisonId: number,
  notes: string,
  items: TxItemPayload[],
  transactionDate?: string,
): Promise<{ error?: string; warning?: string }> {
  if (items.length === 0) return { error: 'La transaction est vide.' }

  const [{ data: saison }, { data: settings }] = await Promise.all([
    supabase.from('pool_seasons').select('season, pool_cap, season_started').eq('id', saisonId).single(),
    supabase.from('app_settings').select('unsigned_player_cap_multiplier, nhl_minimum_salary').eq('id', 1).maybeSingle(),
  ])
  if (!saison) return { error: 'Saison introuvable.' }
  const unsignedMultiplier = settings?.unsigned_player_cap_multiplier ?? 1.20
  const nhlMinimumSalary = settings?.nhl_minimum_salary ?? DEFAULT_NHL_MINIMUM_SALARY

  // Pré-saison (saison active mais pas encore démarrée via /admin/nouvelle-saison) : ni
  // validation ni journalisation — voir CLAUDE.md section 6 / SUIVI_PROJET.md 2026-08-31.
  const skipEnforcement = !saison.season_started

  // Fenêtre de protection recrue (5 saisons) — même formule que gestion-effectifs/actions.ts
  // et admin/rosters/actions.ts.
  const draftYearCutoff = parseInt(saison.season.split('-')[0], 10) + 1 - 5

  // Poolers affectés
  const affectedIds = new Set<string>()
  for (const item of items) {
    if (item.from_pooler_id) affectedIds.add(item.from_pooler_id)
    if (item.to_pooler_id) affectedIds.add(item.to_pooler_id)
  }

  // Charger les rosters
  const { data: allRosters } = await supabase
    .from('pooler_rosters')
    .select(`id, pooler_id, player_id, player_type, players (id, position, nhl_id, player_contracts (season, cap_number))`)
    .in('pooler_id', Array.from(affectedIds))
    .eq('pool_season_id', saisonId)
    .eq('is_active', true)

  // Construire les rosters virtuels
  const virtual = new Map<string, VEntry[]>()
  for (const id of affectedIds) virtual.set(id, [])

  for (const entry of (allRosters ?? []) as any[]) {
    const cap = getEffectiveCap(entry.players?.player_contracts, saison.season, unsignedMultiplier).cap
    virtual.get(entry.pooler_id)!.push({
      roster_id: entry.id,
      player_id: entry.player_id,
      player_type: entry.player_type,
      position: entry.players?.position ?? null,
      cap_number: cap,
      nhl_id: entry.players?.nhl_id ?? null,
    })
  }

  // Charger les picks pour validation
  const pickIds = items.filter(i => i.pick_id).map(i => i.pick_id!)
  const pickMap = new Map<number, any>()
  if (pickIds.length > 0) {
    const { data: picks } = await supabase.from('pool_draft_picks').select('id, current_owner_id, is_used').in('id', pickIds)
    for (const p of (picks ?? [])) pickMap.set(p.id, p)
  }

  // Charger les joueurs signés (sign) pour cap + snapshot
  const signPlayerIds = items.filter(i => i.action_type === 'sign' && i.player_id).map(i => i.player_id!)
  const signPlayerMap = new Map<number, any>()
  if (signPlayerIds.length > 0) {
    const { data: sPlayers } = await supabase
      .from('players')
      .select(`id, first_name, last_name, position, nhl_id, is_rookie, draft_year, status, player_contracts (season, cap_number)`)
      .in('id', signPlayerIds)
    for (const p of (sPlayers ?? [])) signPlayerMap.set(p.id, p)
  }

  // Vérifier qu'aucun joueur signé n'est déjà actif dans la saison (unicité métier)
  if (signPlayerIds.length > 0) {
    const { data: alreadyActive } = await supabase
      .from('pooler_rosters')
      .select('player_id')
      .in('player_id', signPlayerIds)
      .eq('pool_season_id', saisonId)
      .eq('is_active', true)
    if (alreadyActive && alreadyActive.length > 0) {
      const pid = (alreadyActive[0] as any).player_id
      const sp = signPlayerMap.get(pid)
      const name = sp ? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim() : `id: ${pid}`
      return { error: `${name} est déjà actif dans un roster cette saison.` }
    }
  }

  for (const item of items) {
    const { action_type, from_pooler_id, to_pooler_id, player_id, pick_id, old_player_type, new_player_type } = item

    if (action_type === 'transfer' && pick_id) {
      const pick = pickMap.get(pick_id)
      if (!pick) return { error: `Choix introuvable (id: ${pick_id}).` }
      if (pick.is_used) return { error: `Ce choix a déjà été utilisé.` }
      if (pick.current_owner_id !== from_pooler_id) return { error: `Ce choix n'appartient pas au pooler source.` }
      continue
    }

    if (action_type === 'transfer' && player_id) {
      const fromRoster = virtual.get(from_pooler_id!)
      const entry = fromRoster?.find(e => e.player_id === player_id)
      if (!entry) return { error: `Joueur (id: ${player_id}) introuvable dans le roster source.` }
      const destType = new_player_type ?? entry.player_type
      fromRoster!.splice(fromRoster!.indexOf(entry), 1)
      virtual.get(to_pooler_id!)!.push({ roster_id: -1, player_id, player_type: destType, position: entry.position, cap_number: entry.cap_number, nhl_id: entry.nhl_id })
      continue
    }

    if (action_type === 'promote') {
      const roster = virtual.get(to_pooler_id!)!
      const entry = roster.find(e => e.player_id === player_id && e.player_type === 'recrue')
      if (!entry) return { error: `Recrue (id: ${player_id}) introuvable dans la banque.` }
      entry.player_type = new_player_type!
      continue
    }

    if (action_type === 'sign') {
      const p = signPlayerMap.get(player_id!)
      if (!p) return { error: `Joueur (id: ${player_id}) introuvable.` }
      if (new_player_type === 'recrue') {
        const eligible = !!(p.is_rookie || (p.draft_year != null && p.draft_year >= draftYearCutoff) || p.status === 'ELC')
        if (!eligible) return { error: `${p.last_name}, ${p.first_name} n'est pas admissible à la banque de recrues (protection recrue expirée et pas sur ELC).` }
      }
      const cap = getEffectiveCap(p.player_contracts, saison.season, unsignedMultiplier).cap
      virtual.get(to_pooler_id!)!.push({ roster_id: -1, player_id: player_id!, player_type: new_player_type!, position: p.position, cap_number: cap, nhl_id: p.nhl_id ?? null })
      continue
    }

    if (action_type === 'reactivate') {
      const roster = virtual.get(to_pooler_id!)!
      const entry = roster.find(e => e.player_id === player_id && e.player_type === 'ltir')
      if (!entry) return { error: `Joueur (id: ${player_id}) non trouvé en LTIR.` }
      entry.player_type = new_player_type!
      continue
    }

    if (action_type === 'release') {
      const roster = virtual.get(from_pooler_id!)!
      const entry = roster.find(e => e.player_id === player_id)
      if (!entry) return { error: `Joueur (id: ${player_id}) introuvable dans le roster.` }
      roster.splice(roster.indexOf(entry), 1)
      continue
    }

    if (action_type === 'type_change') {
      const roster = virtual.get(from_pooler_id!)!
      const entry = roster.find(e => e.player_id === player_id && e.player_type === old_player_type)
      if (!entry) return { error: `Joueur (id: ${player_id}) avec type "${old_player_type}" introuvable.` }
      entry.player_type = new_player_type!
      continue
    }
  }

  // Valider état final — sauté en pré-saison (voir skipEnforcement plus haut)
  if (!skipEnforcement) {
    for (const [poolerId, entries] of virtual) {
      const err = validateRosterLimits(
        entries.map(e => ({ player_type: e.player_type, position: e.position, capNumber: e.cap_number })),
        saison.pool_cap,
      )
      if (err) {
        const { data: p } = await supabase.from('poolers').select('name').eq('id', poolerId).single()
        return { error: `${p?.name ?? poolerId}: ${err}` }
      }
    }
  }

  // Signer un agent libre (actif/réserviste) PENDANT LA PRÉ-SAISON (repêchage AL) ne doit
  // jamais laisser un pooler sans assez d'espace pour compléter légalement son alignement
  // (12A/6D/2G actifs + min. 2 rés., au salaire minimum LNH pour chaque poste encore manquant)
  // — sinon "Démarrer la saison" (checkSeasonConformity) reste bloqué en permanence sans qu'on
  // l'ait vu venir pendant le repêchage. S'applique dans la fenêtre skipEnforcement (l'inverse
  // de validateRosterLimits ci-dessus, sauté pendant cette même fenêtre) — ce n'est pas la même
  // vérification (max de postes/cap total vs "reste-t-il de quoi finir légalement"). Ne
  // s'applique PAS en cours de saison réelle : un pooler peut y rester temporairement sous
  // effectif complet sans que ce soit un problème (voir validateRosterLimits, commentaire sur
  // le "sous-effectif temporaire"). David, 2026-09-20 — bug trouvé en pratique : une signature
  // à 5M$ acceptée en plein repêchage AL alors qu'il ne restait plus assez d'espace pour le
  // dernier réserviste requis.
  if (skipEnforcement) {
    const signToPoolerIds = new Set(
      items
        .filter(i => i.action_type === 'sign' && (i.new_player_type === 'actif' || i.new_player_type === 'reserviste'))
        .map(i => i.to_pooler_id!),
    )
    for (const poolerId of signToPoolerIds) {
      const entries = virtual.get(poolerId) ?? []
      const counts = { forward: 0, defense: 0, goalie: 0, reserviste: 0 }
      let capUsed = 0
      for (const e of entries) {
        if (e.player_type === 'actif') { counts[getPlayerBucket(e.position)]++; capUsed += e.cap_number }
        else if (e.player_type === 'reserviste') { counts.reserviste++; capUsed += e.cap_number }
      }
      const missing = Math.max(0, 12 - counts.forward) + Math.max(0, 6 - counts.defense)
        + Math.max(0, 2 - counts.goalie) + Math.max(0, 2 - counts.reserviste)
      if (missing === 0) continue
      const capSpace = saison.pool_cap - capUsed
      const capNeeded = missing * nhlMinimumSalary
      if (capSpace < capNeeded) {
        const { data: p } = await supabase.from('poolers').select('name').eq('id', poolerId).single()
        return {
          error: `${p?.name ?? poolerId} n'aurait plus assez d'espace pour compléter légalement son alignement après cette signature `
            + `(il resterait ${fmtCap(capSpace)}, il en faut au moins ${fmtCap(capNeeded)} pour combler ${missing} poste(s) manquant(s) au salaire minimum).`,
        }
      }
    }
  }

  // Enregistrer la transaction avant d'appliquer les mutations.
  // Ainsi, si une mutation échoue à mi-chemin, l'intent est toujours tracé
  // et un admin peut identifier et corriger l'état partiel.
  // (Une atomicité complète nécessiterait une fonction PostgreSQL via rpc().)
  //
  // Sans date forcée (transaction "en direct"), on reporte tout le lot à demain si un des
  // joueurs impliqués a déjà un match commencé aujourd'hui — évite qu'un même échange
  // applique le nouveau statut pour aujourd'hui à un joueur mais pas à l'autre selon
  // l'heure de son propre match (voir app/lib/gameDayLock.ts).
  let deferredToTomorrow = false
  let txTs: string
  if (transactionDate) {
    txTs = `${transactionDate}T12:00:00Z`
  } else {
    const touchedPlayerIds = items.filter(i => i.player_id).map(i => i.player_id!)
    const { effectiveAt, deferred } = await computeBatchEffectiveDate(touchedPlayerIds)
    txTs = effectiveAt
    deferredToTomorrow = deferred
  }

  const txPayload: Record<string, unknown> = { pool_season_id: saisonId, notes: notes || null, created_by: userId }
  if (transactionDate) txPayload.created_at = txTs

  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .insert(txPayload)
    .select('id')
    .single()
  if (txErr) return { error: txErr.message }

  const txItems = items.map(item => ({
    transaction_id: tx.id,
    action_type: item.action_type,
    from_pooler_id: item.from_pooler_id ?? null,
    to_pooler_id: item.to_pooler_id ?? null,
    player_id: item.player_id ?? null,
    pick_id: item.pick_id ?? null,
    old_player_type: item.old_player_type ?? null,
    new_player_type: item.new_player_type ?? null,
  }))
  const { error: itemsErr } = await supabase.from('transaction_items').insert(txItems)
  if (itemsErr) return { error: itemsErr.message }

  // Journalise chaque mutation dans roster_change_log — sans quoi statusAt()
  // (app/lib/standings.ts) ne voit jamais ces transitions et retombe sur le player_type
  // courant pour toute la fenêtre added_at→removed_at, faussant les points en rétroactif.
  async function log(playerId: number, poolerId: string, oldType: string | null, newType: string | null) {
    if (skipEnforcement) return
    await supabase.from('roster_change_log').insert({
      player_id: playerId, pooler_id: poolerId, pool_season_id: saisonId,
      change_type: pickChangeType(oldType, newType), old_type: oldType, new_type: newType,
      changed_by: null, changed_at: txTs, is_admin_override: true,
    })
  }

  // Appliquer
  const warnings: string[] = []
  if (deferredToTomorrow) {
    warnings.push("Un des joueurs impliqués a déjà un match commencé aujourd'hui — cette transaction sera effective à compter de demain.")
  }
  for (const item of items) {
    const { action_type, from_pooler_id, to_pooler_id, player_id, pick_id, old_player_type, new_player_type } = item

    if (action_type === 'transfer' && pick_id) {
      const { error } = await supabase.from('pool_draft_picks').update({ current_owner_id: to_pooler_id }).eq('id', pick_id)
      if (error) return { error: error.message }
      continue
    }

    if (action_type === 'transfer' && player_id) {
      const destType = new_player_type ?? 'actif'
      const conflict = await checkFutureRosterConflict(supabase, to_pooler_id!, player_id, saisonId, txTs, destType)
      if (conflict.error) return conflict

      // Retirer du roster source
      const { data: srcRow, error: e1 } = await supabase
        .from('pooler_rosters')
        .update({ is_active: false, removed_at: txTs })
        .eq('pooler_id', from_pooler_id!)
        .eq('player_id', player_id)
        .eq('pool_season_id', saisonId)
        .eq('is_active', true)
        .select('player_type')
        .maybeSingle()
      if (e1) return { error: e1.message }
      await log(player_id, from_pooler_id!, srcRow?.player_type ?? null, null)

      // Ajouter au roster dest
      const { data: existingDest } = await supabase.from('pooler_rosters').select('id').eq('pooler_id', to_pooler_id!).eq('player_id', player_id).eq('pool_season_id', saisonId).maybeSingle()
      // Pas de date tant que la saison n'est pas démarrée pour de vrai (David, 2026-09-02).
      if (existingDest) {
        const { error: e2 } = await supabase.from('pooler_rosters').update({ is_active: true, player_type: destType, removed_at: null, added_at: skipEnforcement ? null : txTs }).eq('id', existingDest.id)
        if (e2) return { error: e2.message }
      } else {
        const { error: e2 } = await supabase.from('pooler_rosters').insert({ pooler_id: to_pooler_id, player_id, pool_season_id: saisonId, player_type: destType, is_active: true, added_at: skipEnforcement ? null : txTs })
        if (e2) return { error: e2.message }
      }
      await log(player_id, to_pooler_id!, null, destType)
      continue
    }

    if (action_type === 'promote' || action_type === 'reactivate' || action_type === 'type_change') {
      const matchType = action_type === 'type_change' ? old_player_type : action_type === 'promote' ? 'recrue' : 'ltir'
      const poolerId = to_pooler_id ?? from_pooler_id!

      const conflict = await checkFutureRosterConflict(supabase, poolerId, player_id!, saisonId, txTs, new_player_type!)
      if (conflict.error) return conflict

      const { data: existingRow } = await supabase
        .from('pooler_rosters')
        .select('id, added_at, rookie_type, pool_draft_year')
        .eq('pooler_id', poolerId)
        .eq('player_id', player_id!)
        .eq('pool_season_id', saisonId)
        .eq('player_type', matchType!)
        .eq('is_active', true)
        .maybeSingle()
      if (!existingRow) return { error: `Joueur (id: ${player_id}) avec type "${matchType}" introuvable.` }
      const { addedAtOverride, warning } = computeTypeChangeAddedAt(existingRow.added_at, txTs)
      if (warning) warnings.push(warning)

      // Promouvoir une recrue dont la protection (5 saisons depuis le repêchage pour un
      // repêché, ELC pour un agent libre — voir isRookieProtectionExpired) est déjà expirée
      // rend la perte du statut recrue permanente et automatique au moment même de
      // l'activation — le pooler comprend qu'il ne pourra plus la remettre en banque ensuite
      // (David, 2026-09-03). Si la protection n'est pas encore VRAIMENT expirée (ex: repêché
      // encore dans ses 5 ans malgré un ELC terminé), rookie_type/pool_draft_year restent en
      // place même après activation — le pooler garde l'option de le remettre en banque plus
      // tard (David, 2026-09-14).
      let rookieClearFields = {}
      if (action_type === 'promote' && existingRow.rookie_type) {
        const { data: contract } = await supabase
          .from('player_contracts')
          .select('is_elc')
          .eq('player_id', player_id!)
          .eq('season', saison.season)
          .maybeSingle()
        const seasonStartYear = parseInt(saison.season.split('-')[0], 10)
        // Pas de ligne de contrat pour cette saison : ne veut pas dire "ELC terminé" — souvent
        // une recrue jamais signée en NHL, toujours présumée protégée (voir rookieProtection.ts).
        const isElcActive = contract ? !!contract.is_elc : true
        const expired = isRookieProtectionExpired(
          existingRow.rookie_type as 'repeche' | 'agent_libre',
          existingRow.pool_draft_year ?? null,
          isElcActive,
          seasonStartYear,
        )
        if (expired) rookieClearFields = { rookie_type: null, pool_draft_year: null }
      }

      const { error } = await supabase
        .from('pooler_rosters')
        .update({
          player_type: new_player_type,
          ...(addedAtOverride ? { added_at: addedAtOverride } : {}),
          ...rookieClearFields,
        })
        .eq('id', existingRow.id)
      if (error) return { error: error.message }
      await log(player_id!, poolerId, matchType!, new_player_type!)
      continue
    }

    if (action_type === 'sign') {
      const conflict = await checkFutureRosterConflict(supabase, to_pooler_id!, player_id!, saisonId, txTs, new_player_type!)
      if (conflict.error) return conflict

      // Signature directe en recrue (agent libre encore sur son ELC) — évite le détour par
      // /admin/init (Banque de recrues), réservé au cas repêché-par-le-pool mais plus sur
      // ELC (protection 5 saisons, pool_draft_year requis, non déductible ici).
      const rookieFields = new_player_type === 'recrue' ? { rookie_type: 'agent_libre' } : {}

      // Pas de date tant que la saison n'est pas démarrée pour de vrai (David, 2026-09-02).
      const { data: existing } = await supabase.from('pooler_rosters').select('id').eq('pooler_id', to_pooler_id!).eq('player_id', player_id!).eq('pool_season_id', saisonId).maybeSingle()
      if (existing) {
        const { error } = await supabase.from('pooler_rosters').update({ is_active: true, player_type: new_player_type!, removed_at: null, added_at: skipEnforcement ? null : txTs, ...rookieFields }).eq('id', existing.id)
        if (error) return { error: error.message }
      } else {
        const { error } = await supabase.from('pooler_rosters').insert({ pooler_id: to_pooler_id, player_id, pool_season_id: saisonId, player_type: new_player_type, is_active: true, added_at: skipEnforcement ? null : txTs, ...rookieFields })
        if (error) return { error: error.message }
      }
      await log(player_id!, to_pooler_id!, null, new_player_type!)
      continue
    }

    if (action_type === 'release') {
      const { data: relRow, error } = await supabase
        .from('pooler_rosters')
        .update({ is_active: false, removed_at: txTs })
        .eq('pooler_id', from_pooler_id!)
        .eq('player_id', player_id!)
        .eq('pool_season_id', saisonId)
        .eq('is_active', true)
        .select('player_type')
        .maybeSingle()
      if (error) return { error: error.message }
      await log(player_id!, from_pooler_id!, relRow?.player_type ?? old_player_type ?? null, null)
      // Ballotage (David, 2026-09-15) — no-op en pré-saison (createWaiverClaimForRelease
      // revérifie season_started lui-même), et déjà sauté ici en pré-saison via
      // skipEnforcement plus bas de toute façon (l'admin peut appeler applyTransactionItems
      // hors saison démarrée pour une correction historique, ce n'est pas une vraie libération).
      if (!skipEnforcement) after(() => createWaiverClaimForRelease(saisonId, player_id!, from_pooler_id!).catch(() => {}))
      continue
    }
  }

  return { warning: warnings.length > 0 ? warnings.join(' ') : undefined }
}
