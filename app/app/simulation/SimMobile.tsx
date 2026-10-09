'use client'

import { useEffect, useRef, useState } from 'react'
import { searchSimulationPlayersAction, type SimulationPlayerResult } from './actions'
import { groupSimEntries, type PlayerType, type RecrueOption, type SimEntry, type SimState } from './useSimState'

// Version téléphone de la simulation (David, 2026-10-09) : l'essentiel pour répondre à « est-ce
// que ça entre sous le plafond si je fais ça ? » — son alignement, un menu par joueur, l'ajout
// d'une recrue ou d'un joueur par son nom. Même état que la version complète (useSimState), donc
// rien n'est dupliqué côté calcul. Les scénarios sauvegardés suivent, dans SimulationTool.tsx.
// Seule la simulation d'un échange entre poolers reste sur grand écran ; pour l'offrir aussi au
// téléphone, il suffit d'afficher ce bloc de SimulationTool.tsx sous `md` et d'en revoir la mise en page.

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const DASH = '—'

const TYPE_LABEL: Record<PlayerType, string> = { actif: 'Actif', reserviste: 'Réserviste', ltir: 'IR' }

function setType(state: SimState, e: SimEntry, t: PlayerType) {
  if (e.kind === 'current') state.setCurrentType(e.playerId, t)
  else if (e.kind === 'recrue') state.setRecrueType(e.playerId, t)
  else state.setFAType(e.playerId, t)
}

function remove(state: SimState, e: SimEntry) {
  if (e.kind === 'current') state.toggleRemove(e.playerId)
  else if (e.kind === 'recrue') state.removeRecrue(e.playerId)
  else state.removeAdded(e.playerId)
}

