import type { SupabaseClient } from '@supabase/supabase-js'
import { getEffectiveCap } from '@/lib/capUtils'
import { getPlayerBucket, ACTIVE_LIMITS, BUCKET_LABELS, type Bucket } from '@/lib/rosterLimits'

export type ConformityIssue = { poolerId: string; poolerName: string; reasons: string[] }

const fmtCap = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

// Vérifie que chaque pooler de la saison respecte exactement les règles du pool (CLAUDE.md
// section 1) : 12 attaquants / 6 défenseurs / 2 gardiens actifs (exactement, pas "au plus" —
// contrairement à loadPresaisonDataAction, qui n'affiche qu'un avertissement informatif),
// minimum 2 réservistes, masse salariale ≤ cap du pool. Utilisé par "Démarrer la saison"
// (app/app/admin/nouvelle-saison/actions.ts) comme condition bloquante.
export async function checkSeasonConformity(
  supabase: SupabaseClient,
  saisonId: number,
): Promise<{ error?: string; issues: ConformityIssue[]; totalPoolers: number }> {
  const [{ data: saison }, { data: poolers }, { data: rosters }, { data: settings }] = await Promise.all([
    supabase.from('pool_seasons').select('season, pool_cap').eq('id', saisonId).single(),
    supabase.from('poolers').select('id, name').order('name'),
    supabase
      .from('pooler_rosters')
      .select(`id, pooler_id, player_id, player_type, rookie_type, pool_draft_year,
        players (position, player_contracts (season, cap_number, is_elc))`)
      .eq('pool_season_id', saisonId)
      .eq('is_active', true),
    supabase.from('app_settings').select('unsigned_player_cap_multiplier').eq('id', 1).maybeSingle(),
  ])

  if (!saison) return { error: 'Saison introuvable.', issues: [], totalPoolers: 0 }
  const unsignedMultiplier = settings?.unsigned_player_cap_multiplier ?? 1.20
  const seasonStartYear = parseInt(saison.season.split('-')[0], 10)

  type PoolerAcc = {
    name: string
    counts: Record<Bucket, number>
    reservistes: number
    capUsed: number
  }
  const acc = new Map<string, PoolerAcc>()
  for (const p of (poolers ?? [])) {
    acc.set(p.id, { name: p.name, counts: { forward: 0, defense: 0, goalie: 0 }, reservistes: 0, capUsed: 0 })
  }

  for (const entry of (rosters ?? []) as any[]) {
    const info = acc.get(entry.pooler_id)
    if (!info) continue

    const contracts: any[] = entry.players?.player_contracts ?? []
    const currentContract = contracts.find((c: any) => c.season === saison.season)
    const capNum = getEffectiveCap(contracts, saison.season, unsignedMultiplier).cap
    const pos: string | null = entry.players?.position ?? null
    let type: string = entry.player_type

    // Même reclassification que loadPresaisonDataAction (presaison/actions.ts) : une recrue
    // dont la protection a expiré (5 saisons pour un repêché, fin d'ELC pour un agent libre)
    // compte comme un actif normal ; une recrue encore protégée est exclue des comptages.
    if (type === 'recrue') {
      const rookieType: string | null = entry.rookie_type ?? null
      const draftYear: number | null = entry.pool_draft_year ?? null
      let isExpired = false
      if (rookieType === 'repeche' && draftYear !== null) {
        isExpired = (seasonStartYear - draftYear) >= 5
      } else if (rookieType === 'agent_libre') {
        isExpired = !currentContract?.is_elc
      } else {
        continue
      }
      if (!isExpired) continue
      type = 'actif'
    }

    if (type === 'actif' || type === 'reserviste') info.capUsed += capNum
    if (type === 'actif') info.counts[getPlayerBucket(pos)]++
    if (type === 'reserviste') info.reservistes++
  }

  const issues: ConformityIssue[] = []
  for (const [poolerId, info] of acc) {
    const reasons: string[] = []
    for (const bucket of (['forward', 'defense', 'goalie'] as Bucket[])) {
      if (info.counts[bucket] !== ACTIVE_LIMITS[bucket]) {
        reasons.push(`${info.counts[bucket]} / ${ACTIVE_LIMITS[bucket]} ${BUCKET_LABELS[bucket]}`)
      }
    }
    if (info.reservistes < 2) {
      reasons.push(`${info.reservistes} réserviste${info.reservistes > 1 ? 's' : ''} (minimum 2)`)
    }
    if (info.capUsed > saison.pool_cap) {
      reasons.push(`Cap dépassé (${fmtCap(info.capUsed)} / ${fmtCap(saison.pool_cap)})`)
    }
    if (reasons.length > 0) {
      issues.push({ poolerId, poolerName: info.name, reasons })
    }
  }

  return { issues, totalPoolers: acc.size }
}
