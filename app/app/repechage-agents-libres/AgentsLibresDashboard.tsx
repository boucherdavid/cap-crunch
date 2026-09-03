'use client'

import { useEffect, useRef, useState } from 'react'
import AutoReload from '@/components/AutoReload'
import { searchFreeAgentsAction } from '../admin/transactions/actions'

type Me = { id: string; name: string; isAdmin: boolean }
type RosterEntry = {
  roster_id: number; player_id: number; player_type: string; playerName: string
  position: string | null; cap_number: number; isEstimatedCap: boolean
}
type PoolerInfo = {
  id: string; name: string; capUsed: number; capSpace: number; isCompliant: boolean
  counts: { forward: number; defense: number; goalie: number; reserviste: number }
  roster: RosterEntry[]
}
type DraftState = {
  is_active: boolean; queue: string[]; turn_started_at: string | null
  turn_duration_seconds: number; ended_at: string | null
}
type RecentPick = { id: number; poolerName: string; playerName: string; position: string | null; at: string }
type FreeAgent = { id: number; first_name: string; last_name: string; position: string | null }

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const DASH = '—'

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-CA', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto',
  })
}

export default function AgentsLibresDashboard({
  me, poolers, poolCap, draftState, recentPicks, saisonId, season,
}: {
  me: Me
  poolers: PoolerInfo[]
  poolCap: number
  draftState: DraftState
  recentPicks: RecentPick[]
  saisonId: number
  season: string
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const currentPoolerId = draftState.queue[0] ?? null
  const currentPoolerName = poolers.find(p => p.id === currentPoolerId)?.name ?? null
  const remainingSeconds = draftState.turn_started_at
    ? Math.max(0, draftState.turn_duration_seconds - Math.floor((now - new Date(draftState.turn_started_at).getTime()) / 1000))
    : null

  const myPooler = poolers.find(p => p.id === me.id) ?? null

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Repêchage — Agents libres</h1>
          <p className="text-gray-500 text-sm mt-1">
            {season}
            {draftState.is_active && <span className="ml-2 text-amber-600 font-medium">· En cours</span>}
            {!draftState.is_active && draftState.ended_at && <span className="ml-2 text-green-600 font-medium">· Terminé</span>}
            {!draftState.is_active && !draftState.ended_at && <span className="ml-2 text-gray-400">· Pas encore commencé</span>}
          </p>
        </div>
        <AutoReload enabled={draftState.is_active} intervalMs={8000} />
      </div>

      {draftState.is_active && currentPoolerName && (
        <div className="bg-white rounded-lg shadow px-5 py-4 mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-gray-700">
              Au tour de : <span className="font-semibold text-blue-700">{currentPoolerName}</span>
              {remainingSeconds !== null && (
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
                <PoolerCard key={p.id} pooler={p} poolCap={poolCap} isCurrentDrafter={p.id === currentPoolerId} />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Derniers choix</h2>
            {recentPicks.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400 text-sm">
                Aucun agent libre signé pour l&apos;instant.
              </div>
            ) : (
              <div className="space-y-2">
                {recentPicks.map(r => (
                  <div key={r.id} className="bg-white rounded-lg shadow px-4 py-2.5 text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="font-medium text-gray-800">{r.poolerName}</span>
                    <span className="text-gray-500">a signé</span>
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
          />
        </div>
      </div>
    </div>
  )
}

function PoolerCard({ pooler, poolCap, isCurrentDrafter }: { pooler: PoolerInfo; poolCap: number; isCurrentDrafter: boolean }) {
  const [open, setOpen] = useState(false)
  const remain = poolCap - pooler.capUsed
  const pct = poolCap > 0 ? Math.min(100, (pooler.capUsed / poolCap) * 100) : 0
  const fOk = pooler.counts.forward <= 12, dOk = pooler.counts.defense <= 6, gOk = pooler.counts.goalie <= 2, resOk = pooler.counts.reserviste >= 2
  const firstName = pooler.name.split(' ')[0]

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
      <div className={`text-xs font-medium mb-2 ${remain < 15_000_000 ? 'text-amber-600' : 'text-emerald-600'}`}>{fmt(remain)} restant</div>
      <div className="flex gap-1.5 flex-wrap mb-2">
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${fOk ? 'text-emerald-600 border-emerald-200' : 'text-red-600 border-red-200'}`}>{pooler.counts.forward}F</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${dOk ? 'text-emerald-600 border-emerald-200' : 'text-red-600 border-red-200'}`}>{pooler.counts.defense}D</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${gOk ? 'text-emerald-600 border-emerald-200' : 'text-red-600 border-red-200'}`}>{pooler.counts.goalie}G</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${resOk ? 'text-emerald-600 border-emerald-200' : 'text-red-600 border-red-200'}`}>{pooler.counts.reserviste} rés.</span>
      </div>
      <button onClick={() => setOpen(v => !v)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
        {open ? `Masquer l'alignement de ${firstName} ▴` : `Voir l'alignement de ${firstName} ▾`}
      </button>
      {open && (
        <div className="mt-2 pt-2 border-t space-y-0.5">
          {pooler.roster.length === 0 ? (
            <p className="text-xs text-gray-400">Aucun joueur.</p>
          ) : pooler.roster.map(e => (
            <div key={e.roster_id} className="flex justify-between text-xs text-gray-600 py-0.5">
              <span>
                <span className="text-gray-400 mr-1">{e.position ?? DASH}</span>
                {e.playerName}
                {e.player_type === 'reserviste' && <span className="text-gray-400 ml-1">(rés.)</span>}
              </span>
              <span className="text-gray-500">{e.cap_number > 0 ? fmt(e.cap_number) : DASH}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MonAlignement({
  me, myPooler, poolCap, saisonId,
}: {
  me: Me
  myPooler: PoolerInfo | null
  poolCap: number
  saisonId: number
}) {
  const [tab, setTab] = useState<'actuel' | 'sandbox'>('actuel')
  const [removed, setRemoved] = useState<Set<number>>(new Set())
  const [added, setAdded] = useState<FreeAgent[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FreeAgent[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const resetSandbox = () => { setRemoved(new Set()); setAdded([]); setQuery(''); setResults([]) }

  if (!myPooler) {
    return (
      <div className="bg-white rounded-lg shadow p-5 text-sm text-gray-400">
        Aucun alignement trouvé pour ton compte cette saison.
      </div>
    )
  }

  const removedCap = myPooler.roster.filter(e => removed.has(e.player_id)).reduce((s, e) => s + e.cap_number, 0)
  const simulatedUsed = myPooler.capUsed - removedCap
  const simulatedRemain = poolCap - simulatedUsed
  const touched = removed.size > 0 || added.length > 0

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Mon alignement — {me.name}</h2>
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
            <p className="text-xs text-gray-400 mb-3">Synchronisé automatiquement avec ce que l&apos;admin a signé pour toi.</p>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500">Masse salariale</span>
              <span className="font-medium">{fmt(myPooler.capUsed)}</span>
            </div>
            <div className="flex justify-between text-sm mb-3">
              <span className="text-gray-500">Espace restant</span>
              <span className="font-medium text-emerald-600">{fmt(poolCap - myPooler.capUsed)}</span>
            </div>
            <div className="border-t pt-2 space-y-1">
              {myPooler.roster.map(e => (
                <div key={e.roster_id} className="flex justify-between text-xs text-gray-600">
                  <span><span className="text-gray-400 mr-1">{e.position ?? DASH}</span>{e.playerName}</span>
                  <span>{e.cap_number > 0 ? fmt(e.cap_number) : DASH}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-3">Ajoute ou retire librement pour tester — rien n&apos;est sauvegardé.</p>
            <div className="space-y-1 mb-2">
              {myPooler.roster.map(e => (
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
              {added.map(fa => (
                <div key={fa.id} className="flex items-center justify-between text-xs py-1 text-emerald-700">
                  <span><span className="text-gray-400 mr-1">{fa.position ?? DASH}</span>{fa.last_name}, {fa.first_name} <span className="text-emerald-500">(ajouté)</span></span>
                  <button onClick={() => removeAdded(fa.id)} className="w-5 h-5 rounded border text-gray-400 hover:text-red-600 text-[10px]">✕</button>
                </div>
              ))}
            </div>

            <button onClick={resetSandbox} className="w-full text-xs font-medium text-gray-500 border rounded-lg py-1.5 mb-3 hover:bg-gray-50">
              ↺ Réinitialiser (revenir à l&apos;actuel)
            </button>

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
                <span className="text-gray-500">Espace restant simulé</span>
                <span className={`font-medium ${simulatedRemain < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(simulatedRemain)}</span>
              </div>
              {touched && (
                <p className={`text-xs mt-1 rounded-lg px-2 py-1.5 ${simulatedRemain < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {simulatedRemain < 0 ? '⚠ Dépasserait le plafond' : '✓ Combinaison conforme'}
                </p>
              )}
              {added.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Le coût des joueurs ajoutés n&apos;est pas déduit ici (contrat pas encore signé) — sert à repérer les noms disponibles, pas à calculer leur impact exact.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
