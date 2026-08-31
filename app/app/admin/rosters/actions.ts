'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

function revalidateRosterPages() {
  revalidatePath('/admin/init')
  revalidatePath('/poolers')
  revalidatePath('/poolers/[id]', 'page')
  revalidatePath('/classement')
  revalidatePath('/dashboard')
}

const ACTIVE_LIMITS = { forward: 12, defense: 6, goalie: 2 } as const
type Bucket = keyof typeof ACTIVE_LIMITS

const BUCKET_LABELS: Record<Bucket, string> = {
  forward: 'attaquants actifs',
  defense: 'défenseurs actifs',
  goalie: 'gardiens actifs',
}

type PlayerType = 'actif' | 'recrue' | 'reserviste' | 'ltir'


function getPlayerBucket(position: string | null): Bucket {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

async function countActiveByBucket(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolerId: string,
  saisonId: number,
  bucket: Bucket,
  excludeEntryId?: number,
): Promise<number> {
  const { data } = await supabase
    .from('pooler_rosters')
    .select('id, players(position)')
    .eq('pooler_id', poolerId)
    .eq('pool_season_id', saisonId)
    .eq('player_type', 'actif')
    .eq('is_active', true)

  return (data ?? []).filter((r: any) => {
    if (excludeEntryId && r.id === excludeEntryId) return false
    return getPlayerBucket(r.players?.position ?? null) === bucket
  }).length
}

function detectChangeType(
  oldType: PlayerType | null,
  newType: PlayerType,
  isRemoval = false,
): string {
  if (isRemoval) return oldType === 'actif' ? 'deactivation' : 'retrait'
  if (!oldType) {
    const map: Record<PlayerType, string> = {
      actif:      'activation',
      reserviste: 'ajout_reserviste',
      recrue:     'ajout_recrue',
      ltir:       'ltir',
    }
    return map[newType]
  }
  if (newType === 'actif') return 'activation'
  if (oldType === 'actif') return 'deactivation'
  if (newType === 'ltir') return 'ltir'
  if (oldType === 'ltir') return 'retour_ltir'
  return 'changement_type'
}

async function getDraftYearCutoff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  saisonId: number,
): Promise<number> {
  const { data: season } = await supabase.from('pool_seasons').select('season').eq('id', saisonId).single()
  const saisonFin = season ? parseInt(season.season.split('-')[0], 10) + 1 : new Date().getFullYear()
  return saisonFin - 5
}

async function logChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: number,
  poolerId: string,
  poolSeasonId: number,
  changeType: string,
  oldType: string | null,
  newType: string | null,
): Promise<void> {
  await supabase.from('roster_change_log').insert({
    player_id:      playerId,
    pooler_id:      poolerId,
    pool_season_id: poolSeasonId,
    change_type:    changeType,
    old_type:       oldType,
    new_type:       newType,
    changed_by:     null, // null = admin; pooler_id ici quand self-service implémenté
  })
}

// addPlayerAction / updateRookieTypeAction / removePlayerAction sont utilisées exclusivement
// par la Banque de recrues (Initialisation, `/admin/init?tab=recrues`) — même philosophie
// "sans historique" que adminInitRosterAction : aucune écriture dans roster_change_log, et
// un retrait supprime la ligne au lieu de la désactiver (David, 2026-08-31 — même bug que
// Mode init : des lignes désactivées sans trace s'affichaient comme "PARTI" dans Mon équipe).

