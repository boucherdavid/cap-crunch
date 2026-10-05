import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveCap } from '@/lib/capUtils'
import { todayET } from '@/lib/nhlWeeklySchedule'
import type { MarketListingView, MarketRequestView } from '@/lib/tradeMarketShared'

// Marché des échanges (David, 2026-10-03) — voir supabase_migrations/trade_market.sql.
// Retrait automatique paresseux, comme le ballotage et les échanges : à chaque lecture, on
// supprime ce qui a expiré et ce que le pooler ne possède plus (joueur échangé ou libéré, choix
// échangé ou utilisé). Aucune tâche planifiée.

type Db = ReturnType<typeof createAdminClient>

export async function cleanupTradeMarket(db: Db, saisonId: number): Promise<void> {
  const today = todayET()
  await Promise.all([
    db.from('trade_market_listings').delete().eq('pool_season_id', saisonId).lt('expires_on', today),
    db.from('trade_market_requests').delete().eq('pool_season_id', saisonId).lt('expires_on', today),
  ])

  const { data: listings } = await db
    .from('trade_market_listings')
    .select('id, pooler_id, item_type, player_id, pick_id')
    .eq('pool_season_id', saisonId)
  if (!listings || listings.length === 0) return

  const playerIds = listings.filter(l => l.item_type === 'player').map(l => l.player_id as number)
  const pickIds = listings.filter(l => l.item_type === 'pick').map(l => l.pick_id as number)
  const [{ data: rosterRows }, { data: pickRows }] = await Promise.all([
    playerIds.length > 0
      ? db.from('pooler_rosters').select('pooler_id, player_id')
          .eq('pool_season_id', saisonId).eq('is_active', true)
          .in('player_type', ['actif', 'reserviste', 'ltir', 'recrue']).in('player_id', playerIds)
      : Promise.resolve({ data: [] as { pooler_id: string; player_id: number }[] }),
    pickIds.length > 0
      ? db.from('pool_draft_picks').select('id, current_owner_id, is_used').in('id', pickIds)
      : Promise.resolve({ data: [] as { id: number; current_owner_id: string; is_used: boolean }[] }),
  ])
  const owned = new Set((rosterRows ?? []).map(r => `${r.pooler_id}:${r.player_id}`))
  const pickOwner = new Map((pickRows ?? []).filter(p => !p.is_used).map(p => [p.id, p.current_owner_id]))

  const stale = listings
    .filter(l => l.item_type === 'player'
      ? !owned.has(`${l.pooler_id}:${l.player_id}`)
      : pickOwner.get(l.pick_id as number) !== l.pooler_id)
    .map(l => l.id)
  if (stale.length > 0) await db.from('trade_market_listings').delete().in('id', stale)
}

/** Nettoie puis lit le marché complet de la saison (le plus récent en premier). */
export async function loadTradeMarket(saisonId: number): Promise<{
  listings: MarketListingView[]
  requests: MarketRequestView[]
}> {
  const db = createAdminClient()
  await cleanupTradeMarket(db, saisonId)

  const [{ data: saison }, { data: settings }, { data: listingRows }, { data: requestRows }] = await Promise.all([
    db.from('pool_seasons').select('season').eq('id', saisonId).single(),
    db.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle(),
    db.from('trade_market_listings')
      .select('id, pooler_id, item_type, player_id, pick_id, note, expires_on, created_at, poolers (name)')
      .eq('pool_season_id', saisonId).order('created_at', { ascending: false }),
    db.from('trade_market_requests')
      .select('id, pooler_id, category, description, expires_on, created_at, poolers (name)')
      .eq('pool_season_id', saisonId).order('created_at', { ascending: false }),
  ])
  const season = saison?.season ?? ''
  const unsignedMultiplier = settings?.unsigned_player_cap_multiplier ?? 1.20

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (listingRows ?? []) as any[]
  const playerIds = rows.filter(r => r.item_type === 'player').map(r => r.player_id as number)
  const pickIds = rows.filter(r => r.item_type === 'pick').map(r => r.pick_id as number)
  const [{ data: players }, { data: types }, { data: picks }] = await Promise.all([
    playerIds.length > 0
      ? db.from('players').select('id, first_name, last_name, position, teams (code), player_contracts (season, cap_number, contract_status)').in('id', playerIds)
      : Promise.resolve({ data: [] }),
    playerIds.length > 0
      ? db.from('pooler_rosters').select('player_id, player_type')
          .eq('pool_season_id', saisonId).eq('is_active', true).in('player_id', playerIds)
      : Promise.resolve({ data: [] }),
    pickIds.length > 0
      ? db.from('pool_draft_picks').select('id, round, pool_seasons (season), original_owner:poolers!original_owner_id (name)').in('id', pickIds)
      : Promise.resolve({ data: [] }),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerById = new Map(((players ?? []) as any[]).map(p => [p.id, p]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typeById = new Map(((types ?? []) as any[]).map(t => [t.player_id, t.player_type]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pickById = new Map(((picks ?? []) as any[]).map(p => [p.id, p]))

  const listings: MarketListingView[] = rows.map(r => {
    const base = {
      id: r.id, poolerId: r.pooler_id, poolerName: r.poolers?.name ?? '?',
      note: r.note, expiresOn: r.expires_on, createdAt: r.created_at,
    }
    if (r.item_type === 'player') {
      const p = playerById.get(r.player_id)
      return {
        ...base, kind: 'player' as const, itemId: r.player_id,
        label: p ? `${p.first_name} ${p.last_name}` : '?',
        position: p?.position ?? null,
        teamCode: p?.teams?.code ?? null,
        playerType: typeById.get(r.player_id) ?? null,
        capNumber: p ? getEffectiveCap(p.player_contracts, season, unsignedMultiplier).cap : null,
      }
    }
    const pk = pickById.get(r.pick_id)
    const from = pk?.original_owner?.name && pk.original_owner.name !== base.poolerName ? ` (de ${pk.original_owner.name})` : ''
    return {
      ...base, kind: 'pick' as const, itemId: r.pick_id,
      label: pk ? `Choix ronde ${pk.round} — ${pk.pool_seasons?.season ?? '?'}${from}` : 'Choix de repêchage',
      position: null, teamCode: null, playerType: null, capNumber: null,
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requests: MarketRequestView[] = ((requestRows ?? []) as any[]).map(r => ({
    id: r.id, poolerId: r.pooler_id, poolerName: r.poolers?.name ?? '?',
    category: r.category, description: r.description,
    expiresOn: r.expires_on, createdAt: r.created_at,
  }))

  return { listings, requests }
}
