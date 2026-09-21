'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import {
  getMyTradeOffersAction, proposeTradeOfferAction, respondToTradeOfferAction, confirmTradeReadyAction,
  listTradeableAssetsAction,
  type TradeOfferView, type TradeableItem,
} from './trade-actions'
import { listOtherPoolersAction } from '../simulation/actions'

const STATUS_LABEL: Record<string, string> = {
  pending_target: 'En attente de réponse',
  pending_admin: "En attente d'approbation admin",
  pending_completion: 'Approuvée — en attente de confirmation',
  declined: 'Refusée',
  rejected_admin: 'Rejetée par l\'admin',
  completed: 'Complétée',
  cancelled_expired: 'Annulée (délai dépassé)',
}

function fmtDeadline(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto' })
}

function ItemPicker({
  title, items, selected, onToggle,
}: {
  title: string; items: TradeableItem[]; selected: Set<string>; onToggle: (key: string) => void
}) {
  const key = (i: TradeableItem) => i.kind === 'player' ? `player-${i.playerId}` : `pick-${i.pickId}`
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{title}</p>
      <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y">
        {items.length === 0 && <p className="text-xs text-gray-400 p-2">Rien à échanger.</p>}
        {items.map(i => {
          const k = key(i)
          const label = i.kind === 'player'
            ? `${i.name}${i.position ? ` (${i.position}${i.teamCode ? ', ' + i.teamCode : ''})` : ''} — ${i.playerType}`
            : `Choix ronde ${i.round} (${i.season})`
          return (
            <label key={k} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selected.has(k)} onChange={() => onToggle(k)} />
              {label}
            </label>
          )
        })}
      </div>
    </div>
  )
}

