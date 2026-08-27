import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DraftBoard from './DraftBoard'
import DraftOrderEditor from './DraftOrderEditor'
import { SaisonSelectNav } from '../init/SaisonSelectNav'

export const dynamic = 'force-dynamic'

export default async function RepechageAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saisonId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pooler } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!pooler?.is_admin) redirect('/')

  const { saisonId } = await searchParams

  const { data: allSaisons } = await supabase
    .from('pool_seasons')
    .select('id, season, is_active')
    .eq('is_playoff', false)
    .order('season', { ascending: false })

  const saisons = allSaisons ?? []
  const parsedId = saisonId ? parseInt(saisonId, 10) : NaN
  const saison = (!isNaN(parsedId) && saisons.find(s => s.id === parsedId))
    || saisons.find(s => s.is_active)
    || saisons[0]
    || null

  if (!saison) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Repêchage des recrues</h1>
        <p className="text-gray-400">Aucune saison disponible.</p>
      </div>
    )
  }

  const poolDraftYear = parseInt(saison.season.split('-')[0], 10)

  const [
    { data: picksData },
    { data: usedPicksData },
    { data: rookiesData },
    { data: bankData },
    { data: orderData },
  ] = await Promise.all([
    supabase
      .from('pool_draft_picks')
      .select('id, round, draft_order, pending_player_id, current_owner:poolers!current_owner_id(id, name), original_owner:poolers!original_owner_id(id, name)')
      .eq('pool_season_id', saison.id)
      .eq('is_used', false)
      .order('round'),
    supabase
      .from('pool_draft_picks')
      .select('id, round, draft_order, current_owner:poolers!current_owner_id(id, name), original_owner:poolers!original_owner_id(id, name)')
      .eq('pool_season_id', saison.id)
      .eq('is_used', true)
      .order('round'),
    supabase
      .from('players')
      .select('id, first_name, last_name, position, status, draft_year, draft_round, draft_overall, teams(code)')
      .eq('draft_year', poolDraftYear)
      .not('draft_overall', 'is', null)
      .order('draft_round', { ascending: true, nullsFirst: false })
      .order('draft_overall', { ascending: true, nullsFirst: false }),
    supabase
      .from('pooler_rosters')
      .select('pooler_id, player_id, draft_pick_id, players(id, first_name, last_name, position, teams(code), draft_round, draft_overall)')
      .eq('pool_season_id', saison.id)
      .eq('player_type', 'recrue')
      .eq('pool_draft_year', poolDraftYear)
      .eq('is_active', true),
    supabase
      .from('pool_draft_picks')
      .select('original_owner_id, draft_order, original_owner:poolers!original_owner_id(id, name)')
      .eq('pool_season_id', saison.id)
      .eq('round', 1),
  ])

  const poolerOrderMap = new Map<string, { id: string; name: string; draft_order: number | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (orderData ?? []) as any[]) {
    const p = row.original_owner
    if (p && !poolerOrderMap.has(p.id)) {
      poolerOrderMap.set(p.id, { id: p.id, name: p.name, draft_order: row.draft_order })
    }
  }
  const poolersForEditor = Array.from(poolerOrderMap.values())

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerByPickId = new Map<number, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const entry of (bankData ?? []) as any[]) {
    if (entry.draft_pick_id != null) {
      playerByPickId.set(entry.draft_pick_id, entry.players)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inBankIds = new Set((bankData ?? []).map((r: any) => r.player_id))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const availableRookies = (rookiesData ?? []).filter((r: any) => !inBankIds.has(r.id))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Repêchage des recrues</h1>
          <p className="text-gray-500 text-sm mt-1">Repêchage {poolDraftYear}</p>
        </div>
        <SaisonSelectNav
          saisons={saisons}
          selectedId={saison.id}
          baseHref="/admin/repechage"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-1">
          <DraftOrderEditor poolers={poolersForEditor} saisonId={saison.id} />
        </div>
        <div className="lg:col-span-2 flex items-start">
          <div className="bg-slate-50 rounded-lg border border-slate-200 px-4 py-3 text-xs text-slate-500 w-full">
            {"L'ordre de sélection détermine la position de chaque pick. Un pick échangé conserve le rang de son propriétaire d'origine. Sauvegardez l'ordre avant de commencer le repêchage."}
          </div>
        </div>
      </div>

      <DraftBoard
        picks={(picksData ?? []) as never[]}
        usedPicks={(usedPicksData ?? []) as never[]}
        rookies={availableRookies as never[]}
        playerByPickId={Object.fromEntries(playerByPickId)}
        saisonId={saison.id}
        poolDraftYear={poolDraftYear}
      />
    </div>
  )
}
