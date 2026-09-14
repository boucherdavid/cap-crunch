'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getEffectiveCap } from '@/lib/capUtils'

function posBucket(position: string | null): 'forward' | 'defense' | 'goalie' {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

export type SimulationPlayerResult = {
  id: number
  first_name: string
  last_name: string
  position: string | null
  cap_number: number
  is_elc: boolean
  team_code: string | null
  // null = agent libre ; sinon le nom du pooler qui le possède actuellement.
  owner_name: string | null
}

// Recherche pour /simulation — variante de searchSandboxFreeAgentsAction
// (repechage-agents-libres/actions.ts) gardée séparée exprès pour ne rien changer au bac à
// sable pré-saison. Différence voulue par David (2026-09-14) : les joueurs déjà possédés par
// un AUTRE pooler restent dans les résultats (pratique pour simuler une transaction), au lieu
// d'être exclus comme dans le bac à sable — seulement annotés `owner_name` pour que ce soit
// clair qu'ils ne sont pas réellement disponibles. Seuls les joueurs déjà dans l'alignement du
// pooler courant sont exclus (déjà visibles dans la colonne de gauche).
export async function searchSimulationPlayersAction(
  saisonId: number,
  opts: { query?: string; position?: 'forward' | 'defense' | 'goalie'; maxSalary?: number; elcOnly?: boolean; teamCode?: string },
): Promise<{ players: SimulationPlayerResult[]; truncated: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { players: [], truncated: false }

  const { data: saison } = await supabase.from('pool_seasons').select('season').eq('id', saisonId).single()
  if (!saison) return { players: [], truncated: false }

  const q = (opts.query ?? '').trim()

  const { data: onRoster } = await supabase
    .from('pooler_rosters')
    .select('player_id, pooler_id, poolers(name)')
    .eq('pool_season_id', saisonId)
    .eq('is_active', true)
  const ownerByPlayer = new Map<number, string>()
  const ownIds = new Set<number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (onRoster ?? []) as any[]) {
    if (r.pooler_id === user.id) { ownIds.add(r.player_id); continue }
    ownerByPlayer.set(r.player_id, r.poolers?.name ?? '?')
  }

  const contractsSelect = 'player_contracts!inner (season, cap_number, is_elc)'
  const teamsSelect = opts.teamCode ? 'teams!inner (code)' : 'teams (code)'
  const selectStr = `id, first_name, last_name, position, ${teamsSelect}, ${contractsSelect}`

  let dbQuery = supabase.from('players').select(selectStr)
  if (q.length >= 2) {
    const safeQ = q.replace(/[,()]/g, '')
    dbQuery = dbQuery.or(`first_name.ilike.%${safeQ}%,last_name.ilike.%${safeQ}%`)
  }
  dbQuery = dbQuery.eq('player_contracts.season', saison.season)
  dbQuery = dbQuery.not('player_contracts.cap_number', 'is', null)
  if (opts.maxSalary != null) dbQuery = dbQuery.lte('player_contracts.cap_number', opts.maxSalary)
  if (opts.elcOnly) dbQuery = dbQuery.eq('player_contracts.is_elc', true)
  if (opts.teamCode) dbQuery = dbQuery.eq('teams.code', opts.teamCode)
  if (ownIds.size > 0) dbQuery = dbQuery.not('id', 'in', `(${Array.from(ownIds).join(',')})`)
  const limit = q.length >= 2 ? 15 : (opts.teamCode ? 40 : 150)
  dbQuery = dbQuery.order('teams(code)', { ascending: true }).order('last_name').limit(limit)

  const { data } = await dbQuery
  const truncated = (data ?? []).length >= limit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players: SimulationPlayerResult[] = ((data ?? []) as any[]).map(p => {
    const contract = (p.player_contracts ?? []).find((c: { season: string }) => c.season === saison.season)
    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      position: p.position ?? null,
      team_code: p.teams?.code ?? null,
      cap_number: contract?.cap_number ?? 0,
      is_elc: contract?.is_elc ?? false,
      owner_name: ownerByPlayer.get(p.id) ?? null,
    }
  })

  const filtered = opts.position ? players.filter(p => posBucket(p.position) === opts.position) : players

  // Agents libres d'abord, puis même tri que le bac à sable (équipe → salaire décroissant →
  // alphabétique).
  filtered.sort((a, b) =>
    (a.owner_name ? 1 : 0) - (b.owner_name ? 1 : 0)
    || (a.team_code ?? '').localeCompare(b.team_code ?? '')
    || b.cap_number - a.cap_number
    || a.last_name.localeCompare(b.last_name),
  )

  return { players: filtered, truncated }
}

export type SimRosterEntry = {
  roster_id: number
  player_id: number
  player_type: string
  playerName: string
  firstName: string
  lastName: string
  position: string | null
  cap_number: number
  isEstimatedCap: boolean
}