export default function SimMobile({
  poolCap, state, recruePlayers, saisonId,
}: {
  poolCap: number
  state: SimState
  recruePlayers: RecrueOption[]
  saisonId: number
}) {
  const [selectedRecrueId, setSelectedRecrueId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SimulationPlayerResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchSeq = useRef(0)

  useEffect(() => {
    // Même garde que SimPanel : une réponse plus ancienne arrivée en retard est ignorée.
    const seq = ++searchSeq.current
    const q = query.trim()
    if (q.length < 2) return
    const timer = setTimeout(async () => {
      setSearching(true)
      const res = await searchSimulationPlayersAction(saisonId, { query: q }).catch(() => null)
      if (seq !== searchSeq.current) return
      setSearching(false)
      if (res) setResults(res.players ?? [])
    }, 300)
    return () => clearTimeout(timer)
  }, [query, saisonId])

  // Sous 2 caractères, rien n'est cherché : on n'affiche pas les résultats de la frappe d'avant.
  const canSearch = query.trim().length >= 2
  const shown = canSearch ? results : []

  const remain = poolCap - state.capUsed
  const missing = Math.max(0, 12 - state.counts.forward) + Math.max(0, 6 - state.counts.defense)
    + Math.max(0, 2 - state.counts.goalie) + Math.max(0, 2 - state.counts.reserviste)
  const over = Math.max(0, state.counts.forward - 12) + Math.max(0, state.counts.defense - 6) + Math.max(0, state.counts.goalie - 2)
  const verdict = remain < 0
    ? { text: 'Dépasse le plafond', cls: 'bg-red-100 text-red-700' }
    : missing > 0
      ? { text: `Manque ${missing} poste${missing > 1 ? 's' : ''}`, cls: 'bg-amber-100 text-amber-800' }
      : over > 0
        ? { text: `${over} actif${over > 1 ? 's' : ''} en trop`, cls: 'bg-amber-100 text-amber-800' }
        : { text: 'Conforme', cls: 'bg-emerald-100 text-emerald-700' }

  const kept = state.entries.filter(e => !e.removedFlag)
  const removed = state.entries.filter(e => e.removedFlag)
  const availableRecrues = recruePlayers.filter(r => !state.addedRecrues.has(r.player_id))

  return (
    <div className="space-y-4">
      {/* Résumé toujours visible sous la barre du haut pendant qu'on fait défiler l'alignement. */}
      <div className="sticky top-14 z-10 -mx-4 px-4 py-2.5 bg-white border-b shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-base font-bold tabular-nums ${remain < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {remain < 0 ? `${fmt(Math.abs(remain))} en surplus` : `${fmt(remain)} restant`}
          </span>
          <span className={`text-xs font-semibold rounded px-2 py-1 ${verdict.cls}`}>{verdict.text}</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {state.counts.forward}/12 att. · {state.counts.defense}/6 déf. · {state.counts.goalie}/2 gard. · {state.counts.reserviste} rés.
          {state.counts.ltir > 0 && <> · {state.counts.ltir} IR</>}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow divide-y">
        {groupSimEntries(kept).map(group => (
          <div key={group.label} className="px-3 py-2">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{group.label}</p>
            <ul className="divide-y divide-gray-100">
              {group.entries.map(e => (
                <li key={e.key} className="py-2 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium leading-tight ${e.kind !== 'current' ? 'text-emerald-700' : 'text-gray-800'}`}>
                      {e.playerName}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {e.position ?? DASH} · {e.capNumber > 0 ? fmt(e.capNumber) : DASH}
                      {e.kind === 'recrue' && <span className="text-emerald-600"> · recrue activée</span>}
                      {e.kind === 'fa' && <span className="text-emerald-600"> · ajouté</span>}
                      {e.kind === 'fa' && e.ownerName && <span className="text-amber-600"> · {e.ownerName}</span>}
                    </p>
                  </div>
                  <select
                    value={e.playerType}
                    onChange={ev => ev.target.value === 'retirer' ? remove(state, e) : setType(state, e, ev.target.value as PlayerType)}
                    aria-label={`Statut de ${e.playerName}`}
                    className="shrink-0 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
                  >
                    {(Object.keys(TYPE_LABEL) as PlayerType[]).map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                    <option value="retirer">Retirer</option>
                  </select>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {removed.length > 0 && (
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Retirés de la simulation</p>
          <ul className="divide-y divide-gray-200">
            {removed.map(e => (
              <li key={e.key} className="py-2 flex items-center justify-between gap-2">
                <span className="text-sm text-gray-500 min-w-0">{e.playerName}</span>
                <button onClick={() => state.toggleRemove(e.playerId)} className="shrink-0 text-sm text-blue-600 font-medium px-2 py-1">
                  Remettre
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {availableRecrues.length > 0 && (
        <div className="bg-white rounded-lg shadow p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ajouter une recrue de ta banque</p>
          <div className="flex gap-2">
            <select
              value={selectedRecrueId}
              onChange={e => setSelectedRecrueId(e.target.value)}
              className="min-w-0 flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
            >
              <option value="">— Choisir —</option>
              {availableRecrues.map(r => (
                <option key={r.player_id} value={String(r.player_id)}>
                  {r.name}{r.cap_number > 0 ? ` — ${fmt(r.cap_number)}` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => { if (selectedRecrueId) { state.addRecrue(Number(selectedRecrueId)); setSelectedRecrueId('') } }}
              disabled={!selectedRecrueId}
              className="shrink-0 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-40"
            >
              Ajouter
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ajouter un joueur</p>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Nom du joueur"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1 h-4" aria-live="polite">{searching && canSearch ? 'Recherche…' : ''}</p>
        {shown.length > 0 && (
          <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {shown.map(p => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    state.addFA({
                      id: p.id, first_name: p.first_name, last_name: p.last_name,
                      position: p.position, cap_number: p.cap_number, ownerName: p.owner_name,
                    })
                    setQuery(''); setResults([])
                  }}
                  className="w-full text-left py-2.5 flex items-center justify-between gap-2"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-800 leading-tight">{p.last_name}, {p.first_name}</span>
                    <span className="block text-[11px] text-gray-400">
                      {p.position ?? DASH}{p.team_code ? ` · ${p.team_code}` : ''}
                      {p.cap_number > 0 ? ` · ${fmt(p.cap_number)}` : ''}
                      {p.owner_name && <span className="text-amber-600"> · {p.owner_name}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-blue-600 text-sm font-semibold">Ajouter</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-gray-400 mt-2">
          Un joueur déjà pris par un autre pooler apparaît avec son nom en orange : il n&apos;est pas réellement disponible.
        </p>
      </div>

      {state.touched && (
        <button onClick={state.reset} className="w-full text-sm font-medium text-gray-600 border border-gray-300 rounded-lg py-2.5 bg-white">
          Réinitialiser la simulation
        </button>
      )}

      <p className="text-xs text-gray-400">
        La simulation d&apos;un échange avec un autre pooler se fait sur un écran plus large (tablette ou ordinateur).
      </p>
    </div>
  )
}
