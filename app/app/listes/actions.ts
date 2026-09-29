'use server'

// « Mes listes » — listes privées de joueurs à surveiller (David, 2026-09-27). Deux types :
// 'joueurs' (agents libres, n'importe quel joueur pas dans un alignement) et 'recrues' (joueurs
// du dernier repêchage LNH, à repêcher le soir du pool). Tables sans politique RLS (voir
// supabase_migrations/watchlists.sql) : toutes les lectures/écritures passent par le client
// service role, TOUJOURS filtrées sur l'utilisateur connecté — aucun pooler, admin compris, ne
// voit les listes d'un autre.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type WatchlistKind = 'joueurs' | 'recrues'

export type Watchlist = { id: number; name: string; kind: WatchlistKind; itemCount: number }

export type WatchlistItem = {
  itemId: number
  playerId: number
  firstName: string
  lastName: string
  position: string | null
  team: string | null
  draftOverall: number | null
  capNumber: number | null
  note: string | null
  // Pooler qui possède le joueur dans la saison active — null = encore disponible.
  takenBy: string | null
}

export type PlayerSearchResult = {
  id: number
  firstName: string
  lastName: string
  position: string | null
  team: string | null
  draftOverall: number | null
  capNumber: number | null
  isElc: boolean
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function activeSeason(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from('pool_seasons')
    .select('id, season')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .maybeSingle()
  return data as { id: number; season: string } | null
}

/** Année du dernier repêchage LNH connu en base (ex: 2026) — base des listes « recrues ». */
async function latestDraftYear(admin: ReturnType<typeof createAdminClient>): Promise<number | null> {
  const { data } = await admin
    .from('players')
    .select('draft_year')
    .not('draft_year', 'is', null)
    .order('draft_year', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.draft_year as number | undefined) ?? null
}

/** player_id → nom du pooler, pour tous les joueurs dans un alignement de la saison active. */
async function takenMap(admin: ReturnType<typeof createAdminClient>, seasonId: number, playerIds?: number[]) {
  const map = new Map<number, string>()
  let offset = 0
  while (true) {
    let q = admin
      .from('pooler_rosters')
      .select('player_id, poolers(name)')
      .eq('pool_season_id', seasonId)
      .eq('is_active', true)
    if (playerIds) q = q.in('player_id', playerIds)
    const { data } = await q.order('id').range(offset, offset + 999)
    for (const r of data ?? []) {
      map.set(r.player_id as number, (r.poolers as unknown as { name: string } | null)?.name ?? '?')
    }
    if (!data || data.length < 1000 || playerIds) break
    offset += 1000
  }
  return map
}

async function ownList(admin: ReturnType<typeof createAdminClient>, userId: string, listId: number) {
  const { data } = await admin.from('watchlists').select('id, kind').eq('id', listId).eq('pooler_id', userId).maybeSingle()
  return data as { id: number; kind: WatchlistKind } | null
}

async function touch(admin: ReturnType<typeof createAdminClient>, listId: number) {
  await admin.from('watchlists').update({ updated_at: new Date().toISOString() }).eq('id', listId)
}

export async function listWatchlistsAction(kinds: WatchlistKind[]): Promise<{ lists: Watchlist[] }> {
  const userId = await currentUserId()
  if (!userId) return { lists: [] }
  const admin = createAdminClient()
  const { data } = await admin
    .from('watchlists')
    .select('id, name, kind, watchlist_items(count)')
    .eq('pooler_id', userId)
    .in('kind', kinds)
    .order('updated_at', { ascending: false })
  return {
    lists: (data ?? []).map(l => ({
      id: l.id as number,
      name: l.name as string,
      kind: l.kind as WatchlistKind,
      itemCount: (l.watchlist_items as unknown as { count: number }[])?.[0]?.count ?? 0,
    })),
  }
}

export async function createWatchlistAction(kind: WatchlistKind, name: string): Promise<{ error?: string; id?: number }> {
  const userId = await currentUserId()
  if (!userId) return { error: 'Non authentifié.' }
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Donne un nom à la liste.' }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('watchlists')
    .insert({ pooler_id: userId, kind, name: trimmed.slice(0, 100) })
    .select('id')
    .single()
  if (error) return { error: error.code === '23505' ? 'Tu as déjà une liste de ce nom.' : error.message }
  return { id: data.id as number }
}

export async function renameWatchlistAction(listId: number, name: string): Promise<{ error?: string }> {
  const userId = await currentUserId()
  if (!userId) return { error: 'Non authentifié.' }
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Donne un nom à la liste.' }
  const admin = createAdminClient()
  if (!await ownList(admin, userId, listId)) return { error: 'Liste introuvable.' }
  const { error } = await admin.from('watchlists').update({ name: trimmed.slice(0, 100), updated_at: new Date().toISOString() }).eq('id', listId)
  if (error) return { error: error.code === '23505' ? 'Tu as déjà une liste de ce nom.' : error.message }
  return {}
}

export async function deleteWatchlistAction(listId: number): Promise<{ error?: string }> {
  const userId = await currentUserId()
  if (!userId) return { error: 'Non authentifié.' }
  const admin = createAdminClient()
  if (!await ownList(admin, userId, listId)) return { error: 'Liste introuvable.' }
  const { error } = await admin.from('watchlists').delete().eq('id', listId)
  return error ? { error: error.message } : {}
}

export async function getWatchlistItemsAction(listId: number): Promise<{ error?: string; items?: WatchlistItem[] }> {
  const userId = await currentUserId()
  if (!userId) return { error: 'Non authentifié.' }
  const admin = createAdminClient()
  if (!await ownList(admin, userId, listId)) return { error: 'Liste introuvable.' }

  const { data } = await admin
    .from('watchlist_items')
    .select('id, player_id, note, rank, players(first_name, last_name, position, draft_overall, teams(code), player_contracts(season, cap_number))')
    .eq('watchlist_id', listId)
    .order('rank')
    .order('id')
  const rows = data ?? []

  const season = await activeSeason(admin)
  const taken = season && rows.length > 0
    ? await takenMap(admin, season.id, rows.map(r => r.player_id as number))
    : new Map<number, string>()

  type Row = {
    first_name: string; last_name: string; position: string | null; draft_overall: number | null
    teams: { code: string } | null; player_contracts: { season: string; cap_number: number | null }[]
  }
  return {
    items: rows.map(r => {
      const p = r.players as unknown as Row | null
      const contract = p?.player_contracts?.find(c => c.season === season?.season)
      return {
        itemId: r.id as number,
        playerId: r.player_id as number,
        firstName: p?.first_name ?? '',
        lastName: p?.last_name ?? '',
        position: p?.position ?? null,
        team: p?.teams?.code ?? null,
        draftOverall: p?.draft_overall ?? null,
        capNumber: contract?.cap_number ?? null,
        note: (r.note as string | null) ?? null,
        takenBy: taken.get(r.player_id as number) ?? null,
      }
    }),
  }
}

export async function addWatchlistItemAction(listId: number, playerId: number): Promise<{ error?: string }> {
  const userId = await currentUserId()
  if (!userId) return { error: 'Non authentifié.' }
  const admin = createAdminClient()
  if (!await ownList(admin, userId, listId)) return { error: 'Liste introuvable.' }
  const { data: last } = await admin
    .from('watchlist_items').select('rank').eq('watchlist_id', listId)
    .order('rank', { ascending: false }).limit(1).maybeSingle()
  const { error } = await admin
    .from('watchlist_items')
    .insert({ watchlist_id: listId, player_id: playerId, rank: ((last?.rank as number | undefined) ?? 0) + 1 })
  if (error) return { error: error.code === '23505' ? 'Ce joueur est déjà dans la liste.' : error.message }
  await touch(admin, listId)
  return {}
}

export async function removeWatchlistItemAction(listId: number, itemId: number): Promise<{ error?: string }> {
  const userId = await currentUserId()
  if (!userId) return { error: 'Non authentifié.' }
  const admin = createAdminClient()
  if (!await ownList(admin, userId, listId)) return { error: 'Liste introuvable.' }
  const { error } = await admin.from('watchlist_items').delete().eq('id', itemId).eq('watchlist_id', listId)
  if (error) return { error: error.message }
  await touch(admin, listId)
  return {}
}

/** Réécrit l'ordre complet de la liste (ids d'items dans l'ordre voulu). */
export async function reorderWatchlistAction(listId: number, itemIds: number[]): Promise<{ error?: string }> {
  const userId = await currentUserId()
  if (!userId) return { error: 'Non authentifié.' }
  const admin = createAdminClient()
  if (!await ownList(admin, userId, listId)) return { error: 'Liste introuvable.' }
  for (const [i, id] of itemIds.entries()) {
    const { error } = await admin.from('watchlist_items').update({ rank: i + 1 }).eq('id', id).eq('watchlist_id', listId)
    if (error) return { error: error.message }
  }
  await touch(admin, listId)
  return {}
}

export async function setWatchlistNoteAction(listId: number, itemId: number, note: string): Promise<{ error?: string }> {
  const userId = await currentUserId()
  if (!userId) return { error: 'Non authentifié.' }
  const admin = createAdminClient()
  if (!await ownList(admin, userId, listId)) return { error: 'Liste introuvable.' }
  const trimmed = note.trim().slice(0, 200)
  const { error } = await admin.from('watchlist_items').update({ note: trimmed || null }).eq('id', itemId).eq('watchlist_id', listId)
  return error ? { error: error.message } : {}
}

export type SearchOptions = {
  query?: string
  position?: 'forward' | 'defense' | 'goalie'
  teamCode?: string
  maxSalary?: number
  elcOnly?: boolean
  sort?: 'salary' | 'name' | 'team' | 'draft'
}

function posBucket(position: string | null): 'forward' | 'defense' | 'goalie' {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

export async function listWatchlistTeamsAction(): Promise<{ teams: { code: string; name: string }[] }> {
  const admin = createAdminClient()
  const { data } = await admin.from('teams').select('code, name').order('code')
  return { teams: data ?? [] }
}

/**
 * Recherche de joueurs DISPONIBLES à ajouter (jamais un joueur déjà dans un alignement de la
 * saison active — c'est tout l'intérêt : éviter de nommer un joueur déjà pris). Filtres et
 * navigation sans nom, comme /simulation (David, 2026-09-27) — pratique quand on a oublié un nom.
 * 'recrues' = joueurs du dernier repêchage LNH seulement (salaire/ELC sans objet).
 * 'joueurs' sans nom = joueurs avec un contrat pour la saison active (évite les milliers de
 * fiches sans contrat) ; avec un nom, tous les joueurs correspondants.
 */
export async function searchWatchlistPlayersAction(
  kind: WatchlistKind,
  opts: SearchOptions,
): Promise<{ players: PlayerSearchResult[]; truncated: boolean }> {
  const empty = { players: [], truncated: false }
  const userId = await currentUserId()
  if (!userId) return empty
  const q = (opts.query ?? '').trim()

  const admin = createAdminClient()
  const season = await activeSeason(admin)
  const draftYear = kind === 'recrues' ? await latestDraftYear(admin) : null
  if (kind === 'recrues' && draftYear == null) return empty

  // Recherche insensible aux accents (même RPC que /admin/transactions).
  let ids: number[] | null = null
  if (q.length >= 2) {
    const { data } = await admin.rpc('search_players_unaccent', { search_term: q }).select('id').limit(300)
    const found = ((data ?? []) as { id: number }[]).map(p => p.id)
    if (found.length === 0) return empty
    ids = found
  }

  const needContract = kind === 'joueurs' && season && (!ids || opts.maxSalary != null || opts.elcOnly)
  const contractsSelect = needContract ? 'player_contracts!inner(season, cap_number, is_elc)' : 'player_contracts(season, cap_number, is_elc)'
  const teamsSelect = opts.teamCode ? 'teams!inner(code)' : 'teams(code)'
  const buildQuery = () => {
    let dbQuery = admin.from('players').select(`id, first_name, last_name, position, draft_overall, ${teamsSelect}, ${contractsSelect}`)
    if (ids) dbQuery = dbQuery.in('id', ids)
    if (draftYear != null) dbQuery = dbQuery.eq('draft_year', draftYear)
    if (opts.teamCode) dbQuery = dbQuery.eq('teams.code', opts.teamCode)
    if (needContract && season) {
      dbQuery = dbQuery.eq('player_contracts.season', season.season).not('player_contracts.cap_number', 'is', null)
      if (opts.maxSalary != null) dbQuery = dbQuery.lte('player_contracts.cap_number', opts.maxSalary)
      if (opts.elcOnly) dbQuery = dbQuery.eq('player_contracts.is_elc', true)
    }
    return dbQuery.order('id')
  }
  // Tout charger (par pages de 1000, ~1500 joueurs sous contrat) avant de trier : les joueurs
  // pris et le filtre de position sont retirés après coup, et le tri par salaire doit porter
  // sur l'ensemble, pas sur les 1000 premiers.
  const data: unknown[] = []
  for (let offset = 0; offset < 5000; offset += 1000) {
    const { data: page } = await buildQuery().range(offset, offset + 999)
    data.push(...(page ?? []))
    if (!page || page.length < 1000) break
  }

  type Row = {
    id: number; first_name: string; last_name: string; position: string | null; draft_overall: number | null
    teams: { code: string } | null; player_contracts: { season: string; cap_number: number | null; is_elc: boolean }[] | null
  }
  const rows = data as Row[]
  // Au-delà de ~200 ids, la liste d'ids ferait une URL trop longue : on charge plutôt tous les
  // joueurs pris de la saison (quelques centaines de lignes).
  const taken = season && rows.length > 0
    ? await takenMap(admin, season.id, rows.length <= 200 ? rows.map(r => r.id) : undefined)
    : new Map()

  let players: PlayerSearchResult[] = rows
    .filter(r => !taken.has(r.id))
    .filter(r => !opts.position || posBucket(r.position) === opts.position)
    .map(r => {
      const c = r.player_contracts?.find(x => x.season === season?.season)
      return {
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        position: r.position ?? null,
        team: r.teams?.code ?? null,
        draftOverall: r.draft_overall ?? null,
        capNumber: c?.cap_number ?? null,
        isElc: c?.is_elc ?? false,
      }
    })

  const sort = opts.sort ?? (kind === 'recrues' ? 'draft' : 'salary')
  players.sort((a, b) => {
    if (sort === 'draft') return (a.draftOverall ?? 9999) - (b.draftOverall ?? 9999)
    if (sort === 'salary') return (b.capNumber ?? -1) - (a.capNumber ?? -1) || a.lastName.localeCompare(b.lastName)
    if (sort === 'team') return (a.team ?? 'ZZZ').localeCompare(b.team ?? 'ZZZ') || a.lastName.localeCompare(b.lastName)
    return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  })

  const limit = 150
  const truncated = players.length > limit
  players = players.slice(0, limit)
  return { players, truncated }
}
