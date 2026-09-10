'use client'

import { useEffect, useRef, useState } from 'react'
import AutoReload from '@/components/AutoReload'
import { searchFreeAgentsAction, submitTransactionAction } from '../admin/transactions/actions'
import { submitSelfServiceAction, loadOwnRecrueBankAction, setReadyAction } from './actions'
import AdminPanel from './AdminPanel'

type Me = { id: string; name: string; isAdmin: boolean }
type RosterEntry = {
  roster_id: number; player_id: number; player_type: string; playerName: string
  position: string | null; cap_number: number; isEstimatedCap: boolean
  rookieType: string | null
}
type PoolerInfo = {
  id: string; name: string; capUsed: number; capSpace: number; isCompliant: boolean
  counts: { forward: number; defense: number; goalie: number; reserviste: number }
  roster: RosterEntry[]
  isOverLimits: boolean
  slotsManquants: number
  capNeededForReady: number
  isReadyForDraft: boolean
  readyAt: string | null
}
type DraftState = {
  pool_season_id: number
  is_active: boolean; queue: string[]; turn_started_at: string | null
  turn_duration_seconds: number; ended_at: string | null; release_phase_open: boolean
  pass_skip_one: boolean
}
type RecentActivity = {
  id: number; kind: 'sign' | 'release'; poolerName: string; playerName: string
  position: string | null; at: string
}
type FreeAgent = { id: number; first_name: string; last_name: string; position: string | null }

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const DASH = '—'

// "$X restant" n'a de sens que si l'espace est positif — un négatif écrit "-49 050 335 $
// restant" se lit mal (David, 2026-09-08). Au-delà du cap, on nomme la chose : un surplus/
// dépassement, avec la valeur absolue.
const remainLabel = (n: number) => (n >= 0 ? 'Espace restant' : 'Dépassement')
const fmtRemainLine = (n: number) => (n >= 0 ? `${fmt(n)} restant` : `${fmt(Math.abs(n))} en surplus`)

function posBucket(position: string | null): 'forward' | 'defense' | 'goalie' {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

// Regroupe un alignement par position (Attaquants/Défenseurs/Gardiens/Réservistes — même
// découpage que ComplianceCard côté admin) et trie chaque groupe par salaire décroissant, pour
// faciliter le suivi visuel (David, 2026-09-08). Groupes vides omis.
function groupRosterByPosition<T extends { position: string | null; cap_number: number; player_type: string }>(
  roster: T[],
): { label: string; entries: T[] }[] {
  const groups: { label: string; match: (e: T) => boolean }[] = [
    { label: 'Attaquants', match: e => e.player_type !== 'reserviste' && posBucket(e.position) === 'forward' },
    { label: 'Défenseurs', match: e => e.player_type !== 'reserviste' && posBucket(e.position) === 'defense' },
    { label: 'Gardiens', match: e => e.player_type !== 'reserviste' && posBucket(e.position) === 'goalie' },
    { label: 'Réservistes', match: e => e.player_type === 'reserviste' },
  ]
  return groups
    .map(g => ({ label: g.label, entries: roster.filter(g.match).sort((a, b) => b.cap_number - a.cap_number) }))
    .filter(g => g.entries.length > 0)
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-CA', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto',
  })
}

// isOverLimits ne reflète maintenant que le dépassement de plafond salarial (David,
// 2026-09-06) — un surplus de joueurs actifs à une position (12/6/2) se règle en les
// reclassant réserviste (n'affecte pas capUsed), pas en libérant ; voir
// admin/presaison/actions.ts (demoteSurplusToReserveAction, isOverLimits).

