// Calcul du facteur de plafond du pool (David, 2026-10-13) — transposition de
// calcul_salaire/calcul_facteur.py et prix_du_marche.py (méthode : calcul_salaire/resume_facteur.md).
//
//   N   = masse d'une équipe « de rêve » ÷ plafond LNH (8 équipes, toujours)
//   N*  = même équipe, chaque joueur hors ELC payé au prix du marché de son palier
//   f   = P̄ × N × [1 + λ × (N*/N − 1)], λ ∈ {0, ½, 1}, variation signalée au-delà de ±0,05
//
// Lecture seule : contrats en base + statistiques de l'API de la LNH. Rien n'est enregistré ici.

import type { SupabaseClient } from '@supabase/supabase-js'

export const FACTOR_POOLERS = 8          // fixe, pour comparer les époques (choix de David)
const SLOTS = { F: 12, D: 6, G: 2 } as const
const RESERVES = 2
export const DEFAULT_PRESSURE = 0.76     // taux de pression moyen depuis les débuts du pool
export const MAX_YEARLY_CHANGE = 0.05
export const LAMBDAS = [0, 0.5, 1] as const
// Paliers de talent : rang du joueur dans sa position (même découpage que prix_du_marche.py).
const TIERS: Record<Bucket, number[]> = { F: [16, 48, 96, 140], D: [8, 24, 48, 70], G: [8, 16, 24] }

type Bucket = 'F' | 'D' | 'G'

export type CapFactorScenario = {
  lambda: number
  raw: number            // facteur calculé, non arrondi
  factor: number         // arrondi à 2 décimales
  poolCap: number
  delta: number | null   // écart avec le facteur de la saison précédente
  outOfBounds: boolean
  bounded: number | null // facteur ramené à ±0,05 si hors borne
  boundedPoolCap: number | null
}

export type CapFactorResult = {
  season: string
  nhlCap: number
  statsSeasons: [string, string]
  pressure: number
  natural: number                  // N
  perTeam: Record<Bucket | 'R', number>
  estimated: number                // joueurs sans contrat comptés au contrat précédent × multiplicateur
  marketBase: number               // N sur les seuls contrats signés (base de comparaison du marché)
  market: number                   // N* (même base que marketBase)
  uplift: number                   // N*/N − 1
  newContracts: number
  base: number                     // P̄ × N
  previousSeason: string
  previousFactor: number | null
  currentFactor: number
  scenarios: CapFactorScenario[]
}

export function prevSeason(season: string): string {
  const start = Number(season.slice(0, 4)) - 1
  return `${start}-${String(start + 1).slice(-2)}`
}

export function poolCapFor(nhlCap: number, factor: number): number {
  return Math.ceil((nhlCap * factor) / 1_000_000) * 1_000_000
}

