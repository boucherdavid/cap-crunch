import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminTabBar } from '@/components/AdminTabBar'
import AddPoolerForm from '../poolers/AddPoolerForm'
import PoolerActions from '../poolers/PoolerActions'
import ConfigTabsClient from '../config/ConfigTabsClient'

export const dynamic = 'force-dynamic'

const TABS = [
  { id: 'poolers', label: 'Poolers' },
  { id: 'config',  label: 'Configuration' },
]

const normalizeType = (t: string) => (t === 'agent_libre' ? 'reserviste' : t)

function fmtCap(n: number) {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default async function AdminPoolPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user!.id).single()
  if (!me?.is_admin) redirect('/')

  const { tab = 'poolers' } = await searchParams
  const activeTab = TABS.some(t => t.id === tab) ? tab : 'poolers'

  // ── Poolers ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let poolersData: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saisonPoolers: any = null
  if (activeTab === 'poolers') {
    const [pr, sr] = await Promise.all([
      supabase.from('poolers').select(`
        id, name, is_admin,
        pooler_rosters(id, player_type, is_active, pool_season_id,
          players(player_contracts(season, cap_number))
        )
      `).order('name'),
      supabase.from('pool_seasons').select('*').eq('is_active', true).eq('is_playoff', false).single(),
    ])
    poolersData = pr.data ?? []
    saisonPoolers = sr.data
  }

  // ── Config ────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saisonsConfig: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let scoringRows: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activeRegSaison: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activePlayoffSaison: any = null
  if (activeTab === 'config') {
    const [sr, scr] = await Promise.all([
      supabase.from('pool_seasons').select('id, season, nhl_cap, cap_multiplier, pool_cap, is_active, is_public, is_playoff, next_nhl_cap, delai_reactivation_jours, max_signatures_al, max_signatures_ltir, duree_min_ltir_jours, gestion_effectifs_ouvert, playoff_submission_deadline, playoff_max_changes, playoff_max_elim_changes, playoff_max_f, playoff_max_d, playoff_max_g, indicator_streak_chaud, indicator_streak_forme, indicator_streak_froid, indicator_streak_crise, indicator_fenetre_tendance, indicator_goalie_wins_streak, indicator_goalie_sv_pct, indicator_goalie_gaa, indicator_goalie_min_games, draft_rounds, saison_start_date, saison_end_date').order('season', { ascending: false }),
      supabase.from('scoring_config').select('id, stat_key, label, points, points_playoffs, scope').order('id'),
    ])
    saisonsConfig = sr.data ?? []
    scoringRows = scr.data ?? []
    activeRegSaison     = saisonsConfig.find((s: { is_active: boolean; is_playoff: boolean }) => s.is_active && !s.is_playoff) ?? null
    activePlayoffSaison = saisonsConfig.find((s: { is_active: boolean; is_playoff: boolean }) => s.is_active && s.is_playoff) ?? null
  }

  return (
    <div>
      <AdminTabBar tabs={TABS} activeTab={activeTab} basePath="/admin/pool" />

      {/* ── Poolers ── */}
      {activeTab === 'poolers' && (
        <div>
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Gestion des poolers</h1>
          <AddPoolerForm />
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Admin</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actifs</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Réservistes</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Cap comptabilisé</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {poolersData.map(pr => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const rosters = (pr.pooler_rosters as any[])
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ?.filter((r: any) => r.is_active && r.pool_season_id === saisonPoolers?.id)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((r: any) => ({ ...r, player_type: normalizeType(r.player_type) })) ?? []
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const actifs     = rosters.filter((r: any) => r.player_type === 'actif')
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const reservistes = rosters.filter((r: any) => r.player_type === 'reserviste')
                  const cap = [...actifs, ...reservistes].reduce((s: number, r: { players: { player_contracts: { season: string; cap_number: number }[] } }) => {
                    const c = r.players?.player_contracts?.find((c: { season: string }) => c.season === saisonPoolers?.season)
                    return s + ((c as { cap_number?: number })?.cap_number ?? 0)
                  }, 0)
                  return (
                    <tr key={pr.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{pr.name}</td>
                      <td className="px-4 py-3 text-center">
                        {pr.is_admin && <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">Admin</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{actifs.length}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{reservistes.length}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{cap > 0 ? fmtCap(cap) : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <PoolerActions poolerId={pr.id} poolerName={pr.name} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Config ── */}
      {activeTab === 'config' && (
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Configuration du pool</h1>
          <ConfigTabsClient
            saisons={saisonsConfig}
            activeRegSaison={activeRegSaison}
            activePlayoffSaison={activePlayoffSaison}
            scoringRows={scoringRows}
          />
        </div>
      )}
    </div>
  )
}
