'use client'

import { useEffect, useRef, useState } from 'react'
import {
  loadMyRosterForSimulationAction, listScenariosAction, loadScenarioAction,
  saveScenarioAction, deleteScenarioAction, type SimRosterEntry, type ScenarioData,
} from './actions'
import {
  loadOwnRecrueBankAction, searchSandboxFreeAgentsAction, listTeamsAction, type SandboxFreeAgentResult,
} from '../repechage-agents-libres/actions'

type FreeAgent = { id: number; first_name: string; last_name: string; position: string | null; cap_number: number }
type RecrueOption = { roster_id: number; player_id: number; name: string; position: string | null; cap_number: number }
type Scenario = { id: number; name: string; updated_at: string }

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const DASH = '—'

function posBucket(position: string | null): 'forward' | 'defense' | 'goalie' {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

// Même découpage/tri que le bac à sable du repêchage AL (AgentsLibresDashboard.tsx).
function groupRosterByPosition(roster: SimRosterEntry[]): { label: string; entries: SimRosterEntry[] }[] {
  const groups: { label: string; match: (e: SimRosterEntry) => boolean }[] = [
    { label: 'Attaquants', match: e => e.player_type !== 'reserviste' && posBucket(e.position) === 'forward' },
    { label: 'Défenseurs', match: e => e.player_type !== 'reserviste' && posBucket(e.position) === 'defense' },
    { label: 'Gardiens', match: e => e.player_type !== 'reserviste' && posBucket(e.position) === 'goalie' },
    { label: 'Réservistes', match: e => e.player_type === 'reserviste' },
  ]
  return groups
    .map(g => ({ label: g.label, entries: roster.filter(g.match).sort((a, b) => b.cap_number - a.cap_number) }))
    .filter(g => g.entries.length > 0)
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
  const [addedRecrueIds, setAddedRecrueIds] = useState<Set<number>>(new Set())

  const [recruePlayers, setRecruePlayers] = useState<RecrueOption[]>([])
  const [selectedRecrueId, setSelectedRecrueId] = useState('')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SandboxFreeAgentResult[]>([])
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
      const res = await searchSandboxFreeAgentsAction(saisonId, {
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

  const resetAll = () => {
    setRemoved(new Set()); setAdded([]); setAddedRecrueIds(new Set())
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
    setAddedRecrueIds(new Set(data.addedRecrueIds))
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
      addedRecrueIds: Array.from(addedRecrueIds),
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

  const removedCap = roster.filter(e => removed.has(e.player_id)).reduce((s, e) => s + e.cap_number, 0)
  const addedRecrueCap = recruePlayers.filter(r => addedRecrueIds.has(r.player_id)).reduce((s, r) => s + r.cap_number, 0)
  const addedFACap = added.reduce((s, fa) => s + (fa.cap_number ?? 0), 0)
  const simulatedUsed = capUsed - removedCap + addedRecrueCap + addedFACap
  const simulatedRemain = poolCap - simulatedUsed
  const touched = removed.size > 0 || added.length > 0 || addedRecrueIds.size > 0

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
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Alignement simulé */}
          <div>
            <div className="space-y-2 mb-2">
              {groupRosterByPosition(roster).map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{group.label}</p>
                  <div className="space-y-1">
                    {group.entries.map(e => (
                      <div key={e.roster_id} className={`flex items-center justify-between text-sm py-1 ${removed.has(e.player_id) ? 'opacity-40 line-through' : 'text-gray-600'}`}>
                        <span><span className="text-gray-400 mr-1">{e.position ?? DASH}</span>{e.playerName}</span>
                        <span className="flex items-center gap-2">
                          <span>{e.cap_number > 0 ? fmt(e.cap_number) : DASH}</span>
                          <button onClick={() => toggleRemove(e.player_id)} className="w-5 h-5 rounded border text-gray-400 hover:text-red-600 text-xs">
                            {removed.has(e.player_id) ? '↺' : '✕'}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {recruePlayers.filter(r => addedRecrueIds.has(r.player_id)).map(r => (
                <div key={r.player_id} className="flex items-center justify-between text-sm py-1 text-emerald-700">
                  <span><span className="text-gray-400 mr-1">{r.position ?? DASH}</span>{r.name} <span className="text-emerald-500">(recrue activée)</span></span>
                  <span className="flex items-center gap-2">
                    <span>{r.cap_number > 0 ? fmt(r.cap_number) : DASH}</span>
                    <button onClick={() => toggleAddedRecrue(r.player_id)} className="w-5 h-5 rounded border text-gray-400 hover:text-red-600 text-xs">✕</button>
                  </span>
                </div>
              ))}
              {added.map(fa => (
                <div key={fa.id} className="flex items-center justify-between text-sm py-1 text-emerald-700">
                  <span><span className="text-gray-400 mr-1">{fa.position ?? DASH}</span>{fa.last_name}, {fa.first_name} <span className="text-emerald-500">(ajouté)</span></span>
                  <span className="flex items-center gap-2">
                    <span>{fa.cap_number > 0 ? fmt(fa.cap_number) : DASH}</span>
                    <button onClick={() => removeAdded(fa.id)} className="w-5 h-5 rounded border text-gray-400 hover:text-red-600 text-xs">✕</button>
                  </span>
                </div>
              ))}
            </div>

            <button onClick={resetAll} className="w-full text-xs font-medium text-gray-500 border rounded-lg py-1.5 hover:bg-gray-50">
              ↺ Réinitialiser (revenir à l&apos;actuel)
            </button>
          </div>

          {/* Ajouts, recherche et impact sur la masse */}
          <div>
            {recruePlayers.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ajouter une recrue de ta banque</p>
                {recruePlayers.every(r => addedRecrueIds.has(r.player_id)) ? (
                  <p className="text-xs text-gray-400">Toutes tes recrues sont déjà ajoutées.</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedRecrueId}
                      onChange={e => setSelectedRecrueId(e.target.value)}
                      className="flex-1 border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                    >
                      <option value="">— Choisir une recrue —</option>
                      {recruePlayers.filter(r => !addedRecrueIds.has(r.player_id)).map(r => (
                        <option key={r.player_id} value={String(r.player_id)}>
                          {r.position ?? DASH} · {r.name}{r.cap_number > 0 ? ` — ${fmt(r.cap_number)}` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (!selectedRecrueId) return
                        toggleAddedRecrue(Number(selectedRecrueId))
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

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ajouter un agent libre</p>
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
                {results.map(fa => (
                  <div
                    key={fa.id}
                    onClick={() => addFA({ id: fa.id, first_name: fa.first_name, last_name: fa.last_name, position: fa.position, cap_number: fa.cap_number })}
                    className="flex justify-between items-center text-xs px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <span>
                      {fa.last_name}, {fa.first_name} <span className="text-gray-400">{fa.position}</span>
                      {fa.team_code && <span className="text-gray-400"> · {fa.team_code}</span>}
                      {fa.is_elc && <span className="text-blue-500"> · ELC</span>}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {fa.cap_number > 0 && <span className="text-gray-500">{fmt(fa.cap_number)}</span>}
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