export async function addPlayerAction(
  poolerId: string,
  playerId: number,
  saisonId: number,
  playerType: PlayerType,
  rookieType?: 'repeche' | 'agent_libre',
  poolDraftYear?: number,
): Promise<{ error?: string; id?: number }> {
  const supabase = await createClient()

  if (playerType === 'recrue') {
    const [{ data: player }, draftYearCutoff] = await Promise.all([
      supabase.from('players').select('is_rookie, draft_year').eq('id', playerId).single(),
      getDraftYearCutoff(supabase, saisonId),
    ])
    const isEligible = player?.is_rookie || (player?.draft_year != null && player.draft_year >= draftYearCutoff)
    if (!isEligible) {
      return { error: 'Seuls les joueurs recrues peuvent aller dans la banque de recrues.' }
    }
    if (!rookieType) {
      return { error: 'Le type de recrue (repêché ou agent libre) est requis.' }
    }
  }

  if (playerType === 'actif') {
    const { data: player } = await supabase.from('players').select('position').eq('id', playerId).single()
    const bucket = getPlayerBucket(player?.position ?? null)
    const count = await countActiveByBucket(supabase, poolerId, saisonId, bucket)
    if (count >= ACTIVE_LIMITS[bucket]) {
      return { error: `Limite atteinte pour les ${BUCKET_LABELS[bucket]} (${ACTIVE_LIMITS[bucket]}).` }
    }
  }

  const rookieFields = rookieType
    ? { rookie_type: rookieType, pool_draft_year: rookieType === 'repeche' ? poolDraftYear : null }
    : {}

  // Si une entrée inactive existe déjà (soft-delete), la réactiver plutôt qu'insérer
  const { data: existing } = await supabase
    .from('pooler_rosters')
    .select('id')
    .eq('pooler_id', poolerId)
    .eq('player_id', playerId)
    .eq('pool_season_id', saisonId)
    .maybeSingle()

  let rosterId: number
  if (existing) {
    const { error } = await supabase
      .from('pooler_rosters')
      .update({ is_active: true, player_type: playerType, removed_at: null, ...rookieFields })
      .eq('id', existing.id)
    if (error) return { error: error.message }
    rosterId = existing.id
  } else {
    const { data: inserted, error } = await supabase.from('pooler_rosters').insert({
      pooler_id:      poolerId,
      player_id:      playerId,
      pool_season_id: saisonId,
      player_type:    playerType,
      is_active:      true,
      ...rookieFields,
    }).select('id').single()
    if (error) return { error: error.message }
    rosterId = inserted.id
  }

  revalidateRosterPages()
  return { id: rosterId }
}

export async function updateRookieTypeAction(
  rosterId: number,
  rookieType: 'repeche' | 'agent_libre',
  poolDraftYear?: number,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('pooler_rosters')
    .update({
      rookie_type:    rookieType,
      pool_draft_year: rookieType === 'repeche' ? (poolDraftYear ?? null) : null,
    })
    .eq('id', rosterId)
  if (error) return { error: error.message }
  revalidateRosterPages()
  return {}
}

export async function removePlayerAction(rosterId: number): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: entry } = await supabase
    .from('pooler_rosters')
    .select('player_id, player_type, pooler_id, pool_season_id')
    .eq('id', rosterId)
    .single()

  if (entry?.player_type === 'reserviste') {
    const { count } = await supabase
      .from('pooler_rosters')
      .select('id', { count: 'exact', head: true })
      .eq('pooler_id', entry.pooler_id)
      .eq('pool_season_id', entry.pool_season_id)
      .eq('player_type', 'reserviste')
      .eq('is_active', true)

    if ((count ?? 0) <= 2) {
      return { error: 'Un minimum de 2 réservistes est requis.' }
    }
  }

  const { error } = await supabase
    .from('pooler_rosters')
    .delete()
    .eq('id', rosterId)

  if (error) return { error: error.message }
  revalidateRosterPages()
  return {}
}

type AddEntry = {
  player_id:      number
  player_type:    PlayerType
  rookie_type?:   'repeche' | 'agent_libre'
  pool_draft_year?: number
}

type ChangeTypeEntry = {
  entryId: number
  newType: PlayerType
}

// ─── Mode init : sans validations, sans snapshots, sans notifications ─────────

