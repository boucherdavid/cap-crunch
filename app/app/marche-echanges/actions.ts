'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers } from '@/lib/push'
import { todayET, addDays } from '@/lib/nhlWeeklySchedule'
import { MARKET_CATEGORY_LABEL, type MarketCategory } from '@/lib/tradeMarketShared'

// Marché des échanges (David, 2026-10-03) — écritures par createAdminClient(), après avoir
// vérifié que l'utilisateur possède bien ce qu'il met sur le marché (même patron que
// trade-actions.ts / waiver-actions.ts).

const MAX_DAYS = 90

function validateExpiry(expiresOn: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return 'Date d\'expiration invalide.'
  const today = todayET()
  if (expiresOn < today) return 'La date d\'expiration est déjà passée.'
  if (expiresOn > addDays(today, MAX_DAYS)) return `La date d'expiration doit être dans les ${MAX_DAYS} prochains jours.`
  return null
}

async function currentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function notifyOthers(db: ReturnType<typeof createAdminClient>, selfId: string, title: string, body: string) {
  const { data: others } = await db.from('poolers').select('id').neq('id', selfId)
  await sendPushToUsers((others ?? []).map(p => p.id), { title, body, url: '/marche-echanges' })
}

export type NewListingItem = { kind: 'player' | 'pick'; id: number }

export async function addMarketListingsAction(
  saisonId: number, items: NewListingItem[], note: string, expiresOn: string,
): Promise<{ error?: string }> {
  const user = await currentUser()
  if (!user) return { error: 'Non authentifié.' }
  if (items.length === 0) return { error: 'Choisis au moins un joueur ou un choix de repêchage.' }
  const expiryError = validateExpiry(expiresOn)
  if (expiryError) return { error: expiryError }
  const cleanNote = note.trim().slice(0, 300) || null

  const db = createAdminClient()
  const playerIds = items.filter(i => i.kind === 'player').map(i => i.id)
  const pickIds = items.filter(i => i.kind === 'pick').map(i => i.id)
  const [{ data: rosterRows }, { data: pickRows }, { data: me }] = await Promise.all([
    playerIds.length > 0
      ? db.from('pooler_rosters').select('player_id, players (first_name, last_name)')
          .eq('pool_season_id', saisonId).eq('pooler_id', user.id).eq('is_active', true)
          .in('player_type', ['actif', 'reserviste', 'ltir', 'recrue']).in('player_id', playerIds)
      : Promise.resolve({ data: [] }),
    pickIds.length > 0
      ? db.from('pool_draft_picks').select('id, round, current_owner_id, is_used, pool_seasons (season)').in('id', pickIds)
      : Promise.resolve({ data: [] }),
    db.from('poolers').select('name').eq('id', user.id).single(),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownedPlayers = (rosterRows ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownedPicks = ((pickRows ?? []) as any[]).filter(p => p.current_owner_id === user.id && !p.is_used)
  if (ownedPlayers.length !== new Set(playerIds).size || ownedPicks.length !== new Set(pickIds).size) {
    return { error: 'Un des éléments choisis ne fait plus partie de ton alignement.' }
  }

  const rows = [
    ...ownedPlayers.map(r => ({ item_type: 'player', player_id: r.player_id, pick_id: null })),
    ...ownedPicks.map(p => ({ item_type: 'pick', player_id: null, pick_id: p.id })),
  ].map(r => ({ ...r, pool_season_id: saisonId, pooler_id: user.id, note: cleanNote, expires_on: expiresOn }))

  // Remet à jour la note et l'expiration d'un élément déjà sur le marché plutôt que d'échouer
  // sur l'index unique.
  const existingPlayers = rows.filter(r => r.player_id != null).map(r => r.player_id as number)
  const existingPicks = rows.filter(r => r.pick_id != null).map(r => r.pick_id as number)
  await Promise.all([
    existingPlayers.length > 0
      ? db.from('trade_market_listings').delete().eq('pool_season_id', saisonId).eq('pooler_id', user.id).in('player_id', existingPlayers)
      : null,
    existingPicks.length > 0
      ? db.from('trade_market_listings').delete().eq('pool_season_id', saisonId).eq('pooler_id', user.id).in('pick_id', existingPicks)
      : null,
  ])
  const { error } = await db.from('trade_market_listings').insert(rows)
  if (error) return { error: error.message }

  const labels = [
    ...ownedPlayers.map(r => `${r.players?.first_name ?? ''} ${r.players?.last_name ?? ''}`.trim()),
    ...ownedPicks.map(p => `choix de ronde ${p.round} (${p.pool_seasons?.season ?? '?'})`),
  ]
  const shown = labels.slice(0, 3).join(', ') + (labels.length > 3 ? ` et ${labels.length - 3} autre${labels.length - 3 > 1 ? 's' : ''}` : '')
  await notifyOthers(db, user.id, 'Marché des échanges', `${me?.name ?? 'Un pooler'} met sur le marché : ${shown}`)

  revalidatePath('/marche-echanges')
  revalidatePath('/')
  return {}
}

export async function removeMarketListingAction(listingId: number): Promise<{ error?: string }> {
  const user = await currentUser()
  if (!user) return { error: 'Non authentifié.' }
  const db = createAdminClient()
  const { error } = await db.from('trade_market_listings').delete().eq('id', listingId).eq('pooler_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/marche-echanges')
  revalidatePath('/')
  return {}
}

export async function addMarketRequestAction(
  saisonId: number, category: MarketCategory | null, description: string, expiresOn: string,
): Promise<{ error?: string }> {
  const user = await currentUser()
  if (!user) return { error: 'Non authentifié.' }
  const text = description.trim().slice(0, 300)
  if (!text) return { error: 'Décris ce que tu cherches.' }
  if (category && !(category in MARKET_CATEGORY_LABEL)) return { error: 'Catégorie invalide.' }
  const expiryError = validateExpiry(expiresOn)
  if (expiryError) return { error: expiryError }

  const db = createAdminClient()
  const { error } = await db.from('trade_market_requests').insert({
    pool_season_id: saisonId, pooler_id: user.id, category, description: text, expires_on: expiresOn,
  })
  if (error) return { error: error.message }

  const { data: me } = await db.from('poolers').select('name').eq('id', user.id).single()
  await notifyOthers(db, user.id, 'Marché des échanges', `${me?.name ?? 'Un pooler'} cherche : ${text}`)

  revalidatePath('/marche-echanges')
  revalidatePath('/')
  return {}
}

export async function removeMarketRequestAction(requestId: number): Promise<{ error?: string }> {
  const user = await currentUser()
  if (!user) return { error: 'Non authentifié.' }
  const db = createAdminClient()
  const { error } = await db.from('trade_market_requests').delete().eq('id', requestId).eq('pooler_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/marche-echanges')
  revalidatePath('/')
  return {}
}
