'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import {
  getMyTradeOffersAction, proposeTradeOfferAction, respondToTradeOfferAction, confirmTradeReadyAction,
  listTradeableAssetsAction,
  type TradeOfferView, type TradeableItem,
} from './trade-actions'
import type { TradeExtraAction } from '@/lib/tradeOffers'
import { listOtherPoolersAction } from '../simulation/actions'
import { getPlayerBucket, ACTIVE_LIMITS } from '@/lib/rosterLimits'

const fmtCap = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const GROUP_LABEL: Record<string, string> = { forward: 'Attaquants', defense: 'Défenseurs', goalie: 'Gardiens', recrue: 'Recrues', pick: 'Choix de repêchage' }
const GROUP_ORDER = ['forward', 'defense', 'goalie', 'recrue', 'pick']

function groupKey(i: TradeableItem): string {
  if (i.kind === 'pick') return 'pick'
  if (i.playerType === 'recrue') return 'recrue'
  return getPlayerBucket(i.position)
}

// Tri de la liste "Ajustements supplémentaires" (David, 2026-09-22) — actifs groupés par
// position (Attaquants/Défenseurs/Gardiens), puis réservistes, puis recrues à la fin ;
// alphabétique par nom à l'intérieur de chaque groupe.
const ADJUST_GROUP_ORDER = ['forward', 'defense', 'goalie', 'reserviste', 'recrue']
function adjustGroupKey(i: Extract<TradeableItem, { kind: 'player' }>): string {
  if (i.playerType === 'reserviste' || i.playerType === 'recrue') return i.playerType
  return getPlayerBucket(i.position)
}
function sortForAdjust(items: Extract<TradeableItem, { kind: 'player' }>[]): Extract<TradeableItem, { kind: 'player' }>[] {
  return [...items].sort((a, b) => {
    const groupDiff = ADJUST_GROUP_ORDER.indexOf(adjustGroupKey(a)) - ADJUST_GROUP_ORDER.indexOf(adjustGroupKey(b))
    return groupDiff !== 0 ? groupDiff : a.name.localeCompare(b.name)
  })
}

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
  const groups = GROUP_ORDER
    .map(g => ({ label: GROUP_LABEL[g], items: items.filter(i => groupKey(i) === g) }))
    .filter(g => g.items.length > 0)

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{title}</p>
      <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
        {items.length === 0 && <p className="text-xs text-gray-400 p-2">Rien à échanger.</p>}
        {groups.map(g => (
          <div key={g.label} className="border-b border-gray-200 last:border-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-2 pt-1.5">{g.label}</p>
            <div className="divide-y">
              {g.items.map(i => {
                const k = key(i)
                const label = i.kind === 'player'
                  ? `${i.name}${i.position ? ` (${i.position}${i.teamCode ? ', ' + i.teamCode : ''})` : ''}`
                  : `Choix ronde ${i.round} (${i.season})`
                return (
                  <label key={k} className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                    <span className="flex items-center gap-2 min-w-0">
                      <input type="checkbox" checked={selected.has(k)} onChange={() => onToggle(k)} />
                      <span className="truncate">{label}</span>
                    </span>
                    {i.kind === 'player' && <span className="text-xs text-gray-500 shrink-0">{fmtCap(i.capNumber)}</span>}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TradeOffersTab({ saisonId, selfPoolerId, poolCap }: { saisonId: number; selfPoolerId: string; poolCap: number }) {
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

  // Alignement complet du pooler courant — utilisé pour les ajustements supplémentaires à la
  // confirmation (David, 2026-09-22), chargé une seule fois (indépendant de la composition).
  const [myFullRoster, setMyFullRoster] = useState<TradeableItem[]>([])
  useEffect(() => {
    listTradeableAssetsAction(selfPoolerId, saisonId).then(setMyFullRoster)
  }, [selfPoolerId, saisonId])

  // Masse actuelle (David, 2026-09-22) — recrues exclues, comme partout ailleurs dans l'app.
  const myCapUsed = myFullRoster
    .filter((i): i is Extract<TradeableItem, { kind: 'player' }> => i.kind === 'player' && i.playerType !== 'recrue')
    .reduce((s, i) => s + i.capNumber, 0)

  // ── Nouvelle proposition ──────────────────────────────────────────────────
  const [composing, setComposing] = useState(false)
  const [otherPoolers, setOtherPoolers] = useState<{ id: string; name: string }[]>([])
  const [targetId, setTargetId] = useState('')
  const [theirAssets, setTheirAssets] = useState<TradeableItem[]>([])
  const [mySelected, setMySelected] = useState<Set<string>>(new Set())
  const [theirSelected, setTheirSelected] = useState<Set<string>>(new Set())
  const [composeMsg, setComposeMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!composing) return
    listOtherPoolersAction().then(res => setOtherPoolers(res.poolers))
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

  // Ajustements supplémentaires (David, 2026-09-22) — au besoin pour rester conforme, en plus
  // des joueurs déjà donnés/reçus dans l'échange. 'none' = aucun changement pour ce joueur.
  // 'demote'/'promote_*' couvrent le retour en banque / l'activation d'une recrue — pratique
  // quand libérer un joueur ferait perdre un actif utile, alors que le mettre en banque (s'il
  // est encore protégé) ou activer une recrue existante règle la composition sans rien perdre.
  type ExtraChoice = 'none' | 'release' | 'actif' | 'reserviste' | 'demote' | 'promote_actif' | 'promote_reserviste'
  const [extraChoices, setExtraChoices] = useState<Record<number, Record<number, ExtraChoice>>>({})

  function setExtraChoice(offerId: number, playerId: number, choice: ExtraChoice) {
    setExtraChoices(prev => ({ ...prev, [offerId]: { ...prev[offerId], [playerId]: choice } }))
  }

  function getExtraActions(offerId: number): TradeExtraAction[] {
    return Object.entries(extraChoices[offerId] ?? {})
      .filter(([, choice]) => choice !== 'none')
      .map(([playerIdStr, choice]) => {
        const playerId = Number(playerIdStr)
        if (choice === 'release') return { playerId, action: 'release' as const }
        if (choice === 'demote') return { playerId, action: 'demote_to_recrue' as const }
        if (choice === 'promote_actif') return { playerId, action: 'promote_recrue' as const, newType: 'actif' as const }
        if (choice === 'promote_reserviste') return { playerId, action: 'promote_recrue' as const, newType: 'reserviste' as const }
        return { playerId, action: 'change_status' as const, newType: choice as 'actif' | 'reserviste' }
      })
  }

  function handleConfirm(offer: TradeOfferView) {
    setError(null)
    const types = chosenTypes[offer.id] ?? {}
    startTransition(async () => {
      const result = await confirmTradeReadyAction(offer.id, types, getExtraActions(offer.id))
      if (result.error) setError(result.error)
      load()
    })
  }

  // Sommaire d'impact projeté (David, 2026-09-22) — recalcule l'état final AVANT de confirmer,
  // à partir de l'alignement réel actuel (rien n'a encore été transféré à ce stade, seul
  // "Confirmer ma part" déclenche l'exécution une fois les deux poolers prêts) : retire ce que
  // ce pooler donne, ajoute ce qu'il reçoit avec le type choisi, applique les ajustements
  // supplémentaires choisis — même logique que simulatePostTradeRoster côté serveur, en
  // JS pur ici pour un aperçu live sans aller-retour serveur à chaque clic.
  function computeProjection(offer: TradeOfferView) {
    type Entry = { type: 'actif' | 'reserviste'; position: string | null; capNumber: number }
    const entries = new Map<number, Entry>()
    const recrueMap = new Map<number, { position: string | null; capNumber: number }>()
    for (const i of myFullRoster) {
      if (i.kind !== 'player') continue
      if (i.playerType === 'recrue') { recrueMap.set(i.playerId, { position: i.position, capNumber: i.capNumber }); continue }
      entries.set(i.playerId, { type: i.playerType, position: i.position, capNumber: i.capNumber })
    }

    for (const i of offer.give) if (i.kind === 'player') entries.delete(i.id)

    let pendingChoice = false
    for (const i of offer.receive) {
      if (i.kind !== 'player' || i.currentPlayerType === 'recrue') continue
      const chosen = chosenTypes[offer.id]?.[i.id]
      if (!chosen) { pendingChoice = true; continue }
      entries.set(i.id, { type: chosen, position: i.position, capNumber: i.capNumber ?? 0 })
    }

    for (const extra of getExtraActions(offer.id)) {
      if (extra.action === 'release' || extra.action === 'demote_to_recrue') entries.delete(extra.playerId)
      else if (extra.action === 'change_status') {
        const cur = entries.get(extra.playerId)
        if (cur) entries.set(extra.playerId, { ...cur, type: extra.newType })
      } else if (extra.action === 'promote_recrue') {
        const recrue = recrueMap.get(extra.playerId)
        if (recrue) entries.set(extra.playerId, { type: extra.newType, position: recrue.position, capNumber: recrue.capNumber })
      }
    }

    const all = Array.from(entries.values())
    const actifs = all.filter(e => e.type === 'actif')
    const reservistes = all.filter(e => e.type === 'reserviste')
    const counts = { forward: 0, defense: 0, goalie: 0 }
    for (const a of actifs) counts[getPlayerBucket(a.position)]++
    const capUsed = all.reduce((s, e) => s + e.capNumber, 0)
    const conform = !pendingChoice
      && counts.forward === ACTIVE_LIMITS.forward && counts.defense === ACTIVE_LIMITS.defense && counts.goalie === ACTIVE_LIMITS.goalie
      && reservistes.length >= 2 && capUsed <= poolCap
    return { counts, reservistesCount: reservistes.length, capUsed, conform, pendingChoice }
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
        <p className="text-sm text-gray-500 mb-2">
          Propose un échange de joueurs (actif, réserviste ou recrue) et/ou de choix de repêchage à un autre pooler.
          Il doit accepter, puis l&apos;admin doit approuver avant que rien ne bouge. Une fois approuvé, les deux
          poolers ont un délai pour confirmer que le résultat entre dans leur masse/composition — si l&apos;un des
          deux ne confirme pas à temps, l&apos;échange est annulé pour les deux.
        </p>
        <p className="text-xs text-gray-600 mb-4">
          Ta masse actuelle : <strong>{fmtCap(myCapUsed)}</strong> / {fmtCap(poolCap)}
          {' '}(reste <strong className={myCapUsed > poolCap ? 'text-red-600' : ''}>{fmtCap(poolCap - myCapUsed)}</strong>)
        </p>

        {composing && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
            <select value={targetId} onChange={e => setTargetId(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="">— Choisir un pooler —</option>
              {otherPoolers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {targetId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ItemPicker title="Tu donnes" items={myFullRoster} selected={mySelected} onToggle={k => toggle(setMySelected, k)} />
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
                {[
                  { label: 'Tu donnes', list: o.give },
                  { label: 'Tu reçois', list: o.receive },
                ].map(({ label, list }) => {
                  const total = list.reduce((s, i) => s + (i.capNumber ?? 0), 0)
                  return (
                    <div key={label}>
                      <p className="text-xs text-gray-400 uppercase">{label}</p>
                      {list.length === 0
                        ? <p className="text-gray-400">—</p>
                        : list.map((i, idx) => (
                          <p key={idx} className="flex items-center justify-between gap-2">
                            <span>{i.label}</span>
                            {i.capNumber != null && <span className="text-xs text-gray-500 shrink-0">{fmtCap(i.capNumber)}</span>}
                          </p>
                        ))}
                      {total > 0 && <p className="text-xs text-gray-500 font-medium mt-0.5 pt-0.5 border-t border-gray-100">Total : {fmtCap(total)}</p>}
                    </div>
                  )
                })}
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
                              <div key={i.id} className="flex items-center justify-between text-sm gap-2">
                                <span className="truncate">{i.label} {i.capNumber != null && <span className="text-xs text-gray-500">{fmtCap(i.capNumber)}</span>}</span>
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
                        {(() => {
                          const givenIds = new Set(o.give.filter(i => i.kind === 'player').map(i => i.id))
                          const adjustable = sortForAdjust(myFullRoster.filter(
                            (i): i is Extract<TradeableItem, { kind: 'player' }> => i.kind === 'player' && !givenIds.has(i.playerId),
                          ))
                          if (adjustable.length === 0) return null
                          return (
                            <div className="mb-2">
                              <p className="text-xs text-amber-700 mb-1">
                                Si ça ne rentre pas encore, ajuste au besoin (sans avoir à aller dans Mouvements) — retourner
                                une recrue encore protégée en banque ou en activer une peut aider sans rien libérer pour de bon :
                              </p>
                              <div className="space-y-1 max-h-52 overflow-y-auto border border-amber-200 rounded bg-white p-1.5">
                                {adjustable.map(i => (
                                  <div key={i.playerId} className="flex items-center justify-between text-sm gap-2">
                                    <span className="truncate flex-1 min-w-0">
                                      {i.name} <span className="text-gray-400">({i.playerType})</span>{' '}
                                      <span className="text-xs text-gray-500">{fmtCap(i.capNumber)}</span>
                                    </span>
                                    <select
                                      defaultValue="none"
                                      onChange={e => setExtraChoice(o.id, i.playerId, e.target.value as ExtraChoice)}
                                      className="border rounded px-2 py-1 text-xs shrink-0"
                                    >
                                      <option value="none">— Aucun changement —</option>
                                      {i.playerType === 'recrue' ? (
                                        <>
                                          <option value="promote_actif">Activer → Actif</option>
                                          <option value="promote_reserviste">Activer → Réserviste</option>
                                        </>
                                      ) : (
                                        <>
                                          {i.playerType !== 'actif' && <option value="actif">→ Actif</option>}
                                          {i.playerType !== 'reserviste' && <option value="reserviste">→ Réserviste</option>}
                                          {i.recrueEligible && <option value="demote">Retourner en banque</option>}
                                          <option value="release">Libérer</option>
                                        </>
                                      )}
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                        {(() => {
                          const p = computeProjection(o)
                          const compOk = p.counts.forward === ACTIVE_LIMITS.forward && p.counts.defense === ACTIVE_LIMITS.defense && p.counts.goalie === ACTIVE_LIMITS.goalie
                          return (
                            <div className={`text-xs rounded p-2 mb-2 border ${p.conform ? 'bg-green-50 border-green-200 text-green-800' : 'bg-white border-amber-300 text-gray-700'}`}>
                              <p className="font-medium mb-0.5">
                                Aperçu après cet échange {p.pendingChoice && <span className="font-normal text-gray-500">(en attente d&apos;un choix ci-dessus)</span>}
                              </p>
                              <p className={compOk ? '' : 'text-red-600'}>
                                {p.counts.forward} attaquants · {p.counts.defense} défenseurs · {p.counts.goalie} gardiens
                                {' '}({p.reservistesCount} réservistes)
                              </p>
                              <p className={p.capUsed > poolCap ? 'text-red-600' : ''}>
                                Cap : {fmtCap(p.capUsed)} / {fmtCap(poolCap)} (reste {fmtCap(poolCap - p.capUsed)})
                              </p>
                            </div>
                          )
                        })()}
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