export default function TradeOffersTab({ saisonId, selfPoolerId }: { saisonId: number; selfPoolerId: string }) {
  const [offers, setOffers] = useState<TradeOfferView[]>([])
  const [history, setHistory] = useState<TradeOfferView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const load = useCallback(() => {
    setLoading(true)
    getMyTradeOffersAction(saisonId).then(res => {
      if (res.error) setError(res.error)
      else { setOffers(res.offers ?? []); setHistory(res.history ?? []) }
      setLoading(false)
    })
  }, [saisonId])

  useEffect(() => { load() }, [load])

  // ── Nouvelle proposition ──────────────────────────────────────────────────
  const [composing, setComposing] = useState(false)
  const [otherPoolers, setOtherPoolers] = useState<{ id: string; name: string }[]>([])
  const [targetId, setTargetId] = useState('')
  const [myAssets, setMyAssets] = useState<TradeableItem[]>([])
  const [theirAssets, setTheirAssets] = useState<TradeableItem[]>([])
  const [mySelected, setMySelected] = useState<Set<string>>(new Set())
  const [theirSelected, setTheirSelected] = useState<Set<string>>(new Set())
  const [composeMsg, setComposeMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!composing) return
    listOtherPoolersAction().then(res => setOtherPoolers(res.poolers))
    listTradeableAssetsAction(selfPoolerId, saisonId).then(setMyAssets)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composing])

  useEffect(() => {
    if (!targetId) { setTheirAssets([]); return }
    listTradeableAssetsAction(targetId, saisonId).then(setTheirAssets)
    setTheirSelected(new Set())
  }, [targetId, saisonId])

  function toggle(setFn: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) {
    setFn(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function parseKeys(keys: Set<string>): { kind: 'player' | 'pick'; id: number }[] {
    return Array.from(keys).map(k => {
      const [kind, id] = k.split('-')
      return { kind: kind as 'player' | 'pick', id: Number(id) }
    })
  }

  function handlePropose() {
    if (!targetId) { setComposeMsg('Choisis un pooler.'); return }
    setComposeMsg(null)
    startTransition(async () => {
      const result = await proposeTradeOfferAction(saisonId, {
        targetPoolerId: targetId,
        myItems: parseKeys(mySelected),
        theirItems: parseKeys(theirSelected),
      })
      if (result.error) { setComposeMsg(result.error); return }
      setComposing(false)
      setTargetId(''); setMySelected(new Set()); setTheirSelected(new Set())
      load()
    })
  }

  function handleRespond(id: number, accept: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await respondToTradeOfferAction(id, accept)
      if (result.error) setError(result.error)
      load()
    })
  }

  // ── Confirmation (pending_completion) ─────────────────────────────────────
  const [chosenTypes, setChosenTypes] = useState<Record<number, Record<number, 'actif' | 'reserviste'>>>({})

  function setChosenType(offerId: number, playerId: number, type: 'actif' | 'reserviste') {
    setChosenTypes(prev => ({ ...prev, [offerId]: { ...prev[offerId], [playerId]: type } }))
  }

  function handleConfirm(offer: TradeOfferView) {
    setError(null)
    const types = chosenTypes[offer.id] ?? {}
    startTransition(async () => {
      const result = await confirmTradeReadyAction(offer.id, types)
      if (result.error) setError(result.error)
      load()
    })
  }

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>

  return (
    <div className="max-w-3xl space-y-6">
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-800">Mes transactions</h2>
          <button onClick={() => setComposing(v => !v)} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded font-medium hover:bg-blue-700">
            {composing ? 'Annuler' : '+ Nouvelle proposition'}
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Propose un échange de joueurs (actif, réserviste ou recrue) et/ou de choix de repêchage à un autre pooler.
          Il doit accepter, puis l&apos;admin doit approuver avant que rien ne bouge. Une fois approuvé, les deux
          poolers ont un délai pour confirmer que le résultat entre dans leur masse/composition — si l&apos;un des
          deux ne confirme pas à temps, l&apos;échange est annulé pour les deux.
        </p>

        {composing && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
            <select value={targetId} onChange={e => setTargetId(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="">— Choisir un pooler —</option>
              {otherPoolers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {targetId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ItemPicker title="Tu donnes" items={myAssets} selected={mySelected} onToggle={k => toggle(setMySelected, k)} />
                <ItemPicker title="Tu reçois" items={theirAssets} selected={theirSelected} onToggle={k => toggle(setTheirSelected, k)} />
              </div>
            )}
            {composeMsg && <p className="text-sm text-red-600">{composeMsg}</p>}
            <button onClick={handlePropose} disabled={isPending || !targetId}
              className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              Envoyer la proposition
            </button>
          </div>
        )}

        {offers.length === 0 && !composing && <p className="text-sm text-gray-400">Aucune transaction en cours.</p>}

        <div className="space-y-3">
          {offers.map(o => (
            <div key={o.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-800">
                  {o.isProposer ? `Proposée à ${o.otherPoolerName}` : `Reçue de ${o.otherPoolerName}`}
                </p>
                <span className="text-xs text-gray-500">{STATUS_LABEL[o.status] ?? o.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2 text-sm">
                <div>
                  <p className="text-xs text-gray-400 uppercase">Tu donnes</p>
                  {o.give.length === 0 ? <p className="text-gray-400">—</p> : o.give.map((i, idx) => <p key={idx}>{i.label}</p>)}
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">Tu reçois</p>
                  {o.receive.length === 0 ? <p className="text-gray-400">—</p> : o.receive.map((i, idx) => <p key={idx}>{i.label}</p>)}
                </div>
              </div>

              {o.status === 'pending_target' && !o.isProposer && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => handleRespond(o.id, true)} disabled={isPending}
                    className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50">Accepter</button>
                  <button onClick={() => handleRespond(o.id, false)} disabled={isPending}
                    className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Refuser</button>
                </div>
              )}

              {o.status === 'pending_completion' && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-700 mb-2">
                    Confirme avant le <strong>{fmtDeadline(o.completionDeadline)}</strong> — {o.otherReady ? "l'autre pooler a déjà confirmé." : "en attente de l'autre pooler aussi."}
                  </p>
                  {o.myReady
                    ? <p className="text-sm text-green-700 font-medium">✓ Tu as confirmé ta part.</p>
                    : (
                      <>
                        {o.receive.filter(i => i.kind === 'player' && i.currentPlayerType !== 'recrue').length > 0 && (
                          <div className="space-y-1 mb-2">
                            {o.receive.filter(i => i.kind === 'player' && i.currentPlayerType !== 'recrue').map(i => (
                              <div key={i.id} className="flex items-center justify-between text-sm">
                                <span>{i.label}</span>
                                <select
                                  defaultValue=""
                                  onChange={e => setChosenType(o.id, i.id, e.target.value as 'actif' | 'reserviste')}
                                  className="border rounded px-2 py-1 text-xs"
                                >
                                  <option value="" disabled>Choisir…</option>
                                  <option value="actif">Actif</option>
                                  <option value="reserviste">Réserviste</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                        <button onClick={() => handleConfirm(o)} disabled={isPending}
                          className="bg-amber-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                          Confirmer ma part
                        </button>
                      </>
                    )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-2">Historique récent</h3>
          <div className="space-y-1">
            {history.map(h => (
              <div key={h.id} className="text-xs text-gray-500 border-b border-gray-100 pb-1">
                {h.otherPoolerName} — {STATUS_LABEL[h.status] ?? h.status}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
