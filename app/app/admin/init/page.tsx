import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminTabBar } from '@/components/AdminTabBar'
import { AdminHubBackLink } from '@/components/AdminHubBackLink'
import ErrorBoundary from '@/components/ErrorBoundary'
import { fetchAllPages } from '@/lib/supabase/fetch-all'
import RosterManager from '../rosters/RosterManager'
import BanqueRecruesManager from '../recrues/BanqueRecruesManager'
import PresaisonManager from '../presaison/PresaisonManager'
import PicksManager from '../presaison/PicksManager'
import { SaisonSelectNav } from './SaisonSelectNav'
import { type Pick, type Pooler } from '../config/PicksEditor'

export const dynamic = 'force-dynamic'

// Réglages one-shot déjà en place pour la saison courante — affichés comme onglets.
const TABS = [
  { id: 'rosters',   label: 'Rosters initiaux' },
  { id: 'recrues',   label: 'Banque de recrues' },
  { id: 'choix',     label: 'Choix de repêchage' },
]
// Pré-saison reste une étape valide (accédée depuis /admin/nouvelle-saison) mais
// n'apparaît plus comme onglet cliquable ici — ce n'est plus un réglage "déjà fait".
const VALID_TABS = [...TABS.map(t => t.id), 'presaison']

async function fetchAllRookies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  draftYearCutoff: number
) {
  const PAGE = 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = []
  let offset = 0
  const orFilter = `is_rookie.eq.true,draft_year.gte.${draftYearCutoff}`
  while (true) {
    const { data } = await supabase
      .from('players')
      .select('id, first_name, last_name, position, status, draft_year, draft_round, draft_overall, teams(code)')
      .or(orFilter)
      .range(offset, offset + PAGE - 1)
    all.push(...(data ?? []))
    if ((data ?? []).length < PAGE) break
    offset += PAGE
  }
  return all
}