// Version allégée de loadPresaisonDataAction (admin/presaison/actions.ts) — seulement
// l'alignement et le cap d'UN pooler (pas de mécanique de file d'attente/tour de repêchage,
// qui ne s'applique pas ici). Utilisable à l'année (voir /simulation, David, 2026-09-14).
// Paramétrée par poolerId plutôt que figée sur l'utilisateur courant (David, 2026-09-14 suite
// — onglet Transaction) : un alignement de pooler est déjà consultable publiquement sur
// /poolers/[id], donc aucun souci à le charger en lecture pour un autre pooler que soi-même.
// Inclut désormais 'ltir' (exclu du cap, voir capUtils) — auparavant seulement actif/reserviste,
// ce qui empêchait de simuler une mise sur IR.
export async function loadRosterForSimulationAction(saisonId: number, poolerId: string): Promise<{
  error?: string
  roster?: SimRosterEntry[]
  poolCap?: number
  season?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { data: saison } = await supabase.from('pool_seasons').select('pool_cap, season').eq('id', saisonId).single()
  if (!saison) return { error: 'Saison introuvable.' }

  const { data: settings } = await supabase.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle()
  const unsignedMultiplier = settings?.unsigned_player_cap_multiplier ?? 1.20

  const { data: rows } = await supabase
    .from('pooler_rosters')
    .select('id, player_id, player_type, players (first_name, last_name, position, player_contracts (season, cap_number, is_elc))')
    .eq('pooler_id', poolerId)
    .eq('pool_season_id', saisonId)
    .eq('is_active', true)
    .in('player_type', ['actif', 'reserviste', 'ltir'])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roster: SimRosterEntry[] = ((rows ?? []) as any[]).map(r => {
    const contracts = r.players?.player_contracts ?? []
    const { cap, isEstimated } = getEffectiveCap(contracts, saison.season, unsignedMultiplier)
    return {
      roster_id: r.id,
      player_id: r.player_id,
      player_type: r.player_type,
      playerName: `${r.players?.last_name}, ${r.players?.first_name}`,
      firstName: r.players?.first_name ?? '',
      lastName: r.players?.last_name ?? '',
      position: r.players?.position ?? null,
      cap_number: cap,
      isEstimatedCap: isEstimated,
    }
  })

  return { roster, poolCap: saison.pool_cap, season: saison.season }
}

// Poolers autres que l'utilisateur courant — pour le sélecteur de l'onglet Transaction
// (David, 2026-09-14).
export async function listOtherPoolersAction(): Promise<{ poolers: { id: string; name: string }[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { poolers: [] }

  const { data } = await supabase.from('poolers').select('id, name').neq('id', user.id).order('name')
  return { poolers: data ?? [] }
}

// Même requête que loadOwnRecrueBankAction (repechage-agents-libres/actions.ts) mais
// paramétrée par poolerId — pour afficher la banque de recrues de l'AUTRE pooler dans l'onglet
// Transaction. Composition de banque déjà visible publiquement sur /poolers/[id], aucun souci
// à la lire pour un autre pooler que soi-même.
export async function loadRecrueBankForPoolerAction(saisonId: number, poolerId: string): Promise<{
  players: { roster_id: number; player_id: number; name: string; position: string | null; cap_number: number }[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { players: [] }

  const { data } = await supabase
    .from('pooler_rosters')
    .select('id, player_id, players (first_name, last_name, position, player_contracts (season, cap_number))')
    .eq('pooler_id', poolerId)
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

// ── Scénarios sauvegardés (simulation_scenarios) ────────────────────────────
// RLS admin-only sur la table (même patron que push_subscriptions/transactions) — tout accès
// passe par le client service role ici, après vérification que pooler_id correspond bien à
// l'utilisateur authentifié.

export type ScenarioData = {
  removed: number[]
  added: {
    id: number; first_name: string; last_name: string; position: string | null; cap_number: number
    playerType: 'actif' | 'reserviste' | 'ltir'; ownerName: string | null
  }[]
  addedRecrues: { id: number; playerType: 'actif' | 'reserviste' | 'ltir' }[]
  // Statuts actif/réserviste/ltir choisis pour des joueurs déjà dans l'alignement (David,
  // 2026-09-14 suite) — absent des anciens scénarios sauvegardés avant cet ajout, `?? []`
  // requis chez l'appelant.
  currentTypeOverrides: { playerId: number; playerType: 'actif' | 'reserviste' | 'ltir' }[]
}

export async function listScenariosAction(saisonId: number): Promise<{ scenarios: { id: number; name: string; updated_at: string }[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { scenarios: [] }

  const admin = createAdminClient()
  const { data } = await admin
    .from('simulation_scenarios')
    .select('id, name, updated_at')
    .eq('pooler_id', user.id)
    .eq('pool_season_id', saisonId)
    .order('updated_at', { ascending: false })

  return { scenarios: data ?? [] }
}

export async function loadScenarioAction(scenarioId: number): Promise<{ error?: string; data?: ScenarioData }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const admin = createAdminClient()
  const { data: row } = await admin.from('simulation_scenarios').select('pooler_id, data').eq('id', scenarioId).maybeSingle()
  if (!row || row.pooler_id !== user.id) return { error: 'Scénario introuvable.' }

  return { data: row.data as ScenarioData }
}

export async function saveScenarioAction(saisonId: number, name: string, data: ScenarioData): Promise<{ error?: string; id?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Donne un nom au scénario.' }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('simulation_scenarios')
    .upsert(
      { pooler_id: user.id, pool_season_id: saisonId, name: trimmed, data, updated_at: new Date().toISOString() },
      { onConflict: 'pooler_id,pool_season_id,name' },
    )
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/simulation')
  return { id: row.id }
}

export async function deleteScenarioAction(scenarioId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const admin = createAdminClient()
  const { data: row } = await admin.from('simulation_scenarios').select('pooler_id').eq('id', scenarioId).maybeSingle()
  if (!row || row.pooler_id !== user.id) return { error: 'Scénario introuvable.' }

  const { error } = await admin.from('simulation_scenarios').delete().eq('id', scenarioId)
  if (error) return { error: error.message }

  revalidatePath('/simulation')
  return {}
}