export async function adminInitRosterAction(
  poolerId: string,
  saisonId: number,
  toAdd: AddEntry[],
  toRemove: number[],
  toChangeType: ChangeTypeEntry[],
): Promise<{ error?: string }> {
  const supabase = createAdminClient() // bypass RLS — l'admin modifie le roster d'un autre pooler

  const { data: saisonConfig } = await supabase
    .from('pool_seasons')
    .select('saison_start_date')
    .eq('id', saisonId)
    .single()

  const initAddedAt = saisonConfig?.saison_start_date
    ? `${saisonConfig.saison_start_date}T12:00:00Z`
    : new Date().toISOString()

  // Retraits — suppression complète (pas de désactivation) : Mode init ne journalise rien
  // dans roster_change_log, donc une ligne désactivée sans trace ne serait qu'un résidu
  // fantôme (affiché comme "PARTI" dans l'historique de buildStandings sans explication —
  // bug trouvé par David le 2026-08-31).
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('pooler_rosters')
      .delete()
      .in('id', toRemove)
    if (error) return { error: error.message }
  }

  // Changements de type
  for (const { entryId, newType } of toChangeType) {
    const { error } = await supabase
      .from('pooler_rosters')
      .update({ player_type: newType })
      .eq('id', entryId)
    if (error) return { error: error.message }
  }

  // Ajouts
  for (const entry of toAdd) {
    // Retire le joueur des autres rosters actifs pour cette saison — suppression complète,
    // même raison que pour les retraits ci-dessus.
    await supabase
      .from('pooler_rosters')
      .delete()
      .eq('player_id', entry.player_id)
      .eq('pool_season_id', saisonId)
      .eq('is_active', true)
      .neq('pooler_id', poolerId)

    const rookieFields = entry.rookie_type
      ? { rookie_type: entry.rookie_type, pool_draft_year: entry.rookie_type === 'repeche' ? (entry.pool_draft_year ?? null) : null }
      : {}

    // Supprime toute entrée existante pour ce pooler+joueur+saison (active ou non)
    await supabase
      .from('pooler_rosters')
      .delete()
      .eq('pooler_id', poolerId)
      .eq('player_id', entry.player_id)
      .eq('pool_season_id', saisonId)

    const { error: insertErr } = await supabase.from('pooler_rosters').insert({
      pooler_id:      poolerId,
      player_id:      entry.player_id,
      pool_season_id: saisonId,
      player_type:    entry.player_type,
      is_active:      true,
      added_at:       initAddedAt,
      ...rookieFields,
    })
    if (insertErr) return { error: insertErr.message }
  }

  revalidateRosterPages()
  return {}
}

export async function viderRostersAction(saisonId: number): Promise<{ error?: string; deleted?: number }> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }
  const { data: me } = await userClient.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return { error: 'Accès refusé.' }

  const supabase = createAdminClient()
  const { error, count } = await supabase
    .from('pooler_rosters')
    .delete({ count: 'exact' })
    .eq('pool_season_id', saisonId)

  if (error) return { error: error.message }
  revalidateRosterPages()
  return { deleted: count ?? 0 }
}

