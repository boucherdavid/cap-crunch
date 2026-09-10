import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loadPresaisonDataAction, loadPresaisonDraftStateAction } from '../admin/presaison/actions'
import AgentsLibresDashboard from './AgentsLibresDashboard'

export const metadata = { title: 'Repêchage — Agents libres' }
export const dynamic = 'force-dynamic'

// 15 était trop bas — avec 63 libérations pour la seule saison en cours, la plupart n'étaient
// jamais chargées du serveur (le défilement du fil "Activité récente" ne peut rien révéler de
// plus que ce qui a été fetché) — David, 2026-09-10.
const ACTIVITY_LIMIT_PER_KIND = 60
const ACTIVITY_LIMIT_TOTAL = 60

export default async function AgentsLibresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('poolers').select('id, name, is_admin').eq('id', user.id).single()
  if (!me) redirect('/')

  const { data: saison } = await supabase
    .from('pool_seasons')
    .select('id, season, season_started')
    .eq('is_active', true)
    .eq('is_playoff', false)
    .maybeSingle()

  if (!saison) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Repêchage — Agents libres</h1>
        <p className="text-gray-400">Aucune saison régulière active.</p>
      </div>
    )
  }

  const [dataResult, stateResult, signResult, releaseResult, banqueResult] = await Promise.all([
    loadPresaisonDataAction(saison.id),
    loadPresaisonDraftStateAction(saison.id),
    supabase
      .from('transaction_items')
      .select(`
        id, player_id, to_pooler_id,
        players (first_name, last_name, position),
        poolers!transaction_items_to_pooler_id_fkey (name),
        transactions!inner (created_at, pool_season_id, notes)
      `)
      .eq('action_type', 'sign')
      .eq('transactions.pool_season_id', saison.id)
      .eq('transactions.notes', 'Repêchage pré-saison')
      .order('created_at', { referencedTable: 'transactions', ascending: false })
      .limit(ACTIVITY_LIMIT_PER_KIND),
    // Libérations du ménage pré-saison (ComplianceCard, /admin/init?tab=presaison) — pour que
    // les poolers voient qui a été libéré, sans avoir à demander à l'admin.
    supabase
      .from('transaction_items')
      .select(`
        id, player_id, from_pooler_id,
        players (first_name, last_name, position),
        poolers!from_pooler_id (name),
        transactions!inner (created_at, pool_season_id, notes)
      `)
      .eq('action_type', 'release')
      .eq('transactions.pool_season_id', saison.id)
      .eq('transactions.notes', 'Ajustement pré-saison')
      .order('created_at', { referencedTable: 'transactions', ascending: false })
      .limit(ACTIVITY_LIMIT_PER_KIND),
    // Remises en banque (David, 2026-09-10) — type_change vers 'recrue' (admin ou
    // libre-service, voir repechage-agents-libres/actions.ts) manquait complètement du fil,
    // signalé par David en plein repêchage. Les changements de statut actif↔réserviste
    // (type_change vers autre chose) restent volontairement hors du fil — trop fréquents/peu
    // pertinents pour un suivi collectif, contrairement à une vraie sortie de l'alignement actif.
    supabase
      .from('transaction_items')
      .select(`
        id, player_id, from_pooler_id,
        players (first_name, last_name, position),
        poolers!from_pooler_id (name),
        transactions!inner (created_at, pool_season_id, notes)
      `)
      .eq('action_type', 'type_change')
      .eq('new_player_type', 'recrue')
      .eq('transactions.pool_season_id', saison.id)
      .eq('transactions.notes', 'Ajustement pré-saison')
      .order('created_at', { referencedTable: 'transactions', ascending: false })
      .limit(ACTIVITY_LIMIT_PER_KIND),
  ])

  if (dataResult.error || !dataResult.poolers) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Repêchage — Agents libres</h1>
        <p className="text-red-500 text-sm">{dataResult.error ?? 'Erreur de chargement.'}</p>
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signs = ((signResult.data ?? []) as any[]).map(item => ({
    id: item.id as number,
    kind: 'sign' as const,
    poolerName: (item.poolers?.name as string | undefined) ?? '?',
    playerName: item.players ? `${item.players.last_name}, ${item.players.first_name}` : '?',
    position: (item.players?.position as string | null) ?? null,
    at: (item.transactions?.created_at as string | undefined) ?? new Date().toISOString(),
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const releases = ((releaseResult.data ?? []) as any[]).map(item => ({
    id: item.id as number,
    kind: 'release' as const,
    poolerName: (item.poolers?.name as string | undefined) ?? '?',
    playerName: item.players ? `${item.players.last_name}, ${item.players.first_name}` : '?',
    position: (item.players?.position as string | null) ?? null,
    at: (item.transactions?.created_at as string | undefined) ?? new Date().toISOString(),
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const banques = ((banqueResult.data ?? []) as any[]).map(item => ({
    id: item.id as number,
    kind: 'banque' as const,
    poolerName: (item.poolers?.name as string | undefined) ?? '?',
    playerName: item.players ? `${item.players.last_name}, ${item.players.first_name}` : '?',
    position: (item.players?.position as string | null) ?? null,
    at: (item.transactions?.created_at as string | undefined) ?? new Date().toISOString(),
  }))
  const recentActivity = [...signs, ...releases, ...banques]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, ACTIVITY_LIMIT_TOTAL)

  return (
    <AgentsLibresDashboard
      me={{ id: me.id, name: me.name, isAdmin: me.is_admin }}
      poolers={dataResult.poolers}
      poolCap={dataResult.poolCap ?? 0}
      nhlMinimumSalary={dataResult.nhlMinimumSalary ?? 850_000}
      draftState={stateResult.state ?? {
        pool_season_id: saison.id,
        is_active: false, queue: [],
        turn_started_at: null, turn_duration_seconds: 90, ended_at: null,
        release_phase_open: false, pass_skip_one: false,
      }}
      recentActivity={recentActivity}
      saisonId={saison.id}
      season={saison.season}
      seasonStarted={saison.season_started ?? true}
      draftOrder={dataResult.draftOrder ?? []}
    />
  )
}
