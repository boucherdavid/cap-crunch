import { createClient } from '@/lib/supabase/server'
import RepechageTable from './RepechageTable'
import prospectStats2026 from '@/lib/data/draftProspects2026Stats.json'

export const dynamic = 'force-dynamic'

const PROTECTION_SEASONS = 5
const NHL_RECORDS_URL = 'https://records.nhl.com/site/api/draft'

// Équipe/PJ/PTS de la dernière saison avant repêchage (David, 2026-09-22) — extraites une fois
// du fichier Excel fourni par David (voir python_script/extract_draft_prospects_2026_stats.py)
// plutôt que de la table draft_prospects (qui reste la source de /draft-center, inchangée).
// Ne couvre que le repêchage 2026 — jumelé par nom normalisé, '—' pour les autres années.
const PROSPECT_STATS_DRAFT_YEAR = 2026
const prospectStatsByName = new Map(
  (prospectStats2026 as { fullNameNorm: string; team: string | null; gamesPlayed: number | null; points: number | null }[])
    .map(p => [p.fullNameNorm, { team: p.team, games_played: p.gamesPlayed, points: p.points }]),
)

function getSaisonFinCourante() {
  const now = new Date()
  return now.getMonth() < 6 ? now.getFullYear() : now.getFullYear() + 1
}

function getAnneesDraft() {
  const fin = getSaisonFinCourante()
  const annees: number[] = []
  for (let y = fin - PROTECTION_SEASONS; y <= new Date().getFullYear(); y++) {
    annees.push(y)
  }
  return annees
}

async function fetchDraftYear(year: number) {
  try {
    const res = await fetch(`${NHL_RECORDS_URL}?cayenneExp=draftYear=${year}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data ?? []) as any[]
  } catch {
    return []
  }
}

export default async function RepechagePage() {
  const supabase = await createClient()
  const annees = getAnneesDraft()

  // Récupérer tous les picks depuis l'API NHL en parallèle
  const picksByYear = await Promise.all(annees.map((y) => fetchDraftYear(y)))
  const allPicks = picksByYear.flat()

  // Saison active pour les assignations
  const { data: saison } = await supabase
    .from('pool_seasons')
    .select('id')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .single()

  // Recrues actives : player_type='recrue' (banque) OU actif/autre avec rookie_type défini
  const { data: rosterEntries } = saison
    ? await supabase
        .from('pooler_rosters')
        .select('player_id, players(first_name, last_name, position), poolers(name)')
        .eq('pool_season_id', saison.id)
        .eq('is_active', true)
        .not('rookie_type', 'is', null)
    : { data: [] }

  // Players en DB avec draft info pour enrichir les picks API
  const { data: dbPlayers } = await supabase
    .from('players')
    .select('id, first_name, last_name, draft_year, draft_round, draft_overall')
    .not('draft_year', 'is', null)
    .range(0, 1999)

  // Map (draft_year, draft_overall) → player_id pour la correspondance principale
  const dbPickMap = new Map<string, number>(
    (dbPlayers ?? []).map((p: any) => [
      `${p.draft_year}|${p.draft_overall}`,
      p.id,
    ]),
  )

  const normName = (s: string) =>
    (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/-/g, ' ').trim()

  // Récupérer les noms des joueurs en roster via requête directe (plus fiable que le join)
  const rosterPlayerIds = [...new Set(
    (rosterEntries ?? []).map((e: any) => e.player_id as number).filter(Boolean)
  )]
  const { data: rosterPlayerData } = rosterPlayerIds.length > 0
    ? await supabase.from('players').select('id, first_name, last_name').in('id', rosterPlayerIds)
    : { data: [] }
  const rosterPlayerNames = new Map<number, { first_name: string; last_name: string }>(
    (rosterPlayerData ?? []).map((p: any) => [p.id as number, { first_name: p.first_name, last_name: p.last_name }])
  )

  // Maps pour les joueurs dans la banque de recrues
  const poolerByPlayerId = new Map<number, string>()
  const poolerByNormName = new Map<string, number>() // nom normalisé → player_id

  for (const entry of rosterEntries ?? []) {
    const pid = entry.player_id as number
    const poolerName = (entry as any).poolers?.name as string
    if (pid && poolerName) {
      poolerByPlayerId.set(pid, poolerName)
      const player = (entry as any).players ?? rosterPlayerNames.get(pid)
      if (player) {
        const key = `${normName(player.first_name)} ${normName(player.last_name)}`
        poolerByNormName.set(key, pid)
      }
    }
  }

  const matchedPlayerIds = new Set<number>()

  const picks = allPicks
    .filter((p) => p.firstName && p.lastName)
    .map((p) => {
      const dbKey = `${p.draftYear}|${p.overallPickNumber}`
      let dbPlayerId = dbPickMap.get(dbKey) ?? null

      // Si le joueur trouvé par draft_year|overall n'est pas dans un roster actif,
      // essayer par nom (cas de doublon : draft info sur le mauvais enregistrement)
      if (!dbPlayerId || !poolerByPlayerId.has(dbPlayerId)) {
        const nameKey = `${normName(p.firstName)} ${normName(p.lastName)}`
        const namePlayerId = poolerByNormName.get(nameKey) ?? null
        if (namePlayerId) dbPlayerId = namePlayerId
      }

      if (dbPlayerId) matchedPlayerIds.add(dbPlayerId)

      const prospectStat = p.draftYear === PROSPECT_STATS_DRAFT_YEAR
        ? prospectStatsByName.get(normName(`${p.firstName} ${p.lastName}`))
        : undefined

      return {
        player_id: dbPlayerId ?? p.playerId,
        first_name: p.firstName,
        last_name: p.lastName,
        position: p.position ?? null,
        draft_year: p.draftYear,
        draft_round: p.roundNumber,
        draft_overall: p.overallPickNumber,
        team_code: p.triCode ?? null,
        status: null,
        prospect_team: prospectStat?.team ?? null,
        prospect_games_played: prospectStat?.games_played ?? null,
        prospect_points: prospectStat?.points ?? null,
        pooler_name: dbPlayerId ? (poolerByPlayerId.get(dbPlayerId) ?? null) : null,
      }
    })

  // Ajouter les recrues assignées introuvables dans l'API NHL (draft info absente des deux côtés)
  for (const entry of rosterEntries ?? []) {
    const pid = entry.player_id as number
    if (!matchedPlayerIds.has(pid)) {
      const player = (entry as any).players
      const poolerName = (entry as any).poolers?.name as string
      if (player && poolerName) {
        picks.push({
          player_id: pid,
          first_name: player.first_name,
          last_name: player.last_name,
          position: player.position ?? null,
          draft_year: null,
          draft_round: null,
          draft_overall: null,
          team_code: null,
          status: null,
          prospect_team: null,
          prospect_games_played: null,
          prospect_points: null,
          pooler_name: poolerName,
        })
      }
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Repêchage LNH</h1>
        <p className="text-gray-500 text-sm mt-1">
          {"Vue d'ensemble des choix au repêchage et de leur assignation dans les banques de recrues du pool."}
        </p>
      </div>
      <RepechageTable picks={picks} />
    </div>
  )
}
