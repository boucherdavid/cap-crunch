'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveCap } from '@/lib/capUtils'
import {
  createTradeOffer, respondToTradeOffer, confirmTradeReady, resolveExpiredTradeOffers,
  type TradeItemInput, type TradeExtraAction,
} from '@/lib/tradeOffers'

// ─── Parcourir les actifs échangeables d'un pooler (soi-même ou un autre — déjà public via
// /poolers/[id], voir app/app/simulation/actions.ts pour le même principe) ────────────────────

export type TradeableItem =
  | { kind: 'player'; playerId: number; name: string; position: string | null; teamCode: string | null; playerType: 'actif' | 'reserviste' | 'recrue'; capNumber: number }
  | { kind: 'pick'; pickId: number; round: number; season: string }

export async function listTradeableAssetsAction(poolerId: string, saisonId: number): Promise<TradeableItem[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const [{ data: saison }, { data: settings }, { data: rosterRows }, { data: pickRows }] = await Promise.all([
    supabase.from('pool_seasons').select('season').eq('id', saisonId).single(),
    supabase.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle(),
    supabase
      .from('pooler_rosters')
      .select('player_id, player_type, players (first_name, last_name, position, teams (code), player_contracts (season, cap_number))')
      .eq('pooler_id', poolerId).eq('pool_season_id', saisonId).eq('is_active', true)
      .in('player_type', ['actif', 'reserviste', 'recrue']),
    supabase
      .from('pool_draft_picks')
      .select('id, round, pool_seasons (season)')
      .eq('current_owner_id', poolerId).eq('is_used', false),
  ])
  const season = saison?.season ?? ''
  const unsignedMultiplier = settings?.unsigned_player_cap_multiplier ?? 1.20

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players: TradeableItem[] = ((rosterRows ?? []) as any[]).map(r => ({
    kind: 'player' as const,
    playerId: r.player_id,
    name: `${r.players?.last_name ?? ''}, ${r.players?.first_name ?? ''}`,
    position: r.players?.position ?? null,
    teamCode: r.players?.teams?.code ?? null,
    playerType: r.player_type,
    capNumber: getEffectiveCap(r.players?.player_contracts, season, unsignedMultiplier).cap,
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const picks: TradeableItem[] = ((pickRows ?? []) as any[]).map(p => ({
    kind: 'pick' as const,
    pickId: p.id,
    round: p.round,
    season: p.pool_seasons?.season ?? '',
  }))

  return [...players, ...picks]
}

// ─── Proposer ─────────────────────────────────────────────────────────────────

export type ProposeTradeInput = {
  targetPoolerId: string
  myItems: { kind: 'player' | 'pick'; id: number }[]
  theirItems: { kind: 'player' | 'pick'; id: number }[]
}

export async function proposeTradeOfferAction(saisonId: number, input: ProposeTradeInput): Promise<{ error?: string; id?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  if (input.myItems.length === 0 && input.theirItems.length === 0) return { error: 'Ajoute au moins un item.' }

  const items: TradeItemInput[] = [
    ...input.myItems.map(i => ({
      itemType: i.kind, fromPoolerId: user.id,
      playerId: i.kind === 'player' ? i.id : undefined,
      pickId: i.kind === 'pick' ? i.id : undefined,
    })),
    ...input.theirItems.map(i => ({
      itemType: i.kind, fromPoolerId: input.targetPoolerId,
      playerId: i.kind === 'player' ? i.id : undefined,
      pickId: i.kind === 'pick' ? i.id : undefined,
    })),
  ]

  return createTradeOffer(saisonId, user.id, input.targetPoolerId, items)
}

// ─── Répondre / confirmer ───────────────────────────────────────────────────────

export async function respondToTradeOfferAction(tradeOfferId: number, accept: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  return respondToTradeOffer(tradeOfferId, user.id, accept)
}

export async function confirmTradeReadyAction(
  tradeOfferId: number, chosenTypes: Record<number, 'actif' | 'reserviste'>, extraActions: TradeExtraAction[] = [],
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  return confirmTradeReady(tradeOfferId, user.id, chosenTypes, extraActions)
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export type TradeOfferItemView = {
  kind: 'player' | 'pick'
  id: number // player_id ou pick_id selon `kind` — nécessaire pour choisir le type à la confirmation
  label: string
  fromPoolerId: string
  toPoolerId: string
  chosenType: 'actif' | 'reserviste' | null
  // Type actuel du joueur chez le donneur au moment de la lecture (null pour un choix) — sert
  // à savoir si la confirmation doit proposer un choix Actif/Réserviste : une recrue échangée
  // reste une recrue chez le receveur, aucun choix à faire (voir executeTradeOffer,
  // app/lib/tradeOffers.ts).
  currentPlayerType: 'actif' | 'reserviste' | 'recrue' | null
}

export type TradeOfferView = {
  id: number
  status: string
  isProposer: boolean
  otherPoolerName: string
  createdAt: string
  completionDeadline: string | null
  myReady: boolean
  otherReady: boolean
  give: TradeOfferItemView[]
  receive: TradeOfferItemView[]
}

async function resolveItemLabels(
  db: ReturnType<typeof createAdminClient>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[],
): Promise<Map<string, string>> {
  const playerIds = items.filter(i => i.item_type === 'player').map(i => i.player_id)
  const pickIds = items.filter(i => i.item_type === 'pick').map(i => i.pick_id)
  const map = new Map<string, string>()

  if (playerIds.length > 0) {
    const { data } = await db.from('players').select('id, first_name, last_name, position').in('id', playerIds)
    for (const p of data ?? []) map.set(`player-${p.id}`, `${p.last_name}, ${p.first_name}${p.position ? ` (${p.position})` : ''}`)
  }
  if (pickIds.length > 0) {
    const { data } = await db.from('pool_draft_picks').select('id, round, pool_seasons (season)').in('id', pickIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (data ?? []) as any[]) map.set(`pick-${p.id}`, `Choix ronde ${p.round} (${p.pool_seasons?.season ?? '?'})`)
  }
  return map
}

export async function getMyTradeOffersAction(saisonId: number): Promise<{
  error?: string
  offers?: TradeOfferView[]
  history?: TradeOfferView[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const userId = user.id

  await resolveExpiredTradeOffers(saisonId)

  const db = createAdminClient()
  const { data: rows } = await db
    .from('trade_offers')
    .select('id, status, proposer_pooler_id, target_pooler_id, created_at, completion_deadline, proposer_ready_at, target_ready_at, proposer:poolers!proposer_pooler_id (name), target:poolers!target_pooler_id (name)')
    .eq('pool_season_id', saisonId)
    .or(`proposer_pooler_id.eq.${userId},target_pooler_id.eq.${userId}`)
    .order('id', { ascending: false })
    .limit(50)
  if (!rows) return { offers: [], history: [] }

  const activeStatuses = new Set(['pending_target', 'pending_admin', 'pending_completion'])
  const activeRows = rows.filter(r => activeStatuses.has(r.status))
  const historyRows = rows.filter(r => !activeStatuses.has(r.status)).slice(0, 10)

  type RawItem = { id: number; trade_offer_id: number; from_pooler_id: string; to_pooler_id: string; item_type: string; player_id: number | null; pick_id: number | null; chosen_type: string | null }
  const relevantIds = [...activeRows, ...historyRows].map(r => r.id)
  const itemsByOffer = new Map<number, RawItem[]>()
  let allItems: RawItem[] = []
  if (relevantIds.length > 0) {
    const { data } = await db
      .from('trade_offer_items')
      .select('id, trade_offer_id, from_pooler_id, to_pooler_id, item_type, player_id, pick_id, chosen_type')
      .in('trade_offer_id', relevantIds)
    allItems = data ?? []
  }
  const labels = await resolveItemLabels(db, allItems)
  for (const item of allItems) {
    if (!itemsByOffer.has(item.trade_offer_id)) itemsByOffer.set(item.trade_offer_id, [])
    itemsByOffer.get(item.trade_offer_id)!.push(item)
  }

  // Type actuel (chez le donneur) des joueurs impliqués — pour savoir si un choix
  // actif/réserviste doit être proposé à la confirmation (jamais pour une recrue, voir
  // TradeOfferItemView.currentPlayerType ci-dessus).
  const playerTypeById = new Map<number, 'actif' | 'reserviste' | 'recrue'>()
  const involvedPlayerIds = allItems.filter(i => i.item_type === 'player').map(i => i.player_id!)
  if (involvedPlayerIds.length > 0) {
    const { data: typeRows } = await db
      .from('pooler_rosters').select('player_id, player_type')
      .eq('pool_season_id', saisonId).eq('is_active', true).in('player_id', involvedPlayerIds)
    for (const row of typeRows ?? []) playerTypeById.set(row.player_id, row.player_type as 'actif' | 'reserviste' | 'recrue')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function toView(r: any): TradeOfferView {
    const isProposer = r.proposer_pooler_id === userId
    const items = itemsByOffer.get(r.id) ?? []
    const toItemView = (item: typeof items[number]): TradeOfferItemView => ({
      kind: item.item_type as 'player' | 'pick',
      id: (item.item_type === 'player' ? item.player_id : item.pick_id) ?? 0,
      label: labels.get(`${item.item_type}-${item.item_type === 'player' ? item.player_id : item.pick_id}`) ?? '?',
      fromPoolerId: item.from_pooler_id,
      toPoolerId: item.to_pooler_id,
      chosenType: item.chosen_type as 'actif' | 'reserviste' | null,
      currentPlayerType: item.item_type === 'player' ? (playerTypeById.get(item.player_id!) ?? null) : null,
    })
    return {
      id: r.id,
      status: r.status,
      isProposer,
      otherPoolerName: isProposer ? (r.target?.name ?? '—') : (r.proposer?.name ?? '—'),
      createdAt: r.created_at,
      completionDeadline: r.completion_deadline,
      myReady: isProposer ? !!r.proposer_ready_at : !!r.target_ready_at,
      otherReady: isProposer ? !!r.target_ready_at : !!r.proposer_ready_at,
      give: items.filter(i => i.from_pooler_id === userId).map(toItemView),
      receive: items.filter(i => i.to_pooler_id === userId).map(toItemView),
    }
  }

  return { offers: activeRows.map(toView), history: historyRows.map(toView) }
}
