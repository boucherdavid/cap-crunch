import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { AdminTabBar } from '@/components/AdminTabBar'
import AddPoolerForm from '../poolers/AddPoolerForm'
import PoolerActions from '../poolers/PoolerActions'
import ConfigTabsClient from '../config/ConfigTabsClient'
import FeedbackAdminView from '../feedback/FeedbackAdminView'
import SuiviTable from '../suivi/SuiviTable'
import type { Event } from '../suivi/SuiviTable'
import JournalExport from '../suivi/JournalExport'
import AdminPlanificationManager from '../planification/AdminPlanificationManager'
import { CHANGE_LABEL, CHANGE_COLOR } from '@/lib/rosterChangeLabels'

export const dynamic = 'force-dynamic'

const TABS = [
  { id: 'poolers',       label: 'Poolers' },
  { id: 'config',        label: 'Configuration' },
  { id: 'communication', label: 'Communication' },
  { id: 'suivi',         label: 'Suivi' },
  { id: 'planification', label: 'Planification' },
]

const normalizeType = (t: string) => (t === 'agent_libre' ? 'reserviste' : t)

function fmtCap(n: number) {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

async function markAllReadAction() {
  'use server'
  const db = createAdminClient()
  await db.from('notification_log').update({ read_at: new Date().toISOString() }).is('read_at', null)
  revalidatePath('/admin/pool')
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

  // ── Communication ─────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let feedbacks: any[] = []
  let feedbackCounts = { nouveau: 0, traité: 0, archivé: 0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let notifications: any[] = []
  let unreadNotifs = 0
  if (activeTab === 'communication') {
    const db = createAdminClient()
    const [fr, nr] = await Promise.all([
      supabase.from('feedback').select('id, type, description, created_at, status, poolers(name)').order('created_at', { ascending: false }),
      db.from('notification_log').select('id, title, body, url, sent_at, read_at').order('sent_at', { ascending: false }).limit(100),
    ])
    feedbacks = fr.data ?? []
    feedbackCounts = {
      nouveau: feedbacks.filter(f => f.status === 'nouveau').length,
      traité:  feedbacks.filter(f => f.status === 'traité').length,
      archivé: feedbacks.filter(f => f.status === 'archivé').length,
    }
    notifications = nr.data ?? []
    unreadNotifs = notifications.filter(n => !n.read_at).length
  }

  // ── Suivi ─────────────────────────────────────────────────────────────────
  let events: Event[] = []
  let suiviSeasons: { id: number; label: string }[] = []
  let suiviDefaultSeasonId: number | null = null
  if (activeTab === 'suivi') {
    const { data: seasonsData } = await supabase
      .from('pool_seasons')
      .select('id, season, is_active, is_playoff')
      .order('season', { ascending: false })
    suiviSeasons = (seasonsData ?? []).map(s => ({ id: s.id, label: s.is_playoff ? `${s.season} (séries)` : s.season }))
    suiviDefaultSeasonId = (seasonsData ?? []).find(s => s.is_active && !s.is_playoff)?.id ?? seasonsData?.[0]?.id ?? null

    const [rcr, txr] = await Promise.all([
      supabase.from('roster_change_log').select('id, change_type, old_type, new_type, changed_at, is_admin_override, players(first_name, last_name), poolers!roster_change_log_pooler_id_fkey(name)').order('changed_at', { ascending: false }).limit(100),
      supabase.from('transactions').select('id, notes, created_at, poolers!transactions_created_by_fkey(name)').order('created_at', { ascending: false }).limit(50),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (rcr.data ?? []) as any[]) {
      const pl = r.players as { first_name: string; last_name: string } | null
      const po = r.poolers as { name: string } | null
      const label = CHANGE_LABEL[r.change_type] ?? r.change_type
      const color = CHANGE_COLOR[r.change_type] ?? 'bg-gray-100 text-gray-700'
      const pName = pl ? `${pl.last_name}, ${pl.first_name}` : '—'
      events.push({
        id: `r-${r.id}`,
        at: r.changed_at,
        category: 'roster',
        poolerName: po?.name ?? '?',
        label,
        detail: (r.old_type && r.new_type ? `${pName} (${r.old_type} → ${r.new_type})` : pName) + (r.is_admin_override ? ' · override date' : ''),
        color,
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (txr.data ?? []) as any[]) {
      const po = t.poolers as { name: string } | null
      events.push({
        id: `t-${t.id}`,
        at: t.created_at,
        category: 'transaction',
        poolerName: po?.name ?? 'Admin',
        label: 'Transaction',
        detail: t.notes ?? '(sans notes)',
        color: 'bg-slate-100 text-slate-800',
      })
    }
    events.sort((a, b) => b.at.localeCompare(a.at))
  }

  // ── Planification ─────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let planifPoll: any = null
  let planifDates: { id: number; candidate_date: string }[] = []
  let planifNavOnly = false
  if (activeTab === 'planification') {
    const [{ data: settings }, { data: poll }] = await Promise.all([
      supabase.from('app_settings').select('nav_planification_only').eq('id', 1).maybeSingle(),
      supabase.from('meeting_polls').select('id, title').eq('is_active', true).maybeSingle(),
    ])
    planifNavOnly = settings?.nav_planification_only ?? false
    planifPoll = poll ?? null
    const { data: dates } = planifPoll
      ? await supabase.from('meeting_poll_dates').select('id, candidate_date').eq('poll_id', planifPoll.id).order('candidate_date')
      : { data: [] as { id: number; candidate_date: string }[] }
    planifDates = dates ?? []
  }

  const tabsWithBadges = TABS.map(t =>
    t.id === 'communication' ? { ...t, badge: feedbackCounts.nouveau > 0 ? feedbackCounts.nouveau : undefined } : t
  )

  return (
    <div>
      <AdminTabBar tabs={tabsWithBadges} activeTab={activeTab} basePath="/admin/pool" />

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

      {/* ── Communication ── */}
      {activeTab === 'communication' && (
        <div className="space-y-10">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-2xl font-bold text-gray-800">{'Boîte de réception'}</h1>
            </div>
            <p className="text-gray-500 text-sm mb-6">
              {feedbackCounts.nouveau > 0
                ? `${feedbackCounts.nouveau} nouveau${feedbackCounts.nouveau > 1 ? 'x' : ''} · ${feedbacks.length} au total`
                : `${feedbacks.length} message${feedbacks.length > 1 ? 's' : ''} au total`}
            </p>
            <FeedbackAdminView feedbacks={feedbacks} counts={feedbackCounts} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Notifications</h2>
                {unreadNotifs > 0 && (
                  <p className="text-sm text-gray-500 mt-0.5">{unreadNotifs} non lue{unreadNotifs > 1 ? 's' : ''}</p>
                )}
              </div>
              {unreadNotifs > 0 && (
                <form action={markAllReadAction}>
                  <button type="submit" className="text-sm text-blue-600 hover:underline">
                    Tout marquer comme lu
                  </button>
                </form>
              )}
            </div>
            {notifications.length === 0
              ? <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400 text-sm">Aucune notification.</div>
              : <div className="space-y-2">
                  {notifications.map((n: { id: string; read_at: string | null; title: string; body: string; sent_at: string; url?: string }) => (
                    <div key={n.id} className={`bg-white rounded-lg shadow px-4 py-3 flex items-start gap-3 border-l-4 ${!n.read_at ? 'border-blue-500' : 'border-transparent'}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${n.read_at ? 'text-gray-600' : 'text-gray-900'}`}>{n.title}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{n.body}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(n.sent_at).toLocaleString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      )}

      {/* ── Suivi ── */}
      {activeTab === 'suivi' && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-gray-800">{'Suivi de l\'activité'}</h1>
          <JournalExport seasons={suiviSeasons} defaultSeasonId={suiviDefaultSeasonId} />
          <SuiviTable events={events} />
        </div>
      )}

      {/* ── Planification ── */}
      {activeTab === 'planification' && (
        <AdminPlanificationManager
          poll={planifPoll}
          dates={planifDates}
          navPlanificationOnly={planifNavOnly}
        />
      )}
    </div>
  )
}
