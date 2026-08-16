'use client'

import { useEffect, useState } from 'react'
import { loadRosterAction, searchFreeAgentsAction, submitTransactionAction, ActionType, TxItemPayload } from './actions'

const DASH = '\u2014'
const STAR = '\u2605'

type Pooler = { id: string; name: string }
type Saison = { id: number; season: string; pool_cap: number }
type RosterEntry = { id: number; player_id: number; player_type: string; players: any }
type PickEntry = { id: number; round: number; pool_seasons: { season: string }; original_owner: { id: string; name: string } }

type TxItem = TxItemPayload & {
  tempId: string
  label: string
  sideLabel: string
}

const PLAYER_TYPES = ['actif', 'reserviste', 'ltir', 'recrue'] as const

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const getCap = (player: any, season: string) =>
  player?.player_contracts?.find((c: any) => c.season === season)?.cap_number ?? 0

const typeLabel: Record<string, string> = {
  actif: 'Actif', reserviste: 'Réserviste', ltir: 'LTIR', recrue: 'Recrue',
}

let tempIdCounter = 0
const nextId = () => `tx-${++tempIdCounter}`

// ── Adjustment form ──────────────────────────────────────────────────────────

function AdjustmentForm({
  poolerId,
  poolerName,
  otherPoolerId,
  roster,
  season,
  saisonId,
  onAdd,
}: {
  poolerId: string
  poolerName: string
  otherPoolerId: string
  roster: RosterEntry[]
  season: string
  saisonId: number
  onAdd: (item: TxItem) => void
}) {
  const [action, setAction] = useState<ActionType | ''>('')
  const [selectedPlayer, setSelectedPlayer] = useState<string>('')
  const [newType, setNewType] = useState<string>('actif')
  const [freeAgentQuery, setFaQuery] = useState('')
  const [freeAgents, setFreeAgents] = useState<any[]>([])
  const [faLoading, setFaLoading] = useState(false)

  const actifs = roster.filter(e => e.player_type === 'actif')
  const reservistes = roster.filter(e => e.player_type === 'reserviste')
  const ltirPlayers = roster.filter(e => e.player_type === 'ltir')
  const recrues = roster.filter(e => e.player_type === 'recrue')
  const swappable = [...actifs, ...reservistes, ...ltirPlayers]

  useEffect(() => {
    setSelectedPlayer('')
    setFaQuery('')
    setFreeAgents([])
  }, [action])

  useEffect(() => {
    if (action !== 'sign') return
    const timer = setTimeout(async () => {
      if (freeAgentQuery.trim().length < 2) { setFreeAgents([]); return }
      setFaLoading(true)
      const result = await searchFreeAgentsAction(saisonId, freeAgentQuery)
      setFreeAgents(result.players)
      setFaLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [freeAgentQuery, action, saisonId])

  const handleAdd = () => {
    if (!action) return

    if (action === 'sign') {
      const fa = freeAgents.find(p => String(p.id) === selectedPlayer)
      if (!fa) return
      const cap = getCap(fa, season)
      onAdd({
        tempId: nextId(),
        action_type: 'sign',
        to_pooler_id: poolerId,
        player_id: fa.id,
        new_player_type: newType,
        label: `Signer ${fa.last_name}, ${fa.first_name} (${fa.teams?.code ?? DASH}) → ${typeLabel[newType]}`,
        sideLabel: poolerName,
      })
      setAction('')
      setSelectedPlayer('')
      setFaQuery('')
      setFreeAgents([])
      return
    }

    const entry = roster.find(e => String(e.id) === selectedPlayer)
    if (!entry) return
    const p = entry.players
    const playerLabel = `${p.last_name}, ${p.first_name} (${p.teams?.code ?? DASH})`

    if (action === 'promote') {
      onAdd({
        tempId: nextId(),
        action_type: 'promote',
        to_pooler_id: poolerId,
        from_pooler_id: poolerId,
        player_id: entry.player_id,
        old_player_type: 'recrue',
        new_player_type: newType,
        label: `${STAR} Promouvoir ${playerLabel} → ${typeLabel[newType]}`,
        sideLabel: poolerName,
      })
    } else if (action === 'reactivate') {
      onAdd({
        tempId: nextId(),
        action_type: 'reactivate',
        to_pooler_id: poolerId,
        from_pooler_id: poolerId,
        player_id: entry.player_id,
        old_player_type: 'ltir',
        new_player_type: newType,
        label: `Réactiver ${playerLabel} (LTIR → ${typeLabel[newType]})`,
        sideLabel: poolerName,
      })
    } else if (action === 'release') {
      onAdd({
        tempId: nextId(),
        action_type: 'release',
        from_pooler_id: poolerId,
        player_id: entry.player_id,
        old_player_type: entry.player_type,
        label: `Libérer ${playerLabel} (${typeLabel[entry.player_type]})`,
        sideLabel: poolerName,
      })
    } else if (action === 'type_change') {
      onAdd({
        tempId: nextId(),
        action_type: 'type_change',
        from_pooler_id: poolerId,
        to_pooler_id: poolerId,
        player_id: entry.player_id,
        old_player_type: entry.player_type,
        new_player_type: newType,
        label: `${playerLabel} : ${typeLabel[entry.player_type]} → ${typeLabel[newType]}`,
        sideLabel: poolerName,
      })
    }

    setAction('')
    setSelectedPlayer('')
  }

  if (!action) {
    return (
      <div className="flex flex-wrap gap-2">
        {recrues.length > 0 && (
          <button onClick={() => setAction('promote')} className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2 py-1 rounded">
            + Promouvoir recrue
          </button>
        )}
        {ltirPlayers.length > 0 && (
          <button onClick={() => setAction('reactivate')} className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-1 rounded">
            + Réactiver LTIR
          </button>
        )}
        {swappable.length > 0 && (
          <button onClick={() => setAction('type_change')} className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 px-2 py-1 rounded">
            + Changer type
          </button>
        )}
        {roster.length > 0 && (
          <button onClick={() => setAction('release')} className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-2 py-1 rounded">
            + Libérer joueur
          </button>
        )}
        <button onClick={() => setAction('sign')} className="text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 px-2 py-1 rounded">
          + Signer agent libre
        </button>
      </div>
    )
  }

  const sourceList =
    action === 'promote' ? recrues :
    action === 'reactivate' ? ltirPlayers :
    action === 'release' ? roster :
    swappable

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600">
          {action === 'promote' && 'Promouvoir une recrue'}
          {action === 'reactivate' && 'Réactiver (LTIR)'}
          {action === 'release' && 'Libérer un joueur'}
          {action === 'type_change' && 'Changer le type'}
          {action === 'sign' && 'Signer un agent libre'}
        </span>
        <button onClick={() => setAction('')} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
      </div>

      {action === 'sign' ? (
        <>
          <input
            type="text"
            value={freeAgentQuery}
            onChange={e => setFaQuery(e.target.value)}
            placeholder="Rechercher un joueur..."
            className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {faLoading && <p className="text-xs text-gray-400">Recherche...</p>}
          {freeAgents.length > 0 && (
            <select
              value={selectedPlayer}
              onChange={e => setSelectedPlayer(e.target.value)}
              className="w-full border rounded px-2 py-1 text-xs focus:outline-none"
              size={Math.min(freeAgents.length, 5)}
            >
              <option value="">— Sélectionner —</option>
              {freeAgents.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.last_name}, {p.first_name} ({p.teams?.code ?? DASH}) {p.position} — {fmt(getCap(p, season))}
                </option>
              ))}
            </select>
          )}
        </>
      ) : (
        <select
          value={selectedPlayer}
          onChange={e => setSelectedPlayer(e.target.value)}
          className="w-full border rounded px-2 py-1 text-xs focus:outline-none"
        >
          <option value="">— Sélectionner —</option>
          {sourceList.map(e => (
            <option key={e.id} value={String(e.id)}>
              {e.players.last_name}, {e.players.first_name} ({e.players.teams?.code ?? DASH}) — {typeLabel[e.player_type]}
            </option>
          ))}
        </select>
      )}

      {action !== 'release' && (
        <select
          value={newType}
          onChange={e => setNewType(e.target.value)}
          className="w-full border rounded px-2 py-1 text-xs focus:outline-none"
        >
          {(action === 'type_change'
            ? ['actif', 'reserviste', 'ltir']
            : action === 'sign' || action === 'promote' || action === 'reactivate'
              ? ['actif', 'reserviste']
              : []
          ).map(t => <option key={t} value={t}>{typeLabel[t]}</option>)}
        </select>
      )}

      <button
        onClick={handleAdd}
        disabled={action === 'sign' ? !selectedPlayer : !selectedPlayer}
        className="w-full text-xs bg-slate-700 text-white py-1 rounded hover:bg-slate-800 disabled:opacity-40"
      >
        Ajouter
      </button>
    </div>
  )
}