export default async function AdminInitPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saisonId?: string; poolerId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) redirect('/')

  const { tab = 'rosters', saisonId, poolerId } = await searchParams
  const activeTab = VALID_TABS.includes(tab) ? tab : 'rosters'
  const parsedSaisonId = saisonId ? parseInt(saisonId, 10) : NaN
  const cameFromHub = !isNaN(parsedSaisonId)

  // ── Rosters ───────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let poolersRosters: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let players: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saisonRosters: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saisonsRosters: any[] = []
  let allTakenPlayerIds: number[] = []
  let playerOwnerMap: Record<number, string> = {}
  if (activeTab === 'rosters') {
    const { data: allSaisons } = await supabase
      .from('pool_seasons')
      .select('id, season, pool_cap, nhl_cap, is_active')
      .eq('is_playoff', false)
      .order('season', { ascending: false })
    saisonsRosters = allSaisons ?? []
    saisonRosters = (!isNaN(parsedSaisonId) && saisonsRosters.find(s => s.id === parsedSaisonId))
      || saisonsRosters.find(s => s.is_active)
      || saisonsRosters[0]
      || null
    const [pr, pl, tr] = await Promise.all([
      supabase.from('poolers').select('id, name').order('name'),
      fetchAllPages(async (from, to) =>
        supabase
          .from('players')
          .select('id, first_name, last_name, position, status, is_available, is_rookie, draft_year, draft_round, draft_overall, teams(code), player_contracts(season, cap_number)')
          .order('last_name')
          .range(from, to),
      ),
      saisonRosters
        ? supabase.from('pooler_rosters').select('player_id, pooler_id, poolers(name)').eq('pool_season_id', saisonRosters.id).eq('is_active', true)
        : Promise.resolve({ data: [] as { player_id: number; pooler_id: string; poolers: { name: string } | null }[] }),
    ])
    poolersRosters = pr.data ?? []
    players = pl as unknown[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const takenRows = (tr.data ?? []) as any[]
    allTakenPlayerIds = takenRows.map(r => r.player_id)
    for (const r of takenRows) {
      playerOwnerMap[r.player_id] = (r.poolers as { name?: string } | null)?.name ?? r.pooler_id
    }
  }

  // ── Recrues ───────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let poolersRecrues: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rookies: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saisonRecrues: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saisonsRecrues: any[] = []
  if (activeTab === 'recrues') {
    const { data: allSaisons } = await supabase
      .from('pool_seasons')
      .select('id, season, is_active')
      .eq('is_playoff', false)
      .order('season', { ascending: false })
    saisonsRecrues = allSaisons ?? []
    saisonRecrues = (!isNaN(parsedSaisonId) && saisonsRecrues.find(s => s.id === parsedSaisonId))
      || saisonsRecrues.find(s => s.is_active)
      || saisonsRecrues[0]
      || null
    const saisonFin = saisonRecrues
      ? parseInt(saisonRecrues.season.split('-')[0], 10) + 1
      : new Date().getFullYear()
    const draftYearCutoff = saisonFin - 5
    const [pr, rk] = await Promise.all([
      supabase.from('poolers').select('id, name').order('name'),
      fetchAllRookies(supabase, draftYearCutoff),
    ])
    poolersRecrues = pr.data ?? []
    rookies = rk
  }

  // ── Pré-saison ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saisonsPresaison: any[] = []
  let defaultPresaisonId: number | null = null
  if (activeTab === 'presaison') {
    const { data } = await supabase.from('pool_seasons').select('id, season, is_active').eq('is_playoff', false).order('season', { ascending: false })
    saisonsPresaison = (data ?? []) as { id: number; season: string; is_active: boolean }[]
    defaultPresaisonId = (!isNaN(parsedSaisonId) && saisonsPresaison.find(s => s.id === parsedSaisonId)?.id)
      || saisonsPresaison.find(s => s.is_active)?.id
      || saisonsPresaison[0]?.id
      || null
  }

  // ── Choix de repêchage ────────────────────────────────────────────────────
  let saisonsChoix: { id: number; season: string; is_active: boolean; draft_rounds: number }[] = []
  let poolersChoix: Pooler[] = []
  let picksBySaison: Record<number, Pick[]> = {}
  let initialChoixSaisonId: number | null = null
  if (activeTab === 'choix') {
    const { data: sc } = await supabase.from('pool_seasons').select('id, season, is_active, draft_rounds').eq('is_playoff', false).order('season', { ascending: false })
    saisonsChoix = (sc ?? []) as { id: number; season: string; is_active: boolean; draft_rounds: number }[]
    const saisionIds = saisonsChoix.map(s => s.id)
    const [{ data: pc }, { data: rp }] = await Promise.all([
      supabase.from('poolers').select('id, name').order('name'),
      saisionIds.length > 0
        ? supabase.from('pool_draft_picks').select('id, round, original_owner_id, current_owner_id, is_used, pool_season_id').in('pool_season_id', saisionIds).order('round')
        : Promise.resolve({ data: [] }),
    ])
    poolersChoix = (pc ?? []).map(p => ({ id: p.id, name: p.name }))
    const pMap = new Map((pc ?? []).map(p => [p.id, p.name]))
    for (const p of rp ?? []) {
      const pick: Pick = {
        id: p.id, round: p.round,
        original_owner_id: p.original_owner_id,
        original_owner_name: pMap.get(p.original_owner_id) ?? '?',
        current_owner_id: p.current_owner_id,
        current_owner_name: pMap.get(p.current_owner_id) ?? '?',
        is_used: p.is_used,
      }
      if (!picksBySaison[p.pool_season_id]) picksBySaison[p.pool_season_id] = []
      picksBySaison[p.pool_season_id].push(pick)
    }
    initialChoixSaisonId = (!isNaN(parsedSaisonId) && saisonsChoix.find(s => s.id === parsedSaisonId)?.id)
      || saisonsChoix.find(s => s.is_active)?.id
      || saisonsChoix[0]?.id
      || null
  }

  return (
    <div>
      {cameFromHub && <AdminHubBackLink saisonId={parsedSaisonId} />}
      <AdminTabBar tabs={TABS} activeTab={activeTab} basePath="/admin/init" />

      {/* ── Rosters ── */}
      {activeTab === 'rosters' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-800">Gestion des alignements</h1>
            {saisonRosters && (
              <SaisonSelectNav saisons={saisonsRosters} selectedId={saisonRosters.id} baseHref="/admin/init?tab=rosters" />
            )}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800 mb-6">
            Pensé pour la mise en place initiale de l&apos;alignement (juste après la transition des
            rosters) — aucune vérification (budget de signatures, joueur déjà pris ailleurs, etc.).
            Pour un ajustement ponctuel après cette étape (libération, signature, échange), utilise
            plutôt Pré-saison ou Transactions, qui ont ces protections.
          </div>
          <ErrorBoundary>
            <RosterManager
              poolers={poolersRosters}
              players={players as never}
              saison={saisonRosters}
              allTakenPlayerIds={allTakenPlayerIds}
              playerOwnerMap={playerOwnerMap}
            />
          </ErrorBoundary>
        </div>
      )}

      {/* ── Recrues ── */}
      {activeTab === 'recrues' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold text-gray-800">Banque de recrues</h1>
            {saisonRecrues && (
              <SaisonSelectNav saisons={saisonsRecrues} selectedId={saisonRecrues.id} baseHref="/admin/init?tab=recrues" />
            )}
          </div>
          <p className="text-gray-500 text-sm mb-6">
            {'Assigner des recrues à la banque de chaque pooler. La banque ne compte pas dans la masse salariale.'}
          </p>
          <ErrorBoundary>
            <BanqueRecruesManager
              poolers={poolersRecrues}
              rookies={rookies as never}
              saison={saisonRecrues}
            />
          </ErrorBoundary>
        </div>
      )}

      {/* ── Choix de repêchage ── */}
      {activeTab === 'choix' && (
        <div className="max-w-5xl">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Choix de repêchage</h1>
          <PicksManager saisons={saisonsChoix} poolers={poolersChoix} picksBySaison={picksBySaison} initialSaisonId={initialChoixSaisonId ?? undefined} />
        </div>
      )}

      {/* ── Pré-saison ── */}
      {activeTab === 'presaison' && (
        <div className="max-w-5xl">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">{'Repêchage pré-saison'}</h1>
          {!defaultPresaisonId
            ? <p className="text-gray-500">Aucune saison disponible.</p>
            : <PresaisonManager saisons={saisonsPresaison} defaultSaisonId={defaultPresaisonId} highlightPoolerId={poolerId} />
          }
        </div>
      )}
    </div>
  )
}
