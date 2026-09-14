'use client'

import { useEffect, useRef, useState } from 'react'
import {
  loadMyRosterForSimulationAction, listScenariosAction, loadScenarioAction,
  saveScenarioAction, deleteScenarioAction, searchSimulationPlayersAction,
  type SimRosterEntry, type ScenarioData, type SimulationPlayerResult,
} from './actions'
import { loadOwnRecrueBankAction, listTeamsAction } from '../repechage-agents-libres/actions'

type PlayerType = 'actif' | 'reserviste'
type FreeAgent = {
  id: number; first_name: string; last_name: string; position: string | null; cap_number: number
  playerType: PlayerType; ownerName: string | null
}
type RecrueOption = { roster_id: number; player_id: number; name: string; position: string | null; cap_number: number }
type Scenario = { id: number; name: string; updated_at: string }

type SimEntry = {
  key: string
  playerId: number
  playerName: string
  position: string | null
  capNumber: number
  playerType: PlayerType
  removedFlag: boolean
  kind: 'current' | 'recrue' | 'fa'
  ownerName?: string | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const DASH = '—'

function posBucket(position: string | null): 'forward' | 'defense' | 'goalie' {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

// Regroupe l'alignement courant + les ajouts simulés (recrues activées, agents libres/joueurs
// possédés ajoutés) en une seule vue par position/réserve, selon le statut actif/réserviste
// choisi pour chaque ajout (David, 2026-09-14 — avant ça, les ajouts s'affichaient à part, sans
// distinction actif/réserviste, donc sans impact sur les compteurs de poste).
function buildSimEntries(
  roster: SimRosterEntry[], removed: Set<number>,
  recruePlayers: RecrueOption[], addedRecrues: Map<number, PlayerType>,
  added: FreeAgent[],
): SimEntry[] {
  const current: SimEntry[] = roster.map(e => ({
    key: `cur-${e.player_id}`, playerId: e.player_id, playerName: e.playerName,
    position: e.position, capNumber: e.cap_number,
    playerType: e.player_type === 'reserviste' ? 'reserviste' : 'actif',
    removedFlag: removed.has(e.player_id), kind: 'current',
  }))
  const recrue: SimEntry[] = recruePlayers
    .filter(r => addedRecrues.has(r.player_id))
    .map(r => ({
      key: `rec-${r.player_id}`, playerId: r.player_id, playerName: r.name,
      position: r.position, capNumber: r.cap_number,
      playerType: addedRecrues.get(r.player_id)!, removedFlag: false, kind: 'recrue',
    }))
  const fa: SimEntry[] = added.map(a => ({
    key: `fa-${a.id}`, playerId: a.id, playerName: `${a.last_name}, ${a.first_name}`,
    position: a.position, capNumber: a.cap_number ?? 0,
    playerType: a.playerType, removedFlag: false, kind: 'fa', ownerName: a.ownerName,
  }))
  return [...current, ...recrue, ...fa]
}

function groupSimEntries(entries: SimEntry[]): { label: string; entries: SimEntry[] }[] {
  const groups: { label: string; match: (e: SimEntry) => boolean }[] = [
    { label: 'Attaquants', match: e => e.playerType === 'actif' && posBucket(e.position) === 'forward' },
    { label: 'Défenseurs', match: e => e.playerType === 'actif' && posBucket(e.position) === 'defense' },
    { label: 'Gardiens', match: e => e.playerType === 'actif' && posBucket(e.position) === 'goalie' },
    { label: 'Réservistes', match: e => e.playerType === 'reserviste' },
  ]
  return groups
    .map(g => ({ label: g.label, entries: entries.filter(g.match).sort((a, b) => b.capNumber - a.capNumber) }))
    .filter(g => g.entries.length > 0)
}

function TypeToggle({ value, onChange }: { value: PlayerType; onChange: (t: PlayerType) => void }) {
  return (
    <span className="inline-flex rounded border overflow-hidden text-[10px] shrink-0">
      <button
        onClick={() => onChange('actif')}
        className={`px-1.5 py-0.5 ${value === 'actif' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
      >
        Actif
      </button>
      <button
        onClick={() => onChange('reserviste')}
        className={`px-1.5 py-0.5 border-l ${value === 'reserviste' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
      >
        Rés.
      </button>
    </span>
  )
}

export default function SimulationTool({
  me, saisonId, season,
}: {
  me: { id: string; name: string }
  saisonId: number
  season: string
}) {
  const [loading, setLoading] = useState(true)
  const [roster, setRoster] = useState<SimRosterEntry[]>([])
  const [capUsed, setCapUsed] = useState(0)
  const [poolCap, setPoolCap] = useState(0)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [removed, setRemoved] = useState<Set<number>>(new Set())
  const [added, setAdded] = useState<FreeAgent[]>([])
  const [addedRecrues, setAddedRecrues] = useState<Map<number, PlayerType>>(new Map())

  const [recruePlayers, setRecruePlayers] = useState<RecrueOption[]>([])
  const [selectedRecrueId, setSelectedRecrueId] = useState('')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SimulationPlayerResult[]>([])
  const [resultsTruncated, setResultsTruncated] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [filterPosition, setFilterPosition] = useState<'' | 'forward' | 'defense' | 'goalie'>('')
  const [filterMaxSalary, setFilterMaxSalary] = useState('')
  const [filterElcOnly, setFilterElcOnly] = useState(false)
  const [filterTeam, setFilterTeam] = useState('')
  const [teams, setTeams] = useState<{ code: string; name: string }[]>([])

  // Scénarios sauvegardés — David, 2026-09-14.
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [activeScenarioId, setActiveScenarioId] = useState<number | null>(null)
  const [saveAsName, setSaveAsName] = useState('')
  const [scenarioBusy, setScenarioBusy] = useState(false)
  const [scenarioMsg, setScenarioMsg] = useState<string | null>(null)

  const refreshScenarios = () => {
    listScenariosAction(saisonId).then(res => setScenarios(res.scenarios))
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      loadMyRosterForSimulationAction(saisonId),
      loadOwnRecrueBankAction(saisonId),
      listTeamsAction(),
    ]).then(([rosterRes, recrueRes, teamsRes]) => {
      if (rosterRes.error || !rosterRes.roster) {
        setLoadErr(rosterRes.error ?? 'Impossible de charger ton alignement.')
      } else {
        setRoster(rosterRes.roster)
        setCapUsed(rosterRes.capUsed ?? 0)
        setPoolCap(rosterRes.poolCap ?? 0)
      }
      setRecruePlayers(recrueRes.players)
      setTeams(teamsRes.teams)
      setLoading(false)
    })
    refreshScenarios()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisonId])

  const hasSandboxFilters = !!filterPosition || filterMaxSalary.trim() !== '' || filterElcOnly || !!filterTeam
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const maxSalary = filterMaxSalary.trim() ? Number(filterMaxSalary) : undefined
      const res = await searchSimulationPlayersAction(saisonId, {
        query,
        position: filterPosition || undefined,
        maxSalary: maxSalary && !Number.isNaN(maxSalary) ? maxSalary : undefined,
        elcOnly: filterElcOnly || undefined,
        teamCode: filterTeam || undefined,
      })
      setSearching(false)
      setResults(res.players ?? [])
      setResultsTruncated(res.truncated ?? false)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, saisonId, filterPosition, filterMaxSalary, filterElcOnly, filterTeam, hasSandboxFilters])

  const toggleRemove = (playerId: number) => {
    setRemoved(prev => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })
  }
  const addFA = (p: SimulationPlayerResult) => {
    if (added.some(a => a.id === p.id)) return
    setAdded(prev => [...prev, {
      id: p.id, first_name: p.first_name, last_name: p.last_name, position: p.position,
      cap_number: p.cap_number, playerType: 'actif', ownerName: p.owner_name,
    }])
    setQuery('')
    setResults([])
  }
  const removeAdded = (id: number) => setAdded(prev => prev.filter(a => a.id !== id))
  const setFAType = (id: number, t: PlayerType) => setAdded(prev => prev.map(a => a.id === id ? { ...a, playerType: t } : a))

  const addRecrue = (playerId: number) => setAddedRecrues(prev => { const next = new Map(prev); next.set(playerId, 'actif'); return next })
  const removeRecrue = (playerId: number) => setAddedRecrues(prev => { const next = new Map(prev); next.delete(playerId); return next })
  const setRecrueType = (playerId: number, t: PlayerType) => setAddedRecrues(prev => { const next = new Map(prev); next.set(playerId, t); return next })

  const resetAll = () => {
    setRemoved(new Set()); setAdded([]); setAddedRecrues(new Map())
    setQuery(''); setResults([]); setSelectedRecrueId('')
    setActiveScenarioId(null); setSaveAsName(''); setScenarioMsg(null)
  }

  const handleLoadScenario = async (id: number) => {
    if (!id) { resetAll(); return }
    setScenarioBusy(true); setScenarioMsg(null)
    const res = await loadScenarioAction(id)
    setScenarioBusy(false)
    if (res.error || !res.data) { setScenarioMsg(res.error ?? 'Erreur de chargement.'); return }
    const data = res.data
    setRemoved(new Set(data.removed))
    setAdded(data.added)
    setAddedRecrues(new Map(data.addedRecrues.map(r => [r.id, r.playerType])))
    setActiveScenarioId(id)
    const found = scenarios.find(s => s.id === id)
    setSaveAsName(found?.name ?? '')
  }

  const handleSaveScenario = async () => {
    if (!saveAsName.trim()) { setScenarioMsg('Donne un nom au scénario.'); return }
    setScenarioBusy(true); setScenarioMsg(null)
    const data: ScenarioData = {
      removed: Array.from(removed),
      added,
      addedRecrues: Array.from(addedRecrues.entries()).map(([id, playerType]) => ({ id, playerType })),
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
    resetAll()
    refreshScenarios()
  }

  if (loading) return <p className="text-gray-400 text-sm">Chargement...</p>
  if (loadErr) return <p className="text-red-600 text-sm">{loadErr}</p>

  const simEntries = buildSimEntries(roster, removed, recruePlayers, addedRecrues, added)
  const activeEntries = simEntries.filter(e => !e.removedFlag)
  const counts = {
    forward: activeEntries.filter(e => e.playerType === 'actif' && posBucket(e.position) === 'forward').length,
    defense: activeEntries.filter(e => e.playerType === 'actif' && posBucket(e.position) === 'defense').length,
    goalie: activeEntries.filter(e => e.playerType === 'actif' && posBucket(e.position) === 'goalie').length,
    reserviste: activeEntries.filter(e => e.playerType === 'reserviste').length,
  }

  const removedCap = roster.filter(e => removed.has(e.player_id)).reduce((s, e) => s + e.cap_number, 0)
  const addedRecrueCap = recruePlayers.filter(r => addedRecrues.has(r.player_id)).reduce((s, r) => s + r.cap_number, 0)
  const addedFACap = added.reduce((s, fa) => s + (fa.cap_number ?? 0), 0)
  const simulatedUsed = capUsed - removedCap + addedRecrueCap + addedFACap
  const simulatedRemain = poolCap - simulatedUsed
  const touched = removed.size > 0 || added.length > 0 || addedRecrues.size > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Simulation</h1>
        <p className="text-sm text-gray-500 mt-1">
          Teste des ajouts/retraits sur ton alignement sans rien changer pour de vrai — {me.name}, saison {season}.
          Pour un vrai changement, utilise Gestion d&apos;effectifs.
        </p>
      </div>

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
            disabled={scenarioBusy || !touched && !activeScenarioId}
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
          Un ajout marqué &quot;Actif&quot; ou &quot;Rés.&quot; est classé dans la bonne colonne ci-dessous.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Alignement simulé */}
          <div>
            <div className="space-y-2 mb-2">
              {groupSimEntries(simEntries).map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{group.label}</p>
                  <div className="space-y-1">
                    {group.entries.map(e => (
                      <div
                        key={e.key}
                        className={`flex items-center justify-between text-sm py-1 ${
                          e.removedFlag ? 'opacity-40 line-through text-gray-500' : e.kind !== 'current' ? 'text-emerald-700' : 'text-gray-600'
                        }`}
                      >
                        <span className="truncate">
                          <span className="text-gray-400 mr-1">{e.position ?? DASH}</span>{e.playerName}
                          {e.kind === 'recrue' && <span className="text-emerald-500"> (recrue activée)</span>}
                          {e.kind === 'fa' && (
                            <span className="text-emerald-500"> ({e.ownerName ? `de ${e.ownerName}` : 'agent libre'})</span>
                          )}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          {e.kind !== 'current' && (
                            <TypeToggle
                              value={e.playerType}
                              onChange={t => e.kind === 'recrue' ? setRecrueType(e.playerId, t) : setFAType(e.playerId, t)}
                            />
                          )}
                          <span>{e.capNumber > 0 ? fmt(e.capNumber) : DASH}</span>
                          <button
                            onClick={() => e.kind === 'current' ? toggleRemove(e.playerId) : e.kind === 'recrue' ? removeRecrue(e.playerId) : removeAdded(e.playerId)}
                            className="w-5 h-5 rounded border text-gray-400 hover:text-red-600 text-xs"
                          >
                            {e.kind === 'current' ? (e.removedFlag ? '↺' : '✕') : '✕'}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-400 mb-3">
              {counts.forward} attaquant{counts.forward > 1 ? 's' : ''} · {counts.defense} défenseur{counts.defense > 1 ? 's' : ''} ·
              {' '}{counts.goalie} gardien{counts.goalie > 1 ? 's' : ''} · {counts.reserviste} réserviste{counts.reserviste > 1 ? 's' : ''}
            </p>

            <button onClick={resetAll} className="w-full text-xs font-medium text-gray-500 border rounded-lg py-1.5 hover:bg-gray-50">
              ↺ Réinitialiser (revenir à l&apos;actuel)
            </button>
          </div>

          {/* Ajouts, recherche et impact sur la masse */}
          <div>
            {recruePlayers.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ajouter une recrue de ta banque</p>
                {recruePlayers.every(r => addedRecrues.has(r.player_id)) ? (
                  <p className="text-xs text-gray-400">Toutes tes recrues sont déjà ajoutées.</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedRecrueId}
                      onChange={e => setSelectedRecrueId(e.target.value)}
                      className="flex-1 border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                    >
                      <option value="">— Choisir une recrue —</option>
                      {recruePlayers.filter(r => !addedRecrues.has(r.player_id)).map(r => (
                        <option key={r.player_id} value={String(r.player_id)}>
                          {r.position ?? DASH} · {r.name}{r.cap_number > 0 ? ` — ${fmt(r.cap_number)}` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (!selectedRecrueId) return
                        addRecrue(Number(selectedRecrueId))
                        setSelectedRecrueId('')
                      }}
                      disabled={!selectedRecrueId}
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 shrink-0"
                    >
                      Ajouter
                    </button>
                  </div>
                )}
              </div>
            )}

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ajouter un joueur</p>
            <p className="text-[11px] text-gray-400 mb-1.5">
              Les joueurs déjà possédés par un autre pooler apparaissent aussi (pour simuler une transaction) — ils
              restent en réalité non disponibles, marqués <span className="text-amber-600">chez [pooler]</span>.
            </p>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher par nom (2+ caractères, optionnel avec des filtres)..."
              className="w-full border rounded-lg px-2.5 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <select
                value={filterPosition}
                onChange={e => setFilterPosition(e.target.value as typeof filterPosition)}
                className="border rounded-lg px-2 py-1 text-xs focus:outline-none"
              >
                <option value="">Toutes positions</option>
                <option value="forward">Attaquant</option>
                <option value="defense">Défenseur</option>
                <option value="goalie">Gardien</option>
              </select>
              <select
                value={filterTeam}
                onChange={e => setFilterTeam(e.target.value)}
                className="border rounded-lg px-2 py-1 text-xs focus:outline-none"
              >
                <option value="">Toutes équipes</option>
                {teams.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
              <input
                type="number"
                value={filterMaxSalary}
                onChange={e => setFilterMaxSalary(e.target.value)}
                placeholder="Salaire max $ (ex: 2000000)"
                className="w-40 border rounded-lg px-2 py-1 text-xs focus:outline-none"
              />
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input type="checkbox" checked={filterElcOnly} onChange={e => setFilterElcOnly(e.target.checked)} />
                ELC seulement
              </label>
              {hasSandboxFilters && (
                <button
                  onClick={() => { setFilterPosition(''); setFilterMaxSalary(''); setFilterElcOnly(false); setFilterTeam('') }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Effacer les filtres
                </button>
              )}
            </div>
            {searching && <p className="text-xs text-gray-400 mb-2">Recherche...</p>}
            {results.length > 0 && (
              <div className="space-y-0.5 mb-3 max-h-56 overflow-y-auto">
                {results.map(p => (
                  <div
                    key={p.id}
                    onClick={() => addFA(p)}
                    className={`flex justify-between items-center text-xs px-2 py-1.5 rounded cursor-pointer ${p.owner_name ? 'hover:bg-amber-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className="truncate">
                      {p.last_name}, {p.first_name} <span className="text-gray-400">{p.position}</span>
                      {p.team_code && <span className="text-gray-400"> · {p.team_code}</span>}
                      {p.is_elc && <span className="text-blue-500"> · ELC</span>}
                      {p.owner_name
                        ? <span className="text-amber-600"> · chez {p.owner_name} (non disponible)</span>
                        : <span className="text-emerald-600"> · agent libre</span>}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {p.cap_number > 0 && <span className="text-gray-500">{fmt(p.cap_number)}</span>}
                      <span className="text-blue-600 font-medium">+</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {results.length > 0 && resultsTruncated && (
              <p className="text-xs text-amber-600 -mt-2 mb-3">
                Plus de résultats que ce qui est affiché — affine avec une équipe, une position ou un nom pour tout voir.
              </p>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