// ── Main TransactionBuilder ───────────────────────────────────────────────────

export default function TransactionBuilder({ poolers, saison }: { poolers: Pooler[]; saison: Saison }) {
  const [items, setItems] = useState<TxItem[]>([])
  const [selectedA, setSelectedA] = useState('')
  const [selectedB, setSelectedB] = useState('')
  const [notes, setNotes] = useState('')
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null)

  const addItem = (item: TxItem) => setItems(prev => [...prev, item])
  const removeItem = (tempId: string) => setItems(prev => prev.filter(i => i.tempId !== tempId))
  const updateItemDestType = (tempId: string, newType: string) =>
    setItems(prev => prev.map(i => i.tempId === tempId ? { ...i, new_player_type: newType } : i))

  const handleSubmit = async () => {
    if (items.length === 0) return
    setSubmitting(true)
    const result = await submitTransactionAction(saison.id, notes, items, transactionDate)
    setSubmitting(false)
    if (result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setItems([])
      setNotes('')
      setTransactionDate(new Date().toISOString().slice(0, 10))
      setMessage(result.warning
        ? { type: 'warning', text: `Transaction enregistrée. ⚠ ${result.warning}` }
        : { type: 'success', text: 'Transaction enregistrée.' })
    }
    setTimeout(() => setMessage(null), 5000)
  }

  return (
    <div className="space-y-6">
      {/* Résumé */}
      {items.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500">
          <h2 className="font-semibold text-gray-700 mb-3">Résumé de la transaction</h2>

          {/* Transfers */}
          {items.filter(i => i.action_type === 'transfer').length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Échanges</p>
              <div className="space-y-1">
                {items.filter(i => i.action_type === 'transfer').map(i => (
                  <div key={i.tempId} className="flex items-center justify-between text-sm px-3 py-1.5 bg-blue-50 rounded">
                    <span className="text-gray-700">
                      <span className="font-medium text-blue-700">{i.sideLabel}</span> donne {i.label}
                    </span>
                    <div className="flex items-center gap-2 ml-3">
                      {i.player_id && (i.old_player_type === 'actif' || i.old_player_type === 'reserviste' || i.old_player_type === 'ltir') && (
                        <select
                          value={i.new_player_type}
                          onChange={e => updateItemDestType(i.tempId, e.target.value)}
                          className="text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="actif">Actif</option>
                          <option value="reserviste">Réserviste</option>
                          <option value="ltir">LTIR</option>
                        </select>
                      )}
                      <button onClick={() => removeItem(i.tempId)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ajustements */}
          {items.filter(i => i.action_type !== 'transfer').length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Ajustements</p>
              <div className="space-y-1">
                {items.filter(i => i.action_type !== 'transfer').map(i => (
                  <div key={i.tempId} className="flex items-center justify-between text-sm px-3 py-1.5 bg-slate-50 rounded">
                    <span className="text-gray-700">
                      <span className="font-medium text-slate-700">{i.sideLabel}</span> — {i.label}
                    </span>
                    <button onClick={() => removeItem(i.tempId)} className="text-red-400 hover:text-red-600 text-xs ml-3">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t pt-4 mt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Date de la transaction</label>
              <input
                type="date"
                value={transactionDate}
                onChange={e => setTransactionDate(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Notes (optionnel)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Description de la transaction..."
              />
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleSubmit}
                disabled={submitting || items.length === 0}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                {submitting ? 'Soumission...' : `Soumettre (${items.length} élément${items.length > 1 ? 's' : ''})`}
              </button>
              <button
                onClick={() => setItems([])}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Tout effacer
              </button>
              {message && (
                <span className={`text-sm font-medium ${message.type === 'error' ? 'text-red-600' : message.type === 'warning' ? 'text-orange-600' : 'text-green-600'}`}>
                  {message.text}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sélecteurs de poolers */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">Pooler A</label>
          <select
            value={selectedA}
            onChange={e => { const prev_id = selectedA; setSelectedA(e.target.value); setItems(prev => prev.filter(i => i.from_pooler_id !== prev_id && i.to_pooler_id !== prev_id)) }}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Sélectionner —</option>
            {poolers.filter(p => p.id !== selectedB).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">Pooler B</label>
          <select
            value={selectedB}
            onChange={e => { setSelectedB(e.target.value); setItems(prev => prev.filter(i => i.from_pooler_id !== e.target.value && i.to_pooler_id !== e.target.value)) }}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Sélectionner —</option>
            {poolers.filter(p => p.id !== selectedA).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* Panneaux des deux poolers */}
      {(selectedA || selectedB) && (
        <div className="grid grid-cols-2 gap-6">
          <PoolerPanelStateful
            side="A"
            poolerId={selectedA}
            otherPoolerId={selectedB}
            poolers={poolers}
            saison={saison}
            items={items}
            onAddItem={addItem}
          />
          <PoolerPanelStateful
            side="B"
            poolerId={selectedB}
            otherPoolerId={selectedA}
            poolers={poolers}
            saison={saison}
            items={items}
            onAddItem={addItem}
          />
        </div>
      )}
    </div>
  )
}

// Wrapper qui charge le roster quand poolerId change
function PoolerPanelStateful({
  side, poolerId, otherPoolerId, poolers, saison, items, onAddItem,
}: {
  side: 'A' | 'B'
  poolerId: string
  otherPoolerId: string
  poolers: Pooler[]
  saison: Saison
  items: TxItem[]
  onAddItem: (item: TxItem) => void
}) {
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [picks, setPicks] = useState<PickEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!poolerId) { setRoster([]); setPicks([]); return }
    setLoading(true)
    loadRosterAction(poolerId, saison.id).then(result => {
      setRoster(result.roster)
      setPicks(result.picks)
      setLoading(false)
    })
  }, [poolerId, saison.id])

  const poolerName = poolers.find(p => p.id === poolerId)?.name ?? '?'

  const selectedPlayerIds = new Set(
    items.filter(i => i.action_type === 'transfer' && (i.from_pooler_id === poolerId)).map(i => i.player_id).filter(Boolean)
  )
  const selectedPickIds = new Set(
    items.filter(i => i.action_type === 'transfer' && i.from_pooler_id === poolerId && i.pick_id).map(i => i.pick_id)
  )

  if (!poolerId) return <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">Sélectionner un pooler</div>

  const addTransferPlayer = (entry: RosterEntry) => {
    if (!otherPoolerId) return
    const p = entry.players
    onAddItem({
      tempId: nextId(),
      action_type: 'transfer',
      from_pooler_id: poolerId,
      to_pooler_id: otherPoolerId,
      player_id: entry.player_id,
      old_player_type: entry.player_type,
      new_player_type: entry.player_type,
      label: `${p.last_name}, ${p.first_name} (${p.teams?.code ?? DASH}) → ${poolers.find(pp => pp.id === otherPoolerId)?.name}`,
      sideLabel: poolerName,
    })
  }

  const addTransferPick = (pick: PickEntry) => {
    if (!otherPoolerId) return
    const isOwn = pick.original_owner.id === poolerId
    onAddItem({
      tempId: nextId(),
      action_type: 'transfer',
      from_pooler_id: poolerId,
      to_pooler_id: otherPoolerId,
      pick_id: pick.id,
      label: `Ronde ${pick.round} ${pick.pool_seasons.season}${isOwn ? '' : ` (de ${pick.original_owner.name})`} → ${poolers.find(pp => pp.id === otherPoolerId)?.name}`,
      sideLabel: poolerName,
    })
  }

  const groupedRoster: Record<string, RosterEntry[]> = {}
  for (const entry of roster) {
    groupedRoster[entry.player_type] = [...(groupedRoster[entry.player_type] ?? []), entry]
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-800 mb-1">{poolerName}</h3>
        <p className="text-xs text-gray-400">Pooler {side}</p>
      </div>

      {/* Joueurs à donner */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Donne dans l'échange</h3>
        {loading && <p className="text-xs text-gray-400">Chargement...</p>}
        {!loading && roster.length === 0 && <p className="text-xs text-gray-400">Aucun joueur</p>}
        {!loading && Object.entries(groupedRoster).map(([type, entries]) => (
          <div key={type} className="mb-3">
            <p className="text-xs text-gray-400 font-medium mb-1">{typeLabel[type]}</p>
            <div className="space-y-1">
              {entries.map(entry => {
                const p = entry.players
                const cap = getCap(p, saison.season)
                const inTx = selectedPlayerIds.has(entry.player_id)
                return (
                  <div key={entry.id} className={`flex items-center justify-between px-2 py-1.5 rounded text-xs ${inTx ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}>
                    <span className="text-gray-700">
                      {p.is_rookie && <span className="text-yellow-500 mr-1">{STAR}</span>}
                      {p.last_name}, {p.first_name}
                      <span className="text-gray-400 ml-1">{p.teams?.code ?? DASH} {p.position}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{cap > 0 ? fmt(cap) : DASH}</span>
                      {!inTx && otherPoolerId && (
                        <button onClick={() => addTransferPlayer(entry)} className="text-blue-600 hover:text-blue-800 font-medium text-xs">Donner</button>
                      )}
                      {inTx && <span className="text-blue-500 font-medium">✓</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Picks */}
      {picks.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Choix de repêchage</h3>
          <div className="space-y-1">
            {picks.map(pick => {
              const inTx = selectedPickIds.has(pick.id)
              const isOwn = pick.original_owner.id === poolerId
              return (
                <div key={pick.id} className={`flex items-center justify-between px-2 py-1.5 rounded text-xs ${inTx ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}>
                  <span className="text-gray-700">
                    Ronde {pick.round} — {pick.pool_seasons.season}
                    {!isOwn && <span className="text-amber-600 ml-1">(de {pick.original_owner.name})</span>}
                  </span>
                  {!inTx && otherPoolerId && (
                    <button onClick={() => addTransferPick(pick)} className="text-blue-600 hover:text-blue-800 font-medium">Donner</button>
                  )}
                  {inTx && <span className="text-blue-500 font-medium">✓</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Ajustements */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Ajustements</h3>
        <AdjustmentForm
          poolerId={poolerId}
          poolerName={poolerName}
          otherPoolerId={otherPoolerId}
          roster={roster}
          season={saison.season}
          saisonId={saison.id}
          onAdd={onAddItem}
        />
        {items.filter(i => i.action_type !== 'transfer' && (i.from_pooler_id === poolerId || i.to_pooler_id === poolerId)).length > 0 && (
          <div className="mt-2 space-y-1">
            {items
              .filter(i => i.action_type !== 'transfer' && (i.from_pooler_id === poolerId || i.to_pooler_id === poolerId))
              .map(i => (
                <div key={i.tempId} className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded">✓ {i.label}</div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
