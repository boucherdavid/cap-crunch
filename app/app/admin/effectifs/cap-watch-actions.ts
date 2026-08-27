'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getEffectiveCap } from '@/lib/capUtils'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' } as const
  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' } as const
  return { supabase, user } as const
}

export type CapWatchEntry = {
  id: number
  poolerId: string
  poolerName: string
  playerId: number
  playerName: string
  status: 'watching' | 'flagged' | 'resolved' | 'admin_released'
  estimatedCap: number | null
  realCap: number | null
  createdAt: string
  flaggedAt: string | null
  deadlineAt: string | null
  resolvedAt: string | null
}

export async function loadCapWatchDataAction(saisonId: number): Promise<{
  error?: string
  entries?: CapWatchEntry[]
  unsignedMultiplier?: number
  capDeadlineDays?: number
}> {
  const supabase = await createClient()

  const [{ data: settings }, { data: rows }] = await Promise.all([
    supabase.from('app_settings').select('unsigned_player_cap_multiplier, cap_deadline_days').eq('id', 1).maybeSingle(),
    supabase
      .from('cap_signing_watch')
      .select('id, status, estimated_cap, real_cap, created_at, flagged_at, deadline_at, resolved_at, poolers(id, name), players(id, first_name, last_name)')
      .eq('pool_season_id', saisonId)
      .order('created_at', { ascending: false }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: CapWatchEntry[] = ((rows ?? []) as any[]).map(r => ({
    id: r.id,
    poolerId: r.poolers?.id ?? '',
    poolerName: r.poolers?.name ?? '?',
    playerId: r.players?.id ?? 0,
    playerName: `${r.players?.last_name}, ${r.players?.first_name}`,
    status: r.status,
    estimatedCap: r.estimated_cap,
    realCap: r.real_cap,
    createdAt: r.created_at,
    flaggedAt: r.flagged_at,
    deadlineAt: r.deadline_at,
    resolvedAt: r.resolved_at,
  }))

  return {
    entries,
    unsignedMultiplier: settings?.unsigned_player_cap_multiplier ?? 1.20,
    capDeadlineDays: settings?.cap_deadline_days ?? 7,
  }
}

export async function updateCapSettingsAction(
  unsignedMultiplier: number,
  capDeadlineDays: number,
): Promise<{ error?: string }> {
  const check = await requireAdmin()
  if ('error' in check) return check
  const { supabase } = check

  const { error } = await supabase
    .from('app_settings')
    .update({ unsigned_player_cap_multiplier: unsignedMultiplier, cap_deadline_days: capDeadlineDays })
    .eq('id', 1)
  if (error) return { error: error.message }

  revalidatePath('/admin/effectifs')
  return {}
}

export async function checkSigningsAction(saisonId: number): Promise<{
  error?: string
  newlyWatching?: number
  newlyFlagged?: number
  resolved?: number
}> {
  const check = await requireAdmin()
  if ('error' in check) return check
  const { supabase } = check

  const { data: saison } = await supabase.from('pool_seasons').select('season, pool_cap').eq('id', saisonId).single()
  if (!saison) return { error: 'Saison introuvable.' }

  const { data: settings } = await supabase
    .from('app_settings')
    .select('unsigned_player_cap_multiplier, cap_deadline_days')
    .eq('id', 1)
    .maybeSingle()
  const unsignedMultiplier = settings?.unsigned_player_cap_multiplier ?? 1.20
  const deadlineDays = settings?.cap_deadline_days ?? 7

  const { data: rosterRows } = await supabase
    .from('pooler_rosters')
    .select(`pooler_id, player_id, player_type, players (player_contracts (season, cap_number))`)
    .eq('pool_season_id', saisonId)
    .eq('is_active', true)
    .in('player_type', ['actif', 'reserviste'])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roster = (rosterRows ?? []) as any[]

  // Total de cap réel par pooler (avec le vrai contrat quand il existe, sinon 0 — sert à
  // vérifier la conformité une fois qu'un contrat surveillé devient réel)
  const realCapByPooler = new Map<string, number>()
  for (const r of roster) {
    const contracts = r.players?.player_contracts ?? []
    const real = contracts.find((c: { season: string; cap_number: number | null }) => c.season === saison.season)
    const current = realCapByPooler.get(r.pooler_id) ?? 0
    realCapByPooler.set(r.pooler_id, current + (real?.cap_number ?? 0))
  }

  const { data: existingWatches } = await supabase
    .from('cap_signing_watch')
    .select('id, pooler_id, player_id, status')
    .eq('pool_season_id', saisonId)
    .in('status', ['watching', 'flagged'])

  const watchByKey = new Map<string, { id: number; status: string }>()
  for (const w of (existingWatches ?? [])) watchByKey.set(`${w.pooler_id}:${w.player_id}`, w)

  let newlyWatching = 0
  let newlyFlagged = 0
  let resolved = 0

  // 1. Nouveaux cas à surveiller (roster actif, toujours sans contrat, pas déjà suivi)
  const toInsert: { pooler_id: string; player_id: number; pool_season_id: number; estimated_cap: number }[] = []
  for (const r of roster) {
    const contracts = r.players?.player_contracts ?? []
    const { cap, isEstimated } = getEffectiveCap(contracts, saison.season, unsignedMultiplier)
    if (!isEstimated) continue
    const key = `${r.pooler_id}:${r.player_id}`
    if (watchByKey.has(key)) continue
    toInsert.push({ pooler_id: r.pooler_id, player_id: r.player_id, pool_season_id: saisonId, estimated_cap: cap })
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from('cap_signing_watch').upsert(toInsert, {
      onConflict: 'pooler_id,player_id,pool_season_id',
      ignoreDuplicates: true,
    })
    if (error) return { error: error.message }
    newlyWatching = toInsert.length
  }

  // 2. Cas déjà surveillés : le joueur a-t-il maintenant un vrai contrat ?
  const stillEstimatedKeys = new Set(
    roster
      .filter(r => getEffectiveCap(r.players?.player_contracts ?? [], saison.season, unsignedMultiplier).isEstimated)
      .map(r => `${r.pooler_id}:${r.player_id}`),
  )

  const { sendPushToUser } = await import('@/lib/push')

  for (const w of (existingWatches ?? [])) {
    const key = `${w.pooler_id}:${w.player_id}`
    if (w.status === 'watching' && !stillEstimatedKeys.has(key)) {
      // Contrat réel maintenant connu
      const rosterRow = roster.find(r => r.pooler_id === w.pooler_id && r.player_id === w.player_id)
      const realCapPlayer = rosterRow?.players?.player_contracts?.find(
        (c: { season: string; cap_number: number | null }) => c.season === saison.season,
      )?.cap_number ?? 0
      const poolerTotal = realCapByPooler.get(w.pooler_id) ?? 0
      const overCap = poolerTotal > saison.pool_cap

      const { data: poolerRow } = await supabase.from('poolers').select('name').eq('id', w.pooler_id).single()
      const { data: playerRow } = await supabase.from('players').select('first_name, last_name').eq('id', w.player_id).single()
      const playerLabel = playerRow ? `${playerRow.last_name}, ${playerRow.first_name}` : 'Un joueur'

      if (overCap) {
        const deadlineAt = new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000).toISOString()
        await supabase.from('cap_signing_watch').update({
          status: 'flagged', real_cap: realCapPlayer, flagged_at: new Date().toISOString(), deadline_at: deadlineAt,
        }).eq('id', w.id)
        newlyFlagged++
        sendPushToUser(w.pooler_id, {
          title: 'Cap Crunch — Contrat signé, plafond dépassé',
          body: `${playerLabel} a maintenant un contrat réel et ta masse salariale dépasse le plafond. Tu as jusqu'au ${new Date(deadlineAt).toLocaleDateString('fr-CA')} pour ajuster ton alignement.`,
          url: '/gestion-effectifs',
        }).catch(() => {})
      } else {
        await supabase.from('cap_signing_watch').update({
          status: 'resolved', real_cap: realCapPlayer, resolved_at: new Date().toISOString(),
        }).eq('id', w.id)
        resolved++
        sendPushToUser(w.pooler_id, {
          title: 'Cap Crunch — Contrat signé',
          body: `${playerLabel} a maintenant un contrat réel (${new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(realCapPlayer)}). Ta masse salariale reste dans le plafond.`,
          url: '/gestion-effectifs',
        }).catch(() => {})
      }
      void poolerRow
    } else if (w.status === 'flagged') {
      // Le pooler s'est-il corrigé depuis ?
      const poolerTotal = realCapByPooler.get(w.pooler_id) ?? 0
      if (poolerTotal <= saison.pool_cap) {
        await supabase.from('cap_signing_watch').update({
          status: 'resolved', resolved_at: new Date().toISOString(),
        }).eq('id', w.id)
        resolved++
      }
    }
  }

  revalidatePath('/admin/effectifs')
  return { newlyWatching, newlyFlagged, resolved }
}

export async function releaseFlaggedPlayerAction(watchId: number): Promise<{ error?: string }> {
  const check = await requireAdmin()
  if ('error' in check) return check
  const { supabase, user } = check

  const { data: watch } = await supabase
    .from('cap_signing_watch')
    .select('id, pooler_id, player_id, pool_season_id, status')
    .eq('id', watchId)
    .single()
  if (!watch) return { error: 'Cas introuvable.' }
  if (watch.status !== 'flagged') return { error: 'Ce cas n\'est pas (ou plus) en attente.' }

  const { data: rosterRow } = await supabase
    .from('pooler_rosters')
    .select('player_type')
    .eq('pooler_id', watch.pooler_id)
    .eq('player_id', watch.player_id)
    .eq('pool_season_id', watch.pool_season_id)
    .eq('is_active', true)
    .single()
  if (!rosterRow) return { error: 'Joueur déjà retiré de cet alignement.' }

  const { submitTransactionAction } = await import('../transactions/actions')
  const result = await submitTransactionAction(watch.pool_season_id, 'Libération — plafond dépassé (délai écoulé)', [
    { action_type: 'release', from_pooler_id: watch.pooler_id, player_id: watch.player_id, old_player_type: rosterRow.player_type },
  ])
  if (result.error) return { error: result.error }

  const { error } = await supabase.from('cap_signing_watch').update({
    status: 'admin_released', released_by: user.id, resolved_at: new Date().toISOString(),
  }).eq('id', watchId)
  if (error) return { error: error.message }

  revalidatePath('/admin/effectifs')
  return {}
}
