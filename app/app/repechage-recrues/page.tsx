import { createClient } from '@/lib/supabase/server'
import DraftBoard from '../admin/repechage/DraftBoard'
import SaisonSelectClient from './SaisonSelectClient'
import AutoRefresh from '@/components/AutoReload'

export const dynamic = 'force-dynamic'

export default async function RepechageRecruesPage({
  searchParams,
}: {
  searchParams: Promise<{ saisonId?: string }>
}) {
  const supabase = await createClient()
  const { saisonId } = await searchParams

  const { data: allSaisons } = await supabase
    .from('pool_seasons')
    .select('id, season, is_active')
    .eq('is_playoff', false)
    // Une saison peut être masquée aux poolers (is_public=false) une fois inactive si son
    // historique n'est pas jugé présentable (ex: transition 2025-26 → 2026-27) — toujours
    // inclure la saison active elle-même, sinon elle disparaîtrait de son propre sélecteur.
    .or('is_public.eq.true,is_active.eq.true')
    .order('season', { ascending: false })

  const saisons = (allSaisons ?? []) as { id: number; season: string; is_active: boolean }[]
  const parsedId = saisonId ? parseInt(saisonId, 10) : NaN
  const saison = (!isNaN(parsedId) && saisons.find(s => s.id === parsedId))
    || saisons.find(s => s.is_active)
    || saisons[0]
    || null

  if (!saison) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
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
      .or(`is_rookie.eq.true,draft_year.gte.${poolDraftYear - 4}`)
      .not('draft_year', 'is', null)
      .not('draft_overall', 'is', null)
      .order('draft_year', { ascending: false })
      .order('draft_round', { ascending: true, nullsFirst: false })
      .order('draft_overall', { ascending: true, nullsFirst: false }),
    supabase
      .from('pooler_rosters')
      .select('pooler_id, player_id, draft_pick_id, players(id, first_name, last_name, position, teams(code), draft_round, draft_overall)')
      .eq('pool_season_id', saison.id)
      .eq('player_type', 'recrue')
      .eq('pool_draft_year', poolDraftYear)
      .eq('is_active', true),
  ])

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

  const totalPicks = (picksData?.length ?? 0) + (usedPicksData?.length ?? 0)
  const isDraftDone = (picksData?.length ?? 0) === 0 && totalPicks > 0
  const hasPendingPick = (picksData ?? []).some(p => p.pending_player_id != null)
  const isDraftStarted = (usedPicksData?.length ?? 0) > 0 || hasPendingPick

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Repêchage des recrues</h1>
          <p className="text-gray-500 text-sm mt-1">
            Repêchage {poolDraftYear}
            {isDraftDone && <span className="ml-2 text-green-600 font-medium">· Complété ✓</span>}
            {!isDraftDone && isDraftStarted && <span className="ml-2 text-amber-600 font-medium">· En cours</span>}
            {!isDraftStarted && totalPicks > 0 && <span className="ml-2 text-gray-400">· Pas encore commencé</span>}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <AutoRefresh enabled={saison.is_active && !isDraftDone && totalPicks > 0} />
          <SaisonSelectClient saisons={saisons} selectedId={saison.id} />
        </div>
      </div>

      {totalPicks === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-gray-200 px-6 py-12 text-center">
          <p className="text-gray-500">Aucun choix de repêchage configuré pour cette saison.</p>
          <p className="text-xs text-gray-400 mt-2">L'admin doit initialiser les picks dans Pré-saison &gt; Choix de repêchage.</p>
        </div>
      ) : (
        <>
          <DraftBoard
            picks={(picksData ?? []) as never[]}
            usedPicks={(usedPicksData ?? []) as never[]}
            rookies={availableRookies as never[]}
            playerByPickId={Object.fromEntries(playerByPickId)}
            saisonId={saison.id}
            poolDraftYear={poolDraftYear}
            readOnly
          />

          {availableRookies.length > 0 && !isDraftDone && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                Joueurs disponibles{' '}
                <span className="text-gray-400 font-normal text-sm">({availableRookies.length})</span>
              </h2>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left">
                      <th className="px-4 py-2.5 font-medium text-gray-600">Joueur</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600 w-16">Pos</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600 w-20">Équipe</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">Repêchage LNH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {availableRookies.map((r: any) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{r.last_name}, {r.first_name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{r.position ?? '—'}</td>
                        <td className="px-4 py-2.5 text-gray-500">{r.teams?.code ?? '—'}</td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {r.draft_year} — R{r.draft_round ?? '?'} #{r.draft_overall ?? '?'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
