'use client'

import { useEffect, useState } from 'react'
import {
  loadRosterForSimulationAction, listScenariosAction, loadScenarioAction,
  saveScenarioAction, deleteScenarioAction, listOtherPoolersAction, loadRecrueBankForPoolerAction,
  loadPlayerByIdAction,
  type SimRosterEntry, type ScenarioData,
} from './actions'
import { listTeamsAction } from '../repechage-agents-libres/actions'
import { useSimState, groupRosterEntries, type RecrueOption, type SimEntry } from './useSimState'
import SimPanel from './SimPanel'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const DASH = '—'

// Colonne de référence en lecture seule (David, 2026-09-21) — l'alignement RÉEL, sans aucun
// toggle ni bouton, affiché à côté du panneau simulé (onglet "Mon alignement" seulement) pour
// comparer d'un coup d'œil sans avoir à se souvenir de l'état de départ derrière les lignes
// biffées du panneau simulé.
function CurrentRosterColumn({ roster }: { roster: SimRosterEntry[] }) {
  return (
    <div>
      <h3 className="font-semibold text-gray-800 mb-3">Alignement actuel</h3>
      <div className="space-y-2">
        {groupRosterEntries(roster).map(group => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{group.label}</p>
            <div className="space-y-1">
              {group.entries.map(e => (
                <div key={e.roster_id} className="flex items-center justify-between text-sm py-1 text-gray-600">
                  <span className="truncate"><span className="text-gray-400 mr-1">{e.position ?? DASH}</span>{e.playerName}</span>
                  <span className="text-gray-500 shrink-0">{e.cap_number > 0 ? fmt(e.cap_number) : DASH}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

type Scenario = { id: number; name: string; updated_at: string }
type Tab = 'moi' | 'transaction'

// Combine le retrait chez la source et l'arrivée chez la destination — un échange, c'est
// exactement ça (David, 2026-09-14 suite). Réservé aux joueurs kind='current' (canSend) : un
// agent libre ou une recrue tout juste ajoutés en simulation ne sont pas "à toi" pour de vrai.
function sendEntry(entry: SimEntry, from: ReturnType<typeof useSimState>, to: ReturnType<typeof useSimState>, fromLabel: string) {
  from.toggleRemove(entry.playerId)
  to.addFA({
    id: entry.playerId, first_name: entry.firstName, last_name: entry.lastName,
    position: entry.position, cap_number: entry.capNumber, ownerName: fromLabel,
  })
}

export default function SimulationTool({
  me, saisonId, season, preloadPlayerId,
}: {
  me: { id: string; name: string }
  saisonId: number
  season: string
  // Pré-remplit "Mon alignement" avec ce joueur en simulation (lien "Analyser" depuis l'onglet
  // Ballotage de /gestion-effectifs, David 2026-09-21) — pour évaluer l'impact d'une réclamation
  // avant de s'engager, sans rien soumettre pour de vrai.
  preloadPlayerId?: number
}) {
  const [tab, setTab] = useState<Tab>('moi')

  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [myRoster, setMyRoster] = useState<SimRosterEntry[]>([])
  const [myRecrue, setMyRecrue] = useState<RecrueOption[]>([])
  const [poolCap, setPoolCap] = useState(0)
  const [teams, setTeams] = useState<{ code: string; name: string }[]>([])

  const myState = useSimState(myRoster, myRecrue)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      loadRosterForSimulationAction(saisonId, me.id),
      loadRecrueBankForPoolerAction(saisonId, me.id),
      listTeamsAction(),
    ]).then(([rosterRes, recrueRes, teamsRes]) => {
      if (rosterRes.error || !rosterRes.roster) {
        setLoadErr(rosterRes.error ?? 'Impossible de charger ton alignement.')
      } else {
        setMyRoster(rosterRes.roster)
        setPoolCap(rosterRes.poolCap ?? 0)
      }
      setMyRecrue(recrueRes.players)
      setTeams(teamsRes.teams)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisonId, me.id])

  // Ajoute automatiquement le joueur pré-rempli (lien "Analyser" depuis Ballotage) une fois
  // l'alignement chargé — une seule fois, même si l'effet ré-exécute (David, 2026-09-21).
  const [preloadDone, setPreloadDone] = useState(false)
  useEffect(() => {
    if (loading || preloadDone || !preloadPlayerId) return
    setPreloadDone(true)
    loadPlayerByIdAction(saisonId, preloadPlayerId).then(res => {
      const p = res.player
      if (p) myState.addFA({ id: p.id, first_name: p.first_name, last_name: p.last_name, position: p.position, cap_number: p.cap_number, ownerName: p.owner_name })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, preloadDone, preloadPlayerId, saisonId])

  // ── Scénarios sauvegardés (onglet "Mon alignement" seulement) — David, 2026-09-14.
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [activeScenarioId, setActiveScenarioId] = useState<number | null>(null)
  const [saveAsName, setSaveAsName] = useState('')
  const [scenarioBusy, setScenarioBusy] = useState(false)
  const [scenarioMsg, setScenarioMsg] = useState<string | null>(null)

  const refreshScenarios = () => { listScenariosAction(saisonId).then(res => setScenarios(res.scenarios)) }
  useEffect(() => { refreshScenarios() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [saisonId])

  const handleLoadScenario = async (id: number) => {
    if (!id) { myState.reset(); setActiveScenarioId(null); setSaveAsName(''); setScenarioMsg(null); return }
    setScenarioBusy(true); setScenarioMsg(null)
    const res = await loadScenarioAction(id)
    setScenarioBusy(false)
    if (res.error || !res.data) { setScenarioMsg(res.error ?? 'Erreur de chargement.'); return }
    myState.restore({ ...res.data, currentTypeOverrides: res.data.currentTypeOverrides ?? [] })
    setActiveScenarioId(id)
    setSaveAsName(scenarios.find(s => s.id === id)?.name ?? '')
  }

  const handleSaveScenario = async () => {
    if (!saveAsName.trim()) { setScenarioMsg('Donne un nom au scénario.'); return }
    setScenarioBusy(true); setScenarioMsg(null)
    const data: ScenarioData = {
      removed: Array.from(myState.removed),
      added: myState.added,
      addedRecrues: Array.from(myState.addedRecrues.entries()).map(([id, playerType]) => ({ id, playerType })),
      currentTypeOverrides: [],
    }
    const res = await saveScenarioAction(saisonId, saveAsName, data)
    setScenarioBusy(false)
    if (res.error) { setScenarioMsg(res.error); return }
    setActiveScenarioId(res.id ?? null)
    setScenarioMsg('Scénario sauvegardé.')
    refreshScenarios()
  }

  const handleDeleteScenario = async () => {
    if (!activeScenarioId) return
    if (!window.confirm(`Supprimer le scénario "${saveAsName}" ?`)) return
    setScenarioBusy(true); setScenarioMsg(null)
    const res = await deleteScenarioAction(activeScenarioId)
    setScenarioBusy(false)
    if (res.error) { setScenarioMsg(res.error); return }
    myState.reset(); setActiveScenarioId(null); setSaveAsName('')
    refreshScenarios()
  }

  // ── Onglet Transaction — David, 2026-09-14 suite.
  const [otherPoolers, setOtherPoolers] = useState<{ id: string; name: string }[]>([])
  const [otherId, setOtherId] = useState('')
  const [otherLoading, setOtherLoading] = useState(false)
  const [otherRoster, setOtherRoster] = useState<SimRosterEntry[]>([])
  const [otherRecrue, setOtherRecrue] = useState<RecrueOption[]>([])
  const [otherPoolCap, setOtherPoolCap] = useState(0)

  const otherState = useSimState(otherRoster, otherRecrue)

  useEffect(() => {
    listOtherPoolersAction().then(res => setOtherPoolers(res.poolers))
  }, [])

  const handlePickOther = (id: string) => {
    setOtherId(id)
    // Seul otherState est remis à zéro — son contenu appartenait au pooler précédemment
    // sélectionné, plus pertinent une fois qu'on change de cible. myState reste intact : un
    // envoi déjà fait vers l'ancien pooler (ou un test dans l'onglet "Mon alignement") doit
    // survivre au changement de cible, pas être effacé silencieusement.
    otherState.reset()
    if (!id) { setOtherRoster([]); setOtherRecrue([]); return }
    setOtherLoading(true)
    Promise.all([
      loadRosterForSimulationAction(saisonId, id),
      loadRecrueBankForPoolerAction(saisonId, id),
    ]).then(([rosterRes, recrueRes]) => {
      setOtherRoster(rosterRes.roster ?? [])
      setOtherPoolCap(rosterRes.poolCap ?? 0)
      setOtherRecrue(recrueRes.players)
      setOtherLoading(false)
    })
  }

  const otherName = otherPoolers.find(p => p.id === otherId)?.name ?? ''

  if (loading) return <p className="text-gray-400 text-sm">Chargement...</p>
  if (loadErr) return <p className="text-red-600 text-sm">{loadErr}</p>

  const tabClass = (t: Tab) =>
    `text-sm font-semibold px-3 py-1.5 rounded-lg ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Simulation</h1>
        <p className="text-sm text-gray-500 mt-1">
          Teste des ajouts/retraits sans rien changer pour de vrai — {me.name}, saison {season}.
          Pour un vrai changement, utilise Gestion d&apos;effectifs.
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('moi')} className={tabClass('moi')}>Mon alignement</button>
        <button onClick={() => setTab('transaction')} className={tabClass('transaction')}>Transaction</button>
      </div>

      {tab === 'moi' && (
        <>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Scénarios sauvegardés</p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={activeScenarioId ?? ''}
                onChange={e => handleLoadScenario(e.target.value ? Number(e.target.value) : 0)}
                disabled={scenarioBusy}
                className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none"
              >
                <option value="">— Nouveau scénario —</option>
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input
                value={saveAsName}
                onChange={e => setSaveAsName(e.target.value)}
                placeholder="Nom du scénario"
                className="border rounded-lg px-2 py-1.5 text-sm w-48 focus:outline-none"
              />
              <button
                onClick={handleSaveScenario}
                disabled={scenarioBusy || !myState.touched && !activeScenarioId}
                className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                Sauvegarder
              </button>
              {activeScenarioId && (
                <button
                  onClick={handleDeleteScenario}
                  disabled={scenarioBusy}
                  className="text-sm px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40"
                >
                  Supprimer
                </button>
              )}
            </div>
            {scenarioMsg && <p className="text-xs text-gray-500 mt-2">{scenarioMsg}</p>}
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <p className="text-xs text-gray-400 mb-3">
              Ajoute ou retire librement pour tester — rien n&apos;affecte ton vrai alignement, jamais soumis d&apos;ici.
            </p>
            {/* Colonne "Alignement actuel" en lecture seule à gauche (David, 2026-09-21) — pour
                comparer sans se souvenir de l'état de départ derrière les lignes biffées. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CurrentRosterColumn roster={myRoster} />
              <SimPanel title="Alignement simulé" poolCap={poolCap} state={myState} recruePlayers={myRecrue} teams={teams} saisonId={saisonId} />
            </div>
          </div>
        </>
      )}

      {tab === 'transaction' && (
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-xs text-gray-400 mb-3">
            Choisis un pooler pour simuler une transaction — retire/ajoute des deux côtés, ou envoie un de tes
            joueurs directement chez lui (→) et vice-versa. Purement en preview, jamais soumis pour de vrai.
          </p>
          <select
            value={otherId}
            onChange={e => handlePickOther(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm mb-4 focus:outline-none"
          >
            <option value="">— Choisir un pooler —</option>
            {otherPoolers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {!otherId && <p className="text-sm text-gray-400">Choisis un pooler ci-dessus pour commencer.</p>}
          {otherId && otherLoading && <p className="text-sm text-gray-400">Chargement...</p>}
          {otherId && !otherLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <SimPanel
                title={me.name} poolCap={poolCap} state={myState} recruePlayers={myRecrue} teams={teams} saisonId={saisonId}
                onSend={e => sendEntry(e, myState, otherState, me.name)}
                sendLabel={`Envoyer à ${otherName}`}
              />
              <SimPanel
                title={otherName} poolCap={otherPoolCap} state={otherState} recruePlayers={otherRecrue} teams={teams} saisonId={saisonId}
                onSend={e => sendEntry(e, otherState, myState, otherName)}
                sendLabel={`Envoyer à ${me.name}`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
