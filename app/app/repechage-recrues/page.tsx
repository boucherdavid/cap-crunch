import { createClient } from '@/lib/supabase/server'
import DraftBoard from '../admin/repechage/DraftBoard'
import DraftOrderEditor from '../admin/repechage/DraftOrderEditor'
import ResetRookieDraftButton from '../admin/repechage/ResetRookieDraftButton'
import { getRookieTurnStateAction } from '../admin/repechage/actions'
import SaisonSelectClient from './SaisonSelectClient'
import RookieTurnBanner from './RookieTurnBanner'
import AutoRefresh from '@/components/AutoReload'
import WatchlistPanel from '@/components/WatchlistPanel'
import TurnWatcher from '@/components/TurnWatcher'
import { AdminHubBackLink } from '@/components/AdminHubBackLink'

export const dynamic = 'force-dynamic'

/**
 * Hub du repêchage des recrues (David, 2026-10-02) — une seule page pour tout le monde, comme
 * /repechage-agents-libres : les poolers suivent le repêchage (tableau en lecture seule, bandeau
 * du tour, chrono, fenêtre « C'est ton tour ! »), et l'admin y fait en plus les sélections et
 * gère le départ, le chrono, l'ordre et la réinitialisation. /admin/repechage redirige ici.
 *
 * Pas de rechargement automatique pour l'admin (AutoRefresh / TurnWatcher) : un rechargement en
 * pleine saisie ferait sauter l'écran ; son bandeau se met à jour seul (RookieTurnBanner).
 */