export default function AgentsLibresDashboard({
  me, poolers, poolCap, draftState, recentActivity, saisonId, season, nhlMinimumSalary, seasonStarted, draftOrder,
}: {
  me: Me
  poolers: PoolerInfo[]
  poolCap: number
  draftState: DraftState
  recentActivity: RecentActivity[]
  saisonId: number
  season: string
  nhlMinimumSalary: number
  seasonStarted: boolean
  draftOrder: string[]
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const currentPoolerId = draftState.queue[0] ?? null
  const currentPoolerName = poolers.find(p => p.id === currentPoolerId)?.name ?? null
  // turn_started_at=null pendant que is_active=true = chrono en pause (David, 2026-09-08) —
  // turn_duration_seconds tient alors le nombre de secondes gelées au moment de la pause.
  const isPaused = draftState.is_active && draftState.turn_started_at === null
  const remainingSeconds = draftState.turn_started_at
    ? Math.max(0, draftState.turn_duration_seconds - Math.floor((now - new Date(draftState.turn_started_at).getTime()) / 1000))
    : isPaused ? draftState.turn_duration_seconds : null

  const myPooler = poolers.find(p => p.id === me.id) ?? null

  // AutoReload (rechargement complet toutes les 8s pendant un tour actif) coupait
  // net une sélection de libération en cours dans MonAlignement — le pooler n'avait
  // jamais le temps de cocher des joueurs avant que la page ne se recharge sous lui
  // (David, 2026-09-09). En pause tant qu'une sélection est en cours. Même problème
  // repéré côté admin (PoolerCard, "Libérer au nom d'un pooler") le même jour — un
  // Set plutôt qu'un booléen puisque plusieurs PoolerCard existent (une par pooler).
  const [releaseSelectionActive, setReleaseSelectionActive] = useState(false)
  const [adminReleaseSelectionIds, setAdminReleaseSelectionIds] = useState<Set<string>>(new Set())
  const setAdminReleaseSelectionFor = (poolerId: string, active: boolean) => {
    setAdminReleaseSelectionIds(prev => {
      const next = new Set(prev)
      active ? next.add(poolerId) : next.delete(poolerId)
      return next
    })
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Repêchage — Agents libres</h1>
          <p className="text-gray-500 text-sm mt-1">
            {season}
            {draftState.is_active && <span className="ml-2 text-amber-600 font-medium">· En cours</span>}
            {!draftState.is_active && draftState.ended_at && <span className="ml-2 text-green-600 font-medium">· Terminé</span>}
            {!draftState.is_active && !draftState.ended_at && (
              <span className={`ml-2 font-medium ${draftState.release_phase_open ? 'text-amber-600' : 'text-gray-400'}`}>
                · {draftState.release_phase_open ? 'Phase de libération de joueurs en cours' : 'Pas encore commencé'}
              </span>
            )}
          </p>
        </div>
        {/* Toujours actif (pas seulement pendant un tour, David, 2026-09-10) — sinon personne
            ne peut détecter qu'un tour vient de démarrer : is_active passe de false à true
            précisément au moment où on aurait besoin d'être déjà en train de sonder. */}
        <AutoReload enabled={!draftState.ended_at && !releaseSelectionActive && adminReleaseSelectionIds.size === 0} intervalMs={8000} />
      </div>

      {me.isAdmin && !seasonStarted && (
        <AdminPanel
          saisonId={saisonId}
          season={season}
          poolers={poolers}
          initialDraftOrder={draftOrder}
          draftState={draftState}
          nhlMinimumSalary={nhlMinimumSalary}
        />
      )}

      {draftState.is_active && currentPoolerName && (
        <div className="bg-white rounded-lg shadow px-5 py-4 mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-gray-700">
              Au tour de : <span className="font-semibold text-blue-700">{currentPoolerName}</span>
              {isPaused && <span className="ml-3 text-sm font-medium text-amber-600">⏸ En pause</span>}
              {remainingSeconds !== null && !isPaused && (
                <span className={`ml-3 text-sm font-mono ${
                  remainingSeconds <= 10 ? 'text-red-600' : remainingSeconds <= 30 ? 'text-amber-600' : 'text-gray-400'
                }`}>
                  ⏱ {String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:{String(remainingSeconds % 60).padStart(2, '0')}
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              File : {draftState.queue.map(id => poolers.find(p => p.id === id)?.name ?? id).join(' → ')}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Les 8 poolers</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {poolers.map(p => (
                <PoolerCard key={p.id} pooler={p} poolCap={poolCap} isCurrentDrafter={p.id === currentPoolerId} isAdmin={me.isAdmin} saisonId={saisonId} onReleaseSelectionChange={setAdminReleaseSelectionFor} />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Activité récente</h2>
            <p className="text-xs text-gray-400 mb-3 -mt-2">Signatures d&apos;agents libres et libérations du ménage pré-saison.</p>
            {recentActivity.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400 text-sm">
                Aucune activité pour l&apos;instant.
              </div>
            ) : (
              <div className="space-y-2">
                {recentActivity.map(r => (
                  <div key={`${r.kind}-${r.id}`} className="bg-white rounded-lg shadow px-4 py-2.5 text-sm flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.kind === 'sign' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="font-medium text-gray-800">{r.poolerName}</span>
                    <span className="text-gray-500">{r.kind === 'sign' ? 'a signé' : 'a libéré'}</span>
                    <span className="font-medium text-gray-800">{r.playerName}</span>
                    {r.position && <span className="text-gray-400 text-xs">({r.position})</span>}
                    <span className="ml-auto text-xs text-gray-400">{fmtDateTime(r.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <MonAlignement
            me={me}
            myPooler={myPooler}
            poolCap={poolCap}
            saisonId={saisonId}
            nhlMinimumSalary={nhlMinimumSalary}
            seasonStarted={seasonStarted}
            releasePhaseOpen={draftState.release_phase_open}
            onReleaseSelectionChange={setReleaseSelectionActive}
          />
        </div>
      </div>
    </div>
  )
}

function PoolerCard({
  pooler, poolCap, isCurrentDrafter, isAdmin, saisonId, onReleaseSelectionChange,
}: {
  pooler: PoolerInfo; poolCap: number; isCurrentDrafter: boolean; isAdmin: boolean; saisonId: number
  onReleaseSelectionChange?: (poolerId: string, active: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [releaseErr, setReleaseErr] = useState<string | null>(null)
  const [releaseMode, setReleaseMode] = useState(false)
  const [selectedForRelease, setSelectedForRelease] = useState<Set<number>>(new Set())

  // Remettre en banque au nom d'un pooler (David, 2026-09-09) — même filet de sécurité que
  // "Libérer au nom d'un pooler", pour le cas où un pooler ne peut pas s'en charger lui-même
  // pendant le repêchage AL. Restreint aux joueurs encore sous protection recrue
  // (rookieType non-null malgré player_type actif/réserviste) — c'est le seul cas où repasser
  // en 'recrue' a un sens ; un vétéran normal n'a pas de banque à retourner.
  const [banquing, setBanquing] = useState(false)
  const [banqueErr, setBanqueErr] = useState<string | null>(null)
  const [banqueMode, setBanqueMode] = useState(false)
  const [selectedForBanque, setSelectedForBanque] = useState<Set<number>>(new Set())

  // Même correctif que MonAlignement (voir AgentsLibresDashboard) — AutoReload coupait une
  // sélection de libération/mise en banque admin en cours (David, 2026-09-09).
  useEffect(() => {
    onReleaseSelectionChange?.(pooler.id, releaseMode || banqueMode)
    return () => onReleaseSelectionChange?.(pooler.id, false)
  }, [releaseMode, banqueMode, pooler.id, onReleaseSelectionChange])

  const remain = poolCap - pooler.capUsed
  const pct = poolCap > 0 ? Math.min(100, (pooler.capUsed / poolCap) * 100) : 0
  const fOk = pooler.counts.forward <= 12, dOk = pooler.counts.defense <= 6, gOk = pooler.counts.goalie <= 2, resOk = pooler.counts.reserviste >= 2
  const firstName = pooler.name.split(' ')[0]

  const toggleReleaseSelect = (playerId: number) => {
    setSelectedForRelease(prev => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })
  }
  const cancelReleaseMode = () => { setReleaseMode(false); setSelectedForRelease(new Set()); setReleaseErr(null) }
  const startReleaseMode = () => { setReleaseMode(true); setBanqueMode(false); setSelectedForBanque(new Set()); setBanqueErr(null) }

  const toggleBanqueSelect = (playerId: number) => {
    setSelectedForBanque(prev => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })
  }
  const cancelBanqueMode = () => { setBanqueMode(false); setSelectedForBanque(new Set()); setBanqueErr(null) }
  const startBanqueMode = () => { setBanqueMode(true); setReleaseMode(false); setSelectedForRelease(new Set()); setReleaseErr(null) }

  // Libérer au nom d'un pooler (David, 2026-09-08) — filet de sécurité pratique pour les
  // tests et pour un pooler qui ne peut pas se connecter pendant le pool ; admin seulement
  // (submitTransactionAction revérifie is_admin côté serveur). Notes 'Ajustement pré-saison',
  // même classe que le libre-service — capté par "Activité récente", jamais annulé par
  // "Réinitialiser le repêchage" (Zone de test, qui ne cible que 'Repêchage pré-saison').
  // Sélection multiple (David, 2026-09-08, suite) — un window.confirm() par joueur devenait
  // vite pénible pour libérer plusieurs joueurs d'un coup ; même patron que "Libérer des
  // joueurs" dans l'onglet Actuel (sélection puis un seul bouton "Libérer (N)", sans confirm).
  const handleConfirmAdminRelease = async () => {
    if (selectedForRelease.size === 0) return
    setReleasing(true); setReleaseErr(null)
    try {
      const items = Array.from(selectedForRelease).map(playerId => ({
        action_type: 'release' as const, from_pooler_id: pooler.id, player_id: playerId,
      }))
      const result = await submitTransactionAction(saisonId, 'Ajustement pré-saison', items)
      if (result.error) { setReleasing(false); setReleaseErr(result.error) } else { window.location.reload() }
    } catch {
      setReleasing(false); setReleaseErr('Erreur inattendue — réessaie.')
    }
  }

  // Remettre en banque au nom d'un pooler (David, 2026-09-09) — type_change vers 'recrue',
  // même mécanique que "Libérer au nom d'un pooler" ci-dessus (même notes, même exclusion du
  // reset de repêchage). rookieType/pool_draft_year ne sont pas touchés par applyTransactionItems
  // pour un type_change — ils restent intacts, exactement comme une vraie ligne de banque.
  const handleConfirmAdminBanque = async () => {
    if (selectedForBanque.size === 0) return
    setBanquing(true); setBanqueErr(null)
    try {
      const items = Array.from(selectedForBanque).map(playerId => {
        const entry = pooler.roster.find(e => e.player_id === playerId)
        return {
          action_type: 'type_change' as const,
          from_pooler_id: pooler.id, to_pooler_id: pooler.id,
          player_id: playerId,
          old_player_type: entry?.player_type,
          new_player_type: 'recrue',
        }
      })
      const result = await submitTransactionAction(saisonId, 'Ajustement pré-saison', items)
      if (result.error) { setBanquing(false); setBanqueErr(result.error) } else { window.location.reload() }
    } catch {
      setBanquing(false); setBanqueErr('Erreur inattendue — réessaie.')
    }
  }

  return (
    <div className={`bg-white rounded-lg shadow p-4 border ${isCurrentDrafter ? 'border-amber-400 ring-2 ring-amber-100' : 'border-transparent'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-800 text-sm">{pooler.name}</span>
        {isCurrentDrafter && <span className="text-[10px] font-bold tracking-wide bg-amber-500 text-white px-1.5 py-0.5 rounded">À TOI</span>}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Masse salariale</span>
        <span className="font-medium text-gray-600">{fmt(pooler.capUsed)} / {fmt(poolCap)}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1">
        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
      <div className={`text-xs font-medium mb-2 ${remain < 0 ? 'text-red-600' : remain < 15_000_000 ? 'text-amber-600' : 'text-emerald-600'}`}>{fmtRemainLine(remain)}</div>
      <div className="flex gap-1.5 flex-wrap mb-2">
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${fOk ? 'text-emerald-600 border-emerald-200' : 'text-red-600 border-red-200'}`}>{pooler.counts.forward}F</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${dOk ? 'text-emerald-600 border-emerald-200' : 'text-red-600 border-red-200'}`}>{pooler.counts.defense}D</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${gOk ? 'text-emerald-600 border-emerald-200' : 'text-red-600 border-red-200'}`}>{pooler.counts.goalie}G</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${resOk ? 'text-emerald-600 border-emerald-200' : 'text-red-600 border-red-200'}`}>{pooler.counts.reserviste} rés.</span>
        {pooler.isOverLimits ? (
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded border text-red-600 border-red-200"
            title={`Dépasse le plafond de ${fmt(Math.abs(pooler.capSpace))}`}
          >
            À libérer
          </span>
        ) : pooler.slotsManquants > 0 && (
          <span
            className={`text-xs font-medium px-1.5 py-0.5 rounded border ${pooler.isReadyForDraft ? 'text-emerald-600 border-emerald-200' : 'text-amber-600 border-amber-200'}`}
            title={`${pooler.slotsManquants} poste(s) à combler — besoin d'au moins ${fmt(pooler.capNeededForReady)} d'espace`}
          >
            {pooler.isReadyForDraft ? 'Prêt' : `Manque ${fmt(pooler.capNeededForReady - pooler.capSpace)}`}
          </span>
        )}
      </div>
      <button onClick={() => setOpen(v => !v)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
        {open ? `Masquer l'alignement de ${firstName} ▴` : `Voir l'alignement de ${firstName} ▾`}
      </button>
      {open && (
        <div className="mt-2 pt-2 border-t space-y-2">
          {isAdmin && pooler.roster.length > 0 && (
            <div className="flex items-center justify-end gap-2 -mt-1">
              {!releaseMode && !banqueMode && (
                <>
                  <button
                    onClick={startReleaseMode}
                    className="text-xs px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded"
                  >
                    Libérer des joueurs
                  </button>
                  {pooler.roster.some(e => e.rookieType) && (
                    <button
                      onClick={startBanqueMode}
                      className="text-xs px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded"
                    >
                      Remettre en banque
                    </button>
                  )}
                </>
              )}
              {(releaseMode || banqueMode) && (
                <button onClick={releaseMode ? cancelReleaseMode : cancelBanqueMode} className="text-xs text-gray-400 hover:text-gray-600">
                  Annuler
                </button>
              )}
            </div>
          )}
          {pooler.roster.length === 0 ? (
            <p className="text-xs text-gray-400">Aucun joueur.</p>
          ) : groupRosterByPosition(pooler.roster).map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{group.label}</p>
              <div className="space-y-0.5">
                {group.entries.map(e => {
                  const selected = selectedForRelease.has(e.player_id)
                  const banqueEligible = !!e.rookieType
                  const banqueSelected = selectedForBanque.has(e.player_id)
                  return (
                    <div key={e.roster_id} className={`flex items-center justify-between text-xs text-gray-600 py-0.5 gap-2 ${selected ? 'bg-red-50 rounded px-1' : banqueSelected ? 'bg-amber-50 rounded px-1' : ''}`}>
                      <span className="flex-1">
                        <span className="text-gray-400 mr-1">{e.position ?? DASH}</span>
                        {e.playerName}
                        {banqueMode && banqueEligible && <span className="ml-1 text-amber-500" title="Encore sous protection recrue — éligible">★</span>}
                      </span>
                      <span className="text-gray-500 shrink-0">{e.cap_number > 0 ? fmt(e.cap_number) : DASH}</span>
                      {isAdmin && releaseMode && (
                        <button
                          onClick={() => toggleReleaseSelect(e.player_id)}
                          className={`w-5 h-5 rounded border text-[10px] shrink-0 flex items-center justify-center ${selected ? 'bg-red-500 text-white border-red-500' : 'text-gray-400 hover:text-red-600'}`}
                        >
                          {selected ? '✓' : ''}
                        </button>
                      )}
                      {isAdmin && banqueMode && banqueEligible && (
                        <button
                          onClick={() => toggleBanqueSelect(e.player_id)}
                          className={`w-5 h-5 rounded border text-[10px] shrink-0 flex items-center justify-center ${banqueSelected ? 'bg-amber-500 text-white border-amber-500' : 'text-gray-400 hover:text-amber-600'}`}
                        >
                          {banqueSelected ? '✓' : ''}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {releaseMode && (
            <div className="flex items-center gap-3 pt-2 border-t">
              <span className="text-xs text-gray-500 flex-1">
                {selectedForRelease.size > 0 ? `${selectedForRelease.size} sélectionné(s)` : 'Coche les joueurs à libérer'}
              </span>
              <button
                onClick={handleConfirmAdminRelease}
                disabled={releasing || selectedForRelease.size === 0}
                className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40"
              >
                {releasing ? '...' : `Libérer (${selectedForRelease.size})`}
              </button>
            </div>
          )}
          {releaseErr && <p className="text-xs text-red-600 mt-1">{releaseErr}</p>}
          {banqueMode && (
            <div className="flex items-center gap-3 pt-2 border-t">
              <span className="text-xs text-gray-500 flex-1">
                {selectedForBanque.size > 0 ? `${selectedForBanque.size} sélectionné(s)` : 'Coche les recrues (★) à remettre en banque'}
              </span>
              <button
                onClick={handleConfirmAdminBanque}
                disabled={banquing || selectedForBanque.size === 0}
                className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40"
              >
                {banquing ? '...' : `Remettre en banque (${selectedForBanque.size})`}
              </button>
            </div>
          )}
          {banqueErr && <p className="text-xs text-red-600 mt-1">{banqueErr}</p>}
        </div>
      )}
    </div>
  )
}

type RecrueOption = { roster_id: number; player_id: number; name: string; position: string | null; cap_number: number }

function MonAlignement({
  me, myPooler, poolCap, saisonId, nhlMinimumSalary, seasonStarted, releasePhaseOpen, onReleaseSelectionChange,
}: {
  me: Me
  myPooler: PoolerInfo | null
  poolCap: number
  saisonId: number
  nhlMinimumSalary: number
  seasonStarted: boolean
  releasePhaseOpen: boolean
  onReleaseSelectionChange?: (active: boolean) => void
}) {
  const [tab, setTab] = useState<'actuel' | 'sandbox'>('actuel')
  const [removed, setRemoved] = useState<Set<number>>(new Set())
  const [added, setAdded] = useState<FreeAgent[]>([])
  // Recrues de la banque ajoutées au bac à sable (David, 2026-09-08) — contrairement aux
  // agents libres ci-dessus, une recrue est déjà signée (cap_number connu), donc son coût est
  // réellement déduit dans la simulation, pas juste affiché à titre indicatif.
  const [addedRecrueIds, setAddedRecrueIds] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FreeAgent[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Libre-service (ménage pré-saison) — actions réelles, distinctes du bac à sable ci-dessous.
  const [busy, setBusy] = useState(false)
  const [selfErr, setSelfErr] = useState<string | null>(null)
  const [togglingReady, setTogglingReady] = useState(false)

  // Déclaration "mon alignement est prêt" (David, 2026-09-08) — confirme uniquement que les
  // actifs/réservistes sont placés comme voulu ; remise à zéro automatiquement côté serveur
  // dès qu'un vrai changement est soumis (submitSelfServiceAction), pas de logique ici.
  const handleToggleReady = async (ready: boolean) => {
    setTogglingReady(true)
    try {
      await setReadyAction(saisonId, ready)
      window.location.reload()
    } catch {
      setTogglingReady(false)
      setSelfErr('Erreur inattendue — réessaie.')
    }
  }
  const [releaseMode, setReleaseMode] = useState(false)
  const [selectedForRelease, setSelectedForRelease] = useState<Set<number>>(new Set())
  // Remettre en banque soi-même (David, 2026-09-09) — même geste que l'admin (PoolerCard),
  // pour un joueur encore sous protection recrue malgré son statut actif/réserviste. Même
  // patron que la sélection de libération ci-dessus (checkboxes puis un seul bouton).
  const [banqueMode, setBanqueMode] = useState(false)
  const [selectedForBanque, setSelectedForBanque] = useState<Set<number>>(new Set())
  const [recruePlayers, setRecruePlayers] = useState<RecrueOption[]>([])
  const [recrueLoading, setRecrueLoading] = useState(!seasonStarted)
  const [selectedRecrueId, setSelectedRecrueId] = useState('')
  const [recrueNewType, setRecrueNewType] = useState<'actif' | 'reserviste'>('actif')

  // Signale au parent qu'une sélection de libération/mise en banque est en cours, pour mettre
  // en pause AutoReload le temps que le pooler coche ses joueurs (voir AgentsLibresDashboard).
  useEffect(() => {
    onReleaseSelectionChange?.(releaseMode || banqueMode)
    return () => onReleaseSelectionChange?.(false)
  }, [releaseMode, banqueMode, onReleaseSelectionChange])

  useEffect(() => {
    if (seasonStarted) return
    loadOwnRecrueBankAction(saisonId).then(res => {
      setRecruePlayers(res.players)
      setRecrueLoading(false)
    })
  }, [saisonId, seasonStarted])

  const toggleReleaseSelect = (playerId: number) => {
    setSelectedForRelease(prev => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })
  }
  const cancelRelease = () => { setReleaseMode(false); setSelectedForRelease(new Set()); setSelfErr(null) }
  const startRelease = () => { setReleaseMode(true); setBanqueMode(false); setSelectedForBanque(new Set()); setSelfErr(null) }

  const toggleBanqueSelect = (playerId: number) => {
    setSelectedForBanque(prev => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })
  }
  const cancelBanque = () => { setBanqueMode(false); setSelectedForBanque(new Set()); setSelfErr(null) }
  const startBanque = () => { setBanqueMode(true); setReleaseMode(false); setSelectedForRelease(new Set()); setSelfErr(null) }

  // Toutes les actions de libre-service ci-dessous passaient par submitSelfServiceAction sans
  // try/catch : une exception inattendue (pas une simple {error} renvoyée) laissait busy=true
  // pour toujours, avec le bouton figé sur "..." sans aucun message visible (David, 2026-09-08
  // — repéré en staging sur une libération de plusieurs joueurs à la fois).
  const handleToggleType = async (entry: RosterEntry) => {
    if (busy) return
    setBusy(true); setSelfErr(null)
    try {
      const newType = entry.player_type === 'actif' ? 'reserviste' : 'actif'
      const result = await submitSelfServiceAction(saisonId, [{
        action_type: 'type_change', player_id: entry.player_id,
        old_player_type: entry.player_type as 'actif' | 'reserviste', new_player_type: newType,
      }])
      if (result.error) { setBusy(false); setSelfErr(result.error) } else { window.location.reload() }
    } catch {
      setBusy(false); setSelfErr('Erreur inattendue — réessaie.')
    }
  }

  const handleConfirmRelease = async () => {
    if (selectedForRelease.size === 0) return
    setBusy(true); setSelfErr(null)
    try {
      const items = Array.from(selectedForRelease).map(playerId => ({ action_type: 'release' as const, player_id: playerId }))
      const result = await submitSelfServiceAction(saisonId, items)
      if (result.error) { setBusy(false); setSelfErr(result.error) } else { window.location.reload() }
    } catch {
      setBusy(false); setSelfErr('Erreur inattendue — réessaie.')
    }
  }

  const handleConfirmBanque = async () => {
    if (selectedForBanque.size === 0 || !myPooler) return
    setBusy(true); setSelfErr(null)
    try {
      const items = Array.from(selectedForBanque).map(playerId => {
        const entry = myPooler.roster.find(e => e.player_id === playerId)
        return {
          action_type: 'type_change' as const, player_id: playerId,
          old_player_type: entry?.player_type as 'actif' | 'reserviste',
          new_player_type: 'recrue' as const,
        }
      })
      const result = await submitSelfServiceAction(saisonId, items)
      if (result.error) { setBusy(false); setSelfErr(result.error) } else { window.location.reload() }
    } catch {
      setBusy(false); setSelfErr('Erreur inattendue — réessaie.')
    }
  }

  const handlePromote = async () => {
    if (!selectedRecrueId) return
    setBusy(true); setSelfErr(null)
    try {
      const result = await submitSelfServiceAction(saisonId, [{
        action_type: 'promote', player_id: Number(selectedRecrueId), new_player_type: recrueNewType,
      }])
      if (result.error) { setBusy(false); setSelfErr(result.error) } else { window.location.reload() }
    } catch {
      setBusy(false); setSelfErr('Erreur inattendue — réessaie.')
    }
  }

  // Libérer une recrue de sa propre banque (n'importe laquelle, pas seulement celles à
  // protection expirée — le pooler peut renoncer à un prospect à tout moment). Même
  // action_type 'release' que pour un actif/réserviste : tracé comme une vraie transaction
  // (roster_change_log, "Activité récente"), contrairement au retrait silencieux de
  // l'admin dans la banque de recrues (BanqueRecruesManager.tsx, Mode init).
  const handleReleaseRecrue = async () => {
    if (!selectedRecrueId) return
    const rookie = recruePlayers.find(r => String(r.player_id) === selectedRecrueId)
    if (!window.confirm(`Libérer ${rookie?.name ?? 'cette recrue'} ? Elle redevient un agent libre, disponible pour n'importe quel pooler.`)) return
    setBusy(true); setSelfErr(null)
    try {
      const result = await submitSelfServiceAction(saisonId, [{ action_type: 'release', player_id: Number(selectedRecrueId) }])
      if (result.error) { setBusy(false); setSelfErr(result.error) } else { window.location.reload() }
    } catch {
      setBusy(false); setSelfErr('Erreur inattendue — réessaie.')
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const res = await searchFreeAgentsAction(saisonId, query)
      setSearching(false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setResults((res.players ?? []).map((p: any) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, position: p.position })))
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, saisonId])

  const toggleRemove = (playerId: number) => {
    setRemoved(prev => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })
  }
  const addFA = (fa: FreeAgent) => {
    if (added.some(a => a.id === fa.id)) return
    setAdded(prev => [...prev, fa])
    setQuery('')
    setResults([])
  }
  const removeAdded = (id: number) => setAdded(prev => prev.filter(a => a.id !== id))
  const toggleAddedRecrue = (playerId: number) => {
    setAddedRecrueIds(prev => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })
  }
  const resetSandbox = () => { setRemoved(new Set()); setAdded([]); setAddedRecrueIds(new Set()); setQuery(''); setResults([]) }

  // Soumettre pour vrai les retraits testés dans le bac à sable (David, 2026-09-08) — même
  // action_type 'release' que le flux de l'onglet Actuel, donc soumis au même garde-fou
  // serveur (phase de libération). Volontairement limité aux joueurs déjà possédés (`removed`)
  // — les agents libres ajoutés (`added`) ne servent qu'à simuler l'impact salarial d'une
  // signature pas encore faite ; signer reste admin-only, jamais soumis d'ici.
  const handleSubmitSandboxReleases = async () => {
    if (removed.size === 0) return
    if (!window.confirm(`Libérer ${removed.size} joueur${removed.size > 1 ? 's' : ''} pour vrai ? Cette partie du bac à sable sera appliquée à ton alignement réel.`)) return
    setBusy(true); setSelfErr(null)
    try {
      const items = Array.from(removed).map(playerId => ({ action_type: 'release' as const, player_id: playerId }))
      const result = await submitSelfServiceAction(saisonId, items)
      if (result.error) { setBusy(false); setSelfErr(result.error) } else { window.location.reload() }
    } catch {
      setBusy(false); setSelfErr('Erreur inattendue — réessaie.')
    }
  }

  if (!myPooler) {
    return (
      <div className="bg-white rounded-lg shadow p-5 text-sm text-gray-400">
        Aucun alignement trouvé pour ton compte cette saison.
      </div>
    )
  }

  const hasEligibleForBanque = myPooler.roster.some(e => e.rookieType && (e.player_type === 'actif' || e.player_type === 'reserviste'))
  const removedCap = myPooler.roster.filter(e => removed.has(e.player_id)).reduce((s, e) => s + e.cap_number, 0)
  const addedRecrueCap = recruePlayers.filter(r => addedRecrueIds.has(r.player_id)).reduce((s, r) => s + r.cap_number, 0)
  const simulatedUsed = myPooler.capUsed - removedCap + addedRecrueCap
  const simulatedRemain = poolCap - simulatedUsed
  const touched = removed.size > 0 || added.length > 0 || addedRecrueIds.size > 0

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Mon alignement — {me.name}</h2>

        {!seasonStarted && (
          <div className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 mb-4 ${myPooler.readyAt ? 'bg-emerald-50' : 'bg-gray-50'}`}>
            <p className="text-xs text-gray-600">
              {myPooler.readyAt
                ? '✓ Alignement déclaré prêt — toute modification annulera cette déclaration.'
                : 'Une fois tes actifs/réservistes placés comme tu le veux, déclare ton alignement prêt.'}
            </p>
            <button
              onClick={() => handleToggleReady(!myPooler.readyAt)}
              disabled={togglingReady}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 disabled:opacity-40 ${myPooler.readyAt ? 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
            >
              {togglingReady ? '...' : myPooler.readyAt ? 'Annuler' : '✓ Mon alignement est prêt'}
            </button>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('actuel')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${tab === 'actuel' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Actuel
          </button>
          <button
            onClick={() => setTab('sandbox')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${tab === 'sandbox' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Bac à sable
          </button>
        </div>

        {tab === 'actuel' ? (
          <>
            <p className="text-xs text-gray-400 mb-3">
              {seasonStarted
                ? 'Synchronisé automatiquement avec ce que l\'admin a signé pour toi.'
                : 'Ajuste toi-même ton alignement pendant le ménage pré-saison — libère, mets en réserve, active une recrue.'}
            </p>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500">Masse salariale</span>
              <span className="font-medium">{fmt(myPooler.capUsed)}</span>
            </div>
            <div className="flex justify-between text-sm mb-3">
              <span className="text-gray-500">{remainLabel(poolCap - myPooler.capUsed)}</span>
              <span className={`font-medium ${poolCap - myPooler.capUsed >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {fmt(Math.abs(poolCap - myPooler.capUsed))}
              </span>
            </div>
            {myPooler.isOverLimits && (
              <p className="text-xs mb-3 rounded-lg px-2 py-1.5 bg-red-50 text-red-600">
                ⚠ Dépasse le plafond de {fmt(Math.abs(myPooler.capSpace))} — libère des joueurs avant de pouvoir participer au repêchage.
              </p>
            )}
            {!myPooler.isOverLimits && myPooler.slotsManquants > 0 && (
              <p className={`text-xs mb-3 rounded-lg px-2 py-1.5 ${myPooler.isReadyForDraft ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                {myPooler.isReadyForDraft ? '✓' : '⚠'} {myPooler.slotsManquants} poste{myPooler.slotsManquants > 1 ? 's' : ''} à combler — besoin d&apos;au moins{' '}
                {fmt(myPooler.capNeededForReady)} d&apos;espace (salaire minimum {fmt(nhlMinimumSalary)}/poste).
                {!myPooler.isReadyForDraft && ' Pas encore assez d\'espace pour compléter légalement l\'alignement.'}
              </p>
            )}
            {!seasonStarted && !releasePhaseOpen && (
              <p className="text-xs mb-2 rounded-lg px-2 py-1.5 bg-gray-50 text-gray-500">
                La phase de libération de joueurs signés est fermée par l&apos;admin — seules les recrues de ta banque restent activables/libérables (ci-dessous){hasEligibleForBanque ? ', et tu peux toujours en remettre une en banque ci-dessous' : ''}.
              </p>
            )}
            {!seasonStarted && (releasePhaseOpen || hasEligibleForBanque) && (
              <div className="flex items-center justify-end gap-2 mb-2">
                {!releaseMode && !banqueMode && (
                  <>
                    {releasePhaseOpen && (
                      <button
                        onClick={startRelease}
                        disabled={busy}
                        className="text-xs px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded disabled:opacity-40"
                      >
                        Libérer des joueurs
                      </button>
                    )}
                    {hasEligibleForBanque && (
                      <button
                        onClick={startBanque}
                        disabled={busy}
                        className="text-xs px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded disabled:opacity-40"
                      >
                        Remettre en banque
                      </button>
                    )}
                  </>
                )}
                {(releaseMode || banqueMode) && (
                  <button onClick={releaseMode ? cancelRelease : cancelBanque} className="text-xs text-gray-400 hover:text-gray-600">
                    Annuler
                  </button>
                )}
              </div>
            )}

            <div className="border-t pt-2 space-y-2">
              {groupRosterByPosition(myPooler.roster).map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{group.label}</p>
                  <div className="space-y-1">
                    {group.entries.map(e => {
                      const canToggleType = !seasonStarted && (e.player_type === 'actif' || e.player_type === 'reserviste')
                      const canRelease = canToggleType && releasePhaseOpen
                      const banqueEligible = canToggleType && !!e.rookieType
                      const selected = selectedForRelease.has(e.player_id)
                      const banqueSelected = selectedForBanque.has(e.player_id)
                      return (
                        <div key={e.roster_id} className={`flex items-center justify-between text-xs py-1 gap-2 ${selected ? 'bg-red-50 rounded px-1' : banqueSelected ? 'bg-amber-50 rounded px-1' : ''}`}>
                          <span className="flex-1 text-gray-600">
                            <span className="text-gray-400 mr-1">{e.position ?? DASH}</span>
                            {e.playerName}
                            {banqueMode && banqueEligible && <span className="ml-1 text-amber-500" title="Encore sous protection recrue — éligible">★</span>}
                          </span>
                          <span className="text-gray-500 shrink-0">{e.cap_number > 0 ? fmt(e.cap_number) : DASH}</span>
                          {canToggleType && !releaseMode && !banqueMode && (
                            <button
                              onClick={() => handleToggleType(e)}
                              disabled={busy}
                              title={e.player_type === 'actif' ? 'Mettre en réserve' : 'Activer'}
                              className="text-[10px] px-1.5 py-0.5 border rounded text-gray-500 hover:text-blue-600 hover:border-blue-300 shrink-0 disabled:opacity-40"
                            >
                              {e.player_type === 'actif' ? '→ Rés.' : '→ Actif'}
                            </button>
                          )}
                          {canRelease && releaseMode && (
                            <button
                              onClick={() => toggleReleaseSelect(e.player_id)}
                              className={`w-5 h-5 rounded border text-[10px] shrink-0 flex items-center justify-center ${selected ? 'bg-red-500 text-white border-red-500' : 'text-gray-400 hover:text-red-600'}`}
                            >
                              {selected ? '✓' : ''}
                            </button>
                          )}
                          {banqueEligible && banqueMode && (
                            <button
                              onClick={() => toggleBanqueSelect(e.player_id)}
                              className={`w-5 h-5 rounded border text-[10px] shrink-0 flex items-center justify-center ${banqueSelected ? 'bg-amber-500 text-white border-amber-500' : 'text-gray-400 hover:text-amber-600'}`}
                            >
                              {banqueSelected ? '✓' : ''}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {releaseMode && (
              <div className="flex items-center gap-3 pt-2 mt-2 border-t">
                <span className="text-xs text-gray-500 flex-1">
                  {selectedForRelease.size > 0 ? `${selectedForRelease.size} sélectionné(s)` : 'Coche les joueurs à libérer'}
                </span>
                <button
                  onClick={handleConfirmRelease}
                  disabled={busy || selectedForRelease.size === 0}
                  className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40"
                >
                  {busy ? '...' : `Libérer (${selectedForRelease.size})`}
                </button>
              </div>
            )}

            {banqueMode && (
              <div className="flex items-center gap-3 pt-2 mt-2 border-t">
                <span className="text-xs text-gray-500 flex-1">
                  {selectedForBanque.size > 0 ? `${selectedForBanque.size} sélectionné(s)` : 'Coche les recrues (★) à remettre en banque'}
                </span>
                <button
                  onClick={handleConfirmBanque}
                  disabled={busy || selectedForBanque.size === 0}
                  className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40"
                >
                  {busy ? '...' : `Remettre en banque (${selectedForBanque.size})`}
                </button>
              </div>
            )}

            {selfErr && <p className="text-xs text-red-600 mt-2">{selfErr}</p>}

            {!seasonStarted && (
              <div className="border-t pt-3 mt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Activer ou libérer une recrue</p>
                {recrueLoading ? (
                  <p className="text-xs text-gray-400">Chargement...</p>
                ) : recruePlayers.length === 0 ? (
                  <p className="text-xs text-gray-400">Aucune recrue dans ta banque.</p>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={selectedRecrueId}
                      onChange={e => setSelectedRecrueId(e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                    >
                      <option value="">— Choisir une recrue —</option>
                      {recruePlayers.map(r => (
                        <option key={r.player_id} value={String(r.player_id)}>
                          {r.name} ({r.position ?? DASH}){r.cap_number > 0 ? ` — ${fmt(r.cap_number)}` : ''}
                        </option>
                      ))}
                    </select>
                    {selectedRecrueId && (
                      <>
                        <select
                          value={recrueNewType}
                          onChange={e => setRecrueNewType(e.target.value as 'actif' | 'reserviste')}
                          className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        >
                          <option value="actif">Actif</option>
                          <option value="reserviste">Réserviste</option>
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={handlePromote}
                            disabled={busy}
                            className="flex-1 text-xs bg-emerald-600 text-white py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-40"
                          >
                            {busy ? '...' : 'Activer'}
                          </button>
                          <button
                            onClick={handleReleaseRecrue}
                            disabled={busy}
                            className="flex-1 text-xs bg-red-50 text-red-600 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-40"
                          >
                            {busy ? '...' : 'Libérer'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-3">Ajoute ou retire librement pour tester. Rien n&apos;est sauvegardé automatiquement — un retrait peut être soumis pour vrai ci-dessous, un ajout reste toujours une simulation.</p>
            <div className="space-y-2 mb-2">
              {groupRosterByPosition(myPooler.roster).map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{group.label}</p>
                  <div className="space-y-1">
                    {group.entries.map(e => (
                      <div key={e.roster_id} className={`flex items-center justify-between text-xs py-1 ${removed.has(e.player_id) ? 'opacity-40 line-through' : 'text-gray-600'}`}>
                        <span><span className="text-gray-400 mr-1">{e.position ?? DASH}</span>{e.playerName}</span>
                        <span className="flex items-center gap-2">
                          <span>{e.cap_number > 0 ? fmt(e.cap_number) : DASH}</span>
                          <button onClick={() => toggleRemove(e.player_id)} className="w-5 h-5 rounded border text-gray-400 hover:text-red-600 text-[10px]">
                            {removed.has(e.player_id) ? '↺' : '✕'}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {recruePlayers.filter(r => addedRecrueIds.has(r.player_id)).map(r => (
                <div key={r.player_id} className="flex items-center justify-between text-xs py-1 text-emerald-700">
                  <span><span className="text-gray-400 mr-1">{r.position ?? DASH}</span>{r.name} <span className="text-emerald-500">(recrue activée)</span></span>
                  <span className="flex items-center gap-2">
                    <span>{r.cap_number > 0 ? fmt(r.cap_number) : DASH}</span>
                    <button onClick={() => toggleAddedRecrue(r.player_id)} className="w-5 h-5 rounded border text-gray-400 hover:text-red-600 text-[10px]">✕</button>
                  </span>
                </div>
              ))}
              {added.map(fa => (
                <div key={fa.id} className="flex items-center justify-between text-xs py-1 text-emerald-700">
                  <span><span className="text-gray-400 mr-1">{fa.position ?? DASH}</span>{fa.last_name}, {fa.first_name} <span className="text-emerald-500">(ajouté)</span></span>
                  <button onClick={() => removeAdded(fa.id)} className="w-5 h-5 rounded border text-gray-400 hover:text-red-600 text-[10px]">✕</button>
                </div>
              ))}
            </div>

            {removed.size > 0 && releasePhaseOpen && (
              <button
                onClick={handleSubmitSandboxReleases}
                disabled={busy}
                className="w-full text-xs font-medium bg-red-600 text-white rounded-lg py-1.5 mb-2 hover:bg-red-700 disabled:opacity-40"
              >
                {busy ? '...' : `Soumettre la libération (${removed.size})`}
              </button>
            )}
            {removed.size > 0 && !releasePhaseOpen && (
              <p className="text-xs mb-2 rounded-lg px-2 py-1.5 bg-gray-50 text-gray-500">
                La phase de libération est fermée — ce retrait ne peut plus être soumis pour vrai.
              </p>
            )}
            {selfErr && <p className="text-xs text-red-600 mb-2">{selfErr}</p>}
            <button onClick={resetSandbox} className="w-full text-xs font-medium text-gray-500 border rounded-lg py-1.5 mb-3 hover:bg-gray-50">
              ↺ Réinitialiser (revenir à l&apos;actuel)
            </button>

            {recruePlayers.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ajouter une recrue de ta banque</p>
                <div className="space-y-0.5">
                  {recruePlayers.filter(r => !addedRecrueIds.has(r.player_id)).map(r => (
                    <div key={r.player_id} onClick={() => toggleAddedRecrue(r.player_id)} className="flex justify-between text-xs px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                      <span><span className="text-gray-400 mr-1">{r.position ?? DASH}</span>{r.name}{r.cap_number > 0 ? ` — ${fmt(r.cap_number)}` : ''}</span>
                      <span className="text-blue-600 font-medium">+</span>
                    </div>
                  ))}
                  {recruePlayers.every(r => addedRecrueIds.has(r.player_id)) && (
                    <p className="text-xs text-gray-400">Toutes tes recrues sont déjà ajoutées.</p>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ajouter un agent libre</p>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher (2+ caractères)..."
              className="w-full border rounded-lg px-2.5 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searching && <p className="text-xs text-gray-400 mb-2">Recherche...</p>}
            {results.length > 0 && (
              <div className="space-y-0.5 mb-3 max-h-40 overflow-y-auto">
                {results.map(fa => (
                  <div key={fa.id} onClick={() => addFA(fa)} className="flex justify-between text-xs px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                    <span>{fa.last_name}, {fa.first_name} <span className="text-gray-400">{fa.position}</span></span>
                    <span className="text-blue-600 font-medium">+</span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t pt-2 mt-1 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Masse salariale simulée</span>
                <span className="font-medium">{fmt(simulatedUsed)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">{simulatedRemain >= 0 ? 'Espace restant simulé' : 'Dépassement simulé'}</span>
                <span className={`font-medium ${simulatedRemain < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(Math.abs(simulatedRemain))}</span>
              </div>
              {touched && (
                <p className={`text-xs mt-1 rounded-lg px-2 py-1.5 ${simulatedRemain < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {simulatedRemain < 0 ? '⚠ Dépasserait le plafond' : '✓ Combinaison conforme'}
                </p>
              )}
              {added.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Le coût des joueurs ajoutés n&apos;est pas déduit ici (contrat pas encore signé) — sert à repérer les noms disponibles, pas à calculer leur impact exact. Jamais soumis d&apos;ici : signer un agent libre reste réservé à l&apos;admin, pendant ton tour.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