function bucket(position: string | null): Bucket {
  const parts = (position ?? '').toUpperCase().split(',').map(p => p.trim()).filter(Boolean)
  if (parts.includes('G')) return 'G'
  if (parts.length > 0 && parts.every(p => p === 'LD' || p === 'RD' || p === 'D')) return 'D'
  return 'F'
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

type Scoring = { goal: number; assist: number; win: number; otl: number; shutout: number }

async function fetchNhl(kind: 'skater' | 'goalie', season: string) {
  const sid = `${season.slice(0, 4)}${Number(season.slice(0, 4)) + 1}`
  const url = `https://api.nhle.com/stats/rest/en/${kind}/summary?limit=-1&cayenneExp=${encodeURIComponent(`seasonId=${sid} and gameTypeId=2`)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: 'no-store' })
  if (!res.ok) throw new Error(`API de la LNH indisponible (${res.status})`)
  const json = await res.json()
  return (json.data ?? []) as Record<string, number>[]
}

async function poolPointsBySeason(season: string, pts: Scoring): Promise<Map<number, number>> {
  const [skaters, goalies] = await Promise.all([fetchNhl('skater', season), fetchNhl('goalie', season)])
  const out = new Map<number, number>()
  for (const s of skaters) out.set(s.playerId, (s.goals ?? 0) * pts.goal + (s.assists ?? 0) * pts.assist)
  for (const g of goalies) {
    out.set(g.playerId, (g.wins ?? 0) * pts.win + (g.otLosses ?? 0) * pts.otl + (g.shutouts ?? 0) * pts.shutout)
  }
  return out
}

type Candidate = { id: number; b: Bucket; pts: number; cap: number }

/** Top 96 A / 48 D / 16 G + 16 meilleurs restants. */
function idealPool<T extends Candidate>(cands: T[]): T[] {
  const chosen: T[] = []
  const taken = new Set<number>()
  for (const b of Object.keys(SLOTS) as Bucket[]) {
    const top = cands.filter(p => p.b === b).sort((x, y) => y.pts - x.pts).slice(0, SLOTS[b] * FACTOR_POOLERS)
    chosen.push(...top)
    for (const p of top) taken.add(p.id)
  }
  const rest = cands.filter(p => !taken.has(p.id)).sort((x, y) => y.pts - x.pts)
  return [...chosen, ...rest.slice(0, RESERVES * FACTOR_POOLERS)]
}

export async function computeCapFactor(
  db: SupabaseClient,
  seasonId: number,
  pressure = DEFAULT_PRESSURE,
): Promise<CapFactorResult> {
  const { data: saison } = await db
    .from('pool_seasons').select('season, nhl_cap, cap_multiplier').eq('id', seasonId).single()
  if (!saison) throw new Error('Saison introuvable.')
  const season = saison.season as string
  const C = Number(saison.nhl_cap)
  const prev = prevSeason(season)
  const statsSeasons: [string, string] = [prevSeason(prev), prev]

  const [{ data: prevRow }, { data: settings }, { data: scoringRows }] = await Promise.all([
    db.from('pool_seasons').select('cap_multiplier').eq('season', prev).eq('is_playoff', false).maybeSingle(),
    db.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle(),
    db.from('scoring_config').select('stat_key, points').in('scope', ['regular', 'both']),
  ])
  const unsignedMultiplier = Number(settings?.unsigned_player_cap_multiplier ?? 1.2)
  const sc: Record<string, number> = {}
  for (const r of scoringRows ?? []) sc[r.stat_key] = Number(r.points)
  const scoring: Scoring = {
    goal: sc.goal ?? 1, assist: sc.assist ?? 1, win: sc.goalie_win ?? 2, otl: sc.goalie_otl ?? 1, shutout: sc.goalie_shutout ?? 2,
  }

  // Points du pool : moyenne des saisons où le joueur a joué, parmi les deux précédentes.
  const perSeason = await Promise.all(statsSeasons.map(s => poolPointsBySeason(s, scoring)))
  const pts = new Map<number, number>()
  for (const id of new Set(perSeason.flatMap(m => [...m.keys()]))) {
    const vals = perSeason.map(m => m.get(id)).filter((v): v is number => v !== undefined)
    pts.set(id, vals.reduce((a, b) => a + b, 0) / vals.length)
  }

  // Joueurs et contrats de la saison et de la précédente (pagination à tri unique).
  type Contract = { season: string; cap_number: number | null; is_elc: boolean | null }
  type PlayerRow = { id: number; nhl_id: number | null; position: string | null; player_contracts: Contract[] | null }
  const players: PlayerRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('players')
      .select('id, nhl_id, position, player_contracts (season, cap_number, is_elc)')
      .not('nhl_id', 'is', null)
      .in('player_contracts.season', [season, prev])
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    players.push(...((data ?? []) as PlayerRow[]))
    if (!data || data.length < 1000) break
  }

  // N : contrat de la saison, sinon contrat précédent × multiplicateur (comme l'app).
  type NCand = Candidate & { est: boolean }
  const nCands: NCand[] = []
  // N* : contrats réellement signés pour la saison seulement.
  type MCand = Candidate & { elc: boolean; isNew: boolean; tier: number }
  const mCands: MCand[] = []
  for (const p of players) {
    const nhlId = p.nhl_id as number
    const playerPts = pts.get(nhlId)
    if (playerPts === undefined) continue
    const byS = new Map((p.player_contracts ?? []).filter(c => c.cap_number != null).map(c => [c.season, c]))
    const now = byS.get(season)
    const before = byS.get(prev)
    const b = bucket(p.position)
    if (now) {
      nCands.push({ id: p.id, b, pts: playerPts, cap: Number(now.cap_number), est: false })
      const elc = !!now.is_elc
      const isNew = !elc && (!before || !!before.is_elc || Math.abs(Number(before.cap_number) - Number(now.cap_number)) > 1)
      mCands.push({ id: p.id, b, pts: playerPts, cap: Number(now.cap_number), elc, isNew, tier: 0 })
    } else if (before) {
      nCands.push({ id: p.id, b, pts: playerPts, cap: Number(before.cap_number) * unsignedMultiplier, est: true })
    }
  }

  const nPool = idealPool(nCands)
  const total = nPool.reduce((a, p) => a + p.cap, 0)
  const natural = total / FACTOR_POOLERS / C
  const nonReserve = nPool.slice(0, nPool.length - RESERVES * FACTOR_POOLERS)
  const perTeam = {
    F: nonReserve.filter(p => p.b === 'F').reduce((a, p) => a + p.cap, 0) / FACTOR_POOLERS,
    D: nonReserve.filter(p => p.b === 'D').reduce((a, p) => a + p.cap, 0) / FACTOR_POOLERS,
    G: nonReserve.filter(p => p.b === 'G').reduce((a, p) => a + p.cap, 0) / FACTOR_POOLERS,
    R: nPool.slice(nonReserve.length).reduce((a, p) => a + p.cap, 0) / FACTOR_POOLERS,
  }

  // Paliers de talent, puis prix du marché = médiane (en % de C) des nouveaux contrats du palier.
  for (const b of ['F', 'D', 'G'] as Bucket[]) {
    const ranked = mCands.filter(p => p.b === b).sort((x, y) => y.pts - x.pts)
    ranked.forEach((p, i) => {
      const idx = TIERS[b].findIndex(lim => i + 1 <= lim)
      p.tier = idx === -1 ? TIERS[b].length : idx
    })
  }
  const marketPrice = new Map<string, number>()
  const groups = new Map<string, number[]>()
  for (const p of mCands) {
    if (!p.isNew) continue
    const k = `${p.b}|${p.tier}`
    groups.set(k, [...(groups.get(k) ?? []), p.cap / C])
  }
  for (const [k, vals] of groups) marketPrice.set(k, median(vals))

  const mPool = idealPool(mCands)
  const marketBase = mPool.reduce((a, p) => a + p.cap, 0) / FACTOR_POOLERS / C
  const marketTotal = mPool.reduce((a, p) => a + (p.elc ? p.cap : (marketPrice.get(`${p.b}|${p.tier}`) ?? p.cap / C) * C), 0)
  const marketRatio = marketTotal / FACTOR_POOLERS / C
  const uplift = marketBase > 0 ? marketRatio / marketBase - 1 : 0

  const previousFactor = prevRow?.cap_multiplier != null ? Number(prevRow.cap_multiplier) : null
  const base = pressure * natural
  const scenarios: CapFactorScenario[] = LAMBDAS.map(lambda => {
    const raw = base * (1 + lambda * uplift)
    const factor = Math.round(raw * 100) / 100
    const delta = previousFactor != null ? Math.round((factor - previousFactor) * 100) / 100 : null
    const outOfBounds = delta != null && Math.abs(delta) > MAX_YEARLY_CHANGE + 1e-9
    const bounded = outOfBounds && previousFactor != null
      ? Math.round((previousFactor + Math.sign(delta!) * MAX_YEARLY_CHANGE) * 100) / 100
      : null
    return {
      lambda, raw, factor, poolCap: poolCapFor(C, factor), delta, outOfBounds,
      bounded, boundedPoolCap: bounded != null ? poolCapFor(C, bounded) : null,
    }
  })

  return {
    season, nhlCap: C, statsSeasons, pressure,
    natural, perTeam, estimated: nPool.filter(p => p.est).length,
    marketBase, market: marketRatio, uplift,
    newContracts: mCands.filter(p => p.isNew).length,
    base, previousSeason: prev, previousFactor, currentFactor: Number(saison.cap_multiplier),
    scenarios,
  }
}