export default async function RepechageRecruesPage({
  searchParams,
}: {
  searchParams: Promise<{ saisonId?: string }>
}) {
  const supabase = await createClient()
  const { saisonId } = await searchParams
  const { data: { user } } = await supabase.auth.getUser()
  const { data: me } = user
    ? await supabase.from('poolers').select('is_admin').eq('id', user.id).maybeSingle()
    : { data: null }
  const isAdmin = !!me?.is_admin

  let saisonsQuery = supabase
    .from('pool_seasons')
    .select('id, season, is_active, season_started')
    .eq('is_playoff', false)
  // Une saison peut être masquée aux poolers (is_public=false) une fois inactive si son
  // historique n'est pas jugé présentable (ex: transition 2025-26 → 2026-27) — toujours
  // inclure la saison active elle-même, sinon elle disparaîtrait de son propre sélecteur.
  // L'admin voit toutes les saisons : il prépare parfois une saison pas encore activée.
  if (!isAdmin) saisonsQuery = saisonsQuery.or('is_public.eq.true,is_active.eq.true')
  const { data: allSaisons } = await saisonsQuery.order('season', { ascending: false })

  const saisons = (allSaisons ?? []) as { id: number; season: string; is_active: boolean; season_started: boolean | null }[]
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
    { data: pickHistoryData },
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
    // Historique pick -> joueur pour l'affichage du tableau, indépendant du statut courant
    // du joueur (David, 2026-09-23 — un joueur promu actif depuis son repêchage sort du
    // filtre player_type='recrue' ci-dessus et affichait "Soumis" sans nom malgré un pick
    // bien complété). Ne sert qu'à l'affichage, jamais à `availableRookies`.
    supabase
      .from('pooler_rosters')
      .select('draft_pick_id, players(id, first_name, last_name, position, teams(code), draft_round, draft_overall)')
      .eq('pool_season_id', saison.id)
      .not('draft_pick_id', 'is', null),
    // Ordre du repêchage (éditeur admin) : rang de chaque pooler d'après ses choix de 1re ronde.
    supabase
      .from('pool_draft_picks')
      .select('original_owner_id, draft_order, original_owner:poolers!original_owner_id(id, name)')
      .eq('pool_season_id', saison.id)
      .eq('round', 1),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerByPickId = new Map<number, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const entry of (pickHistoryData ?? []) as any[]) {
    if (entry.draft_pick_id != null) {
      playerByPickId.set(entry.draft_pick_id, entry.players)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inBankIds = new Set((bankData ?? []).map((r: any) => r.player_id))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const availableRookies = (rookiesData ?? []).filter((r: any) => !inBankIds.has(r.id))
  // Sélection par l'admin : seulement les joueurs du repêchage LNH de l'année, comme sur
  // l'ancienne page admin (la liste élargie ci-dessus sert à l'affichage « Joueurs disponibles »).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectableRookies = availableRookies.filter((r: any) => r.draft_year === poolDraftYear)

  const poolerOrderMap = new Map<string, { id: string; name: string; draft_order: number | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (orderData ?? []) as any[]) {
    const p = row.original_owner
    if (p && !poolerOrderMap.has(p.id)) poolerOrderMap.set(p.id, { id: p.id, name: p.name, draft_order: row.draft_order })
  }
  const poolersForEditor = Array.from(poolerOrderMap.values())

  const totalPicks = (picksData?.length ?? 0) + (usedPicksData?.length ?? 0)
  const isDraftDone = (picksData?.length ?? 0) === 0 && totalPicks > 0
  const hasPendingPick = (picksData ?? []).some(p => p.pending_player_id != null)

  // Tour en cours et chrono (David, 2026-10-02). Le repêchage est « commencé » dès que l'admin
  // clique « Démarrer le repêchage » (chrono lancé) ou qu'une première sélection existe.
  const turn = totalPicks > 0 && !isDraftDone && (saison.is_active || isAdmin)
    ? await getRookieTurnStateAction(saison.id)
    : null
  const onTheClock = turn?.onTheClock ?? null
  const isMyTurn = !!onTheClock && onTheClock.ownerId === user?.id
  const isDraftStarted = (usedPicksData?.length ?? 0) > 0 || hasPendingPick || !!turn?.timer.active

  return (
    <div className="mx-auto py-8 px-4">
      {isAdmin && !isNaN(parsedId) && <AdminHubBackLink saisonId={saison.id} />}
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
          {/* Poolers seulement : 60 s une fois le repêchage commencé (David, 2026-09-27), et
              détection de chaque sélection en ~10 s (TurnWatcher, 2026-10-01) — actif dès avant
              le départ pour que le pooler voie le repêchage commencer. */}
          {!isAdmin && (
            <>
              <AutoRefresh enabled={saison.is_active && isDraftStarted && !isDraftDone && totalPicks > 0} intervalMs={60000} />
              <TurnWatcher kind="recrues" saisonId={saison.id} enabled={saison.is_active && !isDraftDone && totalPicks > 0} />
            </>
          )}
          <SaisonSelectClient saisons={saisons} selectedId={saison.id} />
        </div>
      </div>

      {/* Bandeau du tour collé en haut, chrono et fenêtre « C'est ton tour ! ». Poolers : seulement
          une fois le repêchage commencé. Admin : toujours, avec « Démarrer le repêchage » et les
          contrôles du chrono. */}
      {turn && (isAdmin || (onTheClock && isDraftStarted)) && (
        <RookieTurnBanner
          onTheClock={onTheClock}
          isMyTurn={isMyTurn}
          showPrompt={isDraftStarted}
          timer={turn.timer}
          adminSaisonId={isAdmin ? saison.id : undefined}
          saisonId={saison.id}
          myPoolerId={user?.id}
          rookies={isAdmin ? (selectableRookies as never[]) : undefined}
          initialPendingPlayerIds={turn.pendingPlayerIds}
        />
      )}

      {/* Listes privées de recrues à cibler (David, 2026-09-27) — rafraîchies toutes les 15 s
          pendant le repêchage : une recrue repêchée par un autre pooler passe dans « Déjà pris ». */}
      {saison.is_active && <WatchlistPanel kinds={['recrues']} refreshMs={30000} defaultOpen={!isDraftDone} />}

      {isAdmin && totalPicks > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-1">
            <DraftOrderEditor poolers={poolersForEditor} saisonId={saison.id} />
          </div>
          <div className="lg:col-span-2 flex items-start">
            <div className="bg-slate-50 rounded-lg border border-slate-200 px-4 py-3 text-xs text-slate-500 w-full">
              {"L'ordre de sélection détermine la position de chaque pick. Un pick échangé conserve le rang de son propriétaire d'origine. Sauvegarde l'ordre avant de commencer le repêchage."}
            </div>
          </div>
        </div>
      )}

      {totalPicks === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-gray-200 px-6 py-12 text-center">
          <p className="text-gray-500">Aucun choix de repêchage configuré pour cette saison.</p>
          <p className="text-xs text-gray-400 mt-2">L&apos;admin doit d&apos;abord créer les choix de repêchage (Nouvelle saison → Choix de repêchage).</p>
        </div>
      ) : (
        <>
          <DraftBoard
            picks={(picksData ?? []) as never[]}
            usedPicks={(usedPicksData ?? []) as never[]}
            rookies={(isAdmin ? selectableRookies : availableRookies) as never[]}
            playerByPickId={Object.fromEntries(playerByPickId)}
            saisonId={saison.id}
            poolDraftYear={poolDraftYear}
            readOnly={!isAdmin}
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

          {isAdmin && (
            <ResetRookieDraftButton
              saisonId={saison.id}
              season={saison.season}
              seasonStarted={!!saison.season_started}
              usedCount={usedPicksData?.length ?? 0}
            />
          )}
        </>
      )}
    </div>
  )
}
