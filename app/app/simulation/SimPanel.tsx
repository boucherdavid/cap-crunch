'use client'

import { useEffect, useRef, useState } from 'react'
import { searchSimulationPlayersAction, type SimulationPlayerResult } from './actions'
import { groupSimEntries, type PlayerType, type RecrueOption, type SimEntry, type SimState } from './useSimState'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const DASH = '—'

function TypeToggle({ value, onChange }: { value: PlayerType; onChange: (t: PlayerType) => void }) {
  const opts: { v: PlayerType; label: string }[] = [
    { v: 'actif', label: 'Actif' },
    { v: 'reserviste', label: 'Rés.' },
    { v: 'ltir', label: 'IR' },
  ]
  return (
    <span className="inline-flex rounded border overflow-hidden text-[10px] shrink-0">
      {opts.map((o, i) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-1.5 py-0.5 ${i > 0 ? 'border-l' : ''} ${value === o.v ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
        >
          {o.label}
        </button>
      ))}
    </span>
  )
}

export default function SimPanel({
  title, poolCap, state, recruePlayers, teams, saisonId, onSend, sendLabel,
}: {
  title: string
  poolCap: number
  state: SimState
  recruePlayers: RecrueOption[]
  teams: { code: string; name: string }[]
  saisonId: number
  onSend?: (entry: SimEntry) => void
  sendLabel?: string
}) {
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

  const hasFilters = !!filterPosition || filterMaxSalary.trim() !== '' || filterElcOnly || !!filterTeam
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
  }, [query, saisonId, filterPosition, filterMaxSalary, filterElcOnly, filterTeam, hasFilters])

  const simulatedRemain = poolCap - state.capUsed
  // Sommaire compact en haut du panneau (David, 2026-09-21) — même esprit que "Sommaire des
  // poolers" du hub de signatures (repechage-agents-libres) : espace restant + décompte par
  // position visibles sans avoir à défiler jusqu'au résumé détaillé en bas de page.
  const missingSlots = Math.max(0, 12 - state.counts.forward) + Math.max(0, 6 - state.counts.defense)
    + Math.max(0, 2 - state.counts.goalie) + Math.max(0, 2 - state.counts.reserviste)
  const topBadge = simulatedRemain < 0
    ? { text: 'Dépassement', cls: 'text-red-600 border-red-200' }
    : missingSlots === 0
      ? { text: 'Minimum atteint', cls: 'text-emerald-600 border-emerald-200' }
      : { text: `Manque ${missingSlots} poste${missingSlots > 1 ? 's' : ''}`, cls: 'text-amber-600 border-amber-200' }

  return (
    <div>
      <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3 pb-3 border-b">
        <span className={`text-sm font-semibold ${simulatedRemain < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {simulatedRemain < 0 ? `${fmt(Math.abs(simulatedRemain))} en surplus` : `${fmt(simulatedRemain)} restant`}
        </span>
        <span className="flex items-center gap-1.5 text-xs">
          <span className="text-gray-400">
            {state.counts.forward}F {state.counts.defense}D {state.counts.goalie}G {state.counts.reserviste}Rés.
            {state.counts.ltir > 0 && <> {state.counts.ltir}IR</>}
          </span>
          <span className={`font-medium px-1.5 py-0.5 rounded border ${topBadge.cls}`}>{topBadge.text}</span>
        </span>
      </div>

      {/* Lignes biffées retirées de la liste principale (David, 2026-09-21) — un joueur retiré
          n'apparaît plus ici du tout, seulement dans "Retirés" ci-dessous (moins de bruit
          visuel pour voir l'alignement réellement projeté). */}
      <div className="space-y-2 mb-2">
        {groupSimEntries(state.entries.filter(e => !e.removedFlag)).map(group => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{group.label}</p>
            <div className="space-y-1">
              {group.entries.map(e => (
                <div
                  key={e.key}
                  className={`flex items-center justify-between text-sm py-1 ${e.kind !== 'current' ? 'text-emerald-700' : 'text-gray-600'}`}
                >
                  <span className="truncate">
                    <span className="text-gray-400 mr-1">{e.position ?? DASH}</span>{e.playerName}
                    {e.kind === 'recrue' && <span className="text-emerald-500"> (recrue activée)</span>}
                    {e.kind === 'fa' && e.ownerName && <span className="text-amber-600"> ({e.ownerName})</span>}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <TypeToggle
                      value={e.playerType}
                      onChange={t => {
                        if (e.kind === 'current') state.setCurrentType(e.playerId, t)
                        else if (e.kind === 'recrue') state.setRecrueType(e.playerId, t)
                        else state.setFAType(e.playerId, t)
                      }}
                    />
                    <span>{e.capNumber > 0 ? fmt(e.capNumber) : DASH}</span>
                    {onSend && e.canSend && (
                      <button
                        onClick={() => onSend(e)}
                        title={sendLabel}
                        className="w-5 h-5 rounded border text-gray-400 hover:text-blue-600 text-xs"
                      >
                        →
                      </button>
                    )}
                    <button
                      onClick={() => e.kind === 'current' ? state.toggleRemove(e.playerId) : e.kind === 'recrue' ? state.removeRecrue(e.playerId) : state.removeAdded(e.playerId)}
                      className="w-5 h-5 rounded border text-gray-400 hover:text-red-600 text-xs"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {state.entries.some(e => e.removedFlag) && (
        <div className="mb-3 rounded-lg bg-gray-50 px-2.5 py-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Retirés de la simulation
          </p>
          <div className="space-y-0.5">
            {state.entries.filter(e => e.removedFlag).map(e => (
              <div key={e.key} className="flex items-center justify-between text-xs text-gray-400">
                <span className="truncate">{e.position ?? DASH} {e.playerName}</span>
                <button
                  onClick={() => state.toggleRemove(e.playerId)}
                  className="text-gray-400 hover:text-blue-600 shrink-0 ml-2"
                  title="Remettre dans la simulation"
                >
                  ↺ Remettre
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mb-3">
        {state.counts.forward} attaquant{state.counts.forward > 1 ? 's' : ''} · {state.counts.defense} défenseur{state.counts.defense > 1 ? 's' : ''} ·
        {' '}{state.counts.goalie} gardien{state.counts.goalie > 1 ? 's' : ''} · {state.counts.reserviste} réserviste{state.counts.reserviste > 1 ? 's' : ''}
        {state.counts.ltir > 0 && <> · {state.counts.ltir} sur IR</>}
      </p>

      <button onClick={state.reset} className="w-full text-xs font-medium text-gray-500 border rounded-lg py-1.5 mb-3 hover:bg-gray-50">
        ↺ Réinitialiser
      </button>

      {recruePlayers.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ajouter une recrue de la banque</p>
          {recruePlayers.every(r => state.addedRecrues.has(r.player_id)) ? (
            <p className="text-xs text-gray-400">Toutes les recrues sont déjà ajoutées.</p>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={selectedRecrueId}
                onChange={e => setSelectedRecrueId(e.target.value)}
                className="flex-1 border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
              >
                <option value="">— Choisir une recrue —</option>
                {recruePlayers.filter(r => !state.addedRecrues.has(r.player_id)).map(r => (
                  <option key={r.player_id} value={String(r.player_id)}>
                    {r.position ?? DASH} · {r.name}{r.cap_number > 0 ? ` — ${fmt(r.cap_number)}` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (!selectedRecrueId) return
                  state.addRecrue(Number(selectedRecrueId))
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
        Les joueurs déjà possédés par un autre pooler apparaissent aussi — ils restent en réalité
        non disponibles, identifiés par le nom du pooler en <span className="text-amber-600">orange</span>.
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
        {hasFilters && (
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
              onClick={() => {
                state.addFA({
                  id: p.id, first_name: p.first_name, last_name: p.last_name,
                  position: p.position, cap_number: p.cap_number, ownerName: p.owner_name,
                })
                setQuery(''); setResults([])
              }}
              className={`flex justify-between items-center text-xs px-2 py-1.5 rounded cursor-pointer ${p.owner_name ? 'hover:bg-amber-50' : 'hover:bg-gray-50'}`}
            >
              <span className="truncate">
                {p.last_name}, {p.first_name} <span className="text-gray-400">{p.position}</span>
                {p.team_code && <span className="text-gray-400"> · {p.team_code}</span>}
                {p.is_elc && <span className="text-blue-500"> · ELC</span>}
                {p.owner_name && <span className="text-amber-600"> · {p.owner_name}</span>}
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
          <span className="font-medium">{fmt(state.capUsed)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">{simulatedRemain >= 0 ? 'Espace restant simulé' : 'Dépassement simulé'}</span>
          <span className={`font-medium ${simulatedRemain < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(Math.abs(simulatedRemain))}</span>
        </div>
        {state.touched && (
          <p className={`text-xs mt-1 rounded-lg px-2 py-1.5 ${simulatedRemain < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {simulatedRemain < 0 ? '⚠ Dépasserait le plafond' : '✓ Combinaison conforme'}
          </p>
        )}
      </div>
    </div>
  )
}