export async function submitRosterAction(
  poolerId: string,
  saisonId: number,
  toAdd: AddEntry[],
  toRemove: number[],
  toChangeType: ChangeTypeEntry[],
): Promise<{ error?: string }> {
  const supabase = await createClient()

  // Récupérer le roster courant pour validation et détection des types
  const { data: current } = await supabase
    .from('pooler_rosters')
    .select('id, player_id, player_type, players(position, is_rookie, draft_year, nhl_id)')
    .eq('pooler_id', poolerId)
    .eq('pool_season_id', saisonId)
    .eq('is_active', true)

  const currentMap = new Map(
    (current ?? []).map((r: any) => [r.id, r]),
  )

  const removeSet = new Set(toRemove)
  const changeMap = new Map(toChangeType.map(c => [c.entryId, c.newType]))

  type FinalEntry = { player_type: string; position: string | null; is_rookie: boolean }
  const finalEntries: FinalEntry[] = []

  const draftYearCutoff = await getDraftYearCutoff(supabase, saisonId)

  for (const row of (current ?? []) as any[]) {
    if (removeSet.has(row.id)) continue
    const newType = changeMap.get(row.id) ?? row.player_type
    if (newType === 'recrue') {
      const isEligible = row.players?.is_rookie || (row.players?.draft_year != null && row.players.draft_year >= draftYearCutoff)
      if (!isEligible) {
        return { error: `Seuls les joueurs recrues peuvent aller dans la banque de recrues.` }
      }
    }
    finalEntries.push({
      player_type: newType,
      position:    row.players?.position ?? null,
      is_rookie:   row.players?.is_rookie ?? false,
    })
  }

  for (const entry of toAdd) {
    const { data: player } = await supabase.from('players').select('position, is_rookie, draft_year').eq('id', entry.player_id).single()
    const isEligible = player?.is_rookie || (player?.draft_year != null && player.draft_year >= draftYearCutoff)
    if (entry.player_type === 'recrue' && !isEligible) {
      return { error: `Seuls les joueurs recrues peuvent aller dans la banque de recrues.` }
    }
    finalEntries.push({
      player_type: entry.player_type,
      position:    player?.position ?? null,
      is_rookie:   player?.is_rookie ?? false,
    })
  }

  // Validation de l'état final
  const actifs = finalEntries.filter(e => e.player_type === 'actif')
  const reservistes = finalEntries.filter(e => e.player_type === 'reserviste')

  const counts = actifs.reduce(
    (acc, e) => { acc[getPlayerBucket(e.position)] += 1; return acc },
    { forward: 0, defense: 0, goalie: 0 } as Record<Bucket, number>,
  )

  for (const bucket of (['forward', 'defense', 'goalie'] as Bucket[])) {
    if (counts[bucket] > ACTIVE_LIMITS[bucket]) {
      return { error: `Limite dépassée pour les ${BUCKET_LABELS[bucket]} (${ACTIVE_LIMITS[bucket]} max).` }
    }
  }

  if (reservistes.length < 2) {
    return { error: `Un minimum de 2 réservistes est requis (${reservistes.length} dans cet alignement).` }
  }

  // Application — retraits
  for (const rosterId of toRemove) {
    const row = currentMap.get(rosterId) as any
    if (!row) continue
    const oldType = row.player_type as PlayerType
    const changeType = detectChangeType(oldType, oldType, true)
    await logChange(supabase, row.player_id, poolerId, saisonId, changeType, oldType, null)
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('pooler_rosters')
      .update({ is_active: false, removed_at: new Date().toISOString() })
      .in('id', toRemove)
    if (error) return { error: error.message }
  }

  // Application — changements de type
  for (const { entryId, newType } of toChangeType) {
    const row = currentMap.get(entryId) as any
    const oldType = (row?.player_type ?? null) as PlayerType | null
    const { error } = await supabase.from('pooler_rosters').update({ player_type: newType }).eq('id', entryId)
    if (error) return { error: error.message }

    if (oldType !== newType) {
      const changeType = detectChangeType(oldType, newType)
      await logChange(supabase, row.player_id, poolerId, saisonId, changeType, oldType, newType)
    }
  }

  // Application — ajouts
  for (const entry of toAdd) {
    const rookieFields = entry.rookie_type
      ? { rookie_type: entry.rookie_type, pool_draft_year: entry.rookie_type === 'repeche' ? (entry.pool_draft_year ?? null) : null }
      : {}

    const { data: existing } = await supabase
      .from('pooler_rosters')
      .select('id')
      .eq('pooler_id', poolerId)
      .eq('player_id', entry.player_id)
      .eq('pool_season_id', saisonId)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('pooler_rosters')
        .update({ is_active: true, player_type: entry.player_type, removed_at: null, ...rookieFields })
        .eq('id', existing.id)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase.from('pooler_rosters').insert({
        pooler_id:      poolerId,
        player_id:      entry.player_id,
        pool_season_id: saisonId,
        player_type:    entry.player_type,
        is_active:      true,
        ...rookieFields,
      })
      if (error) return { error: error.message }
    }

    const changeType = detectChangeType(null, entry.player_type)
    await logChange(supabase, entry.player_id, poolerId, saisonId, changeType, null, entry.player_type)
  }

  revalidateRosterPages()
  return {}
}
