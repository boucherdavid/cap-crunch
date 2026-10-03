'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { listTradeableAssetsAction, type TradeableItem } from '../gestion-effectifs/trade-actions'
import {
  addMarketListingsAction, removeMarketListingAction, addMarketRequestAction, removeMarketRequestAction,
} from './actions'
import {
  MARKET_CATEGORY_LABEL, tradeOfferHref,
  type MarketCategory, type MarketListingView, type MarketRequestView,
} from '@/lib/tradeMarketShared'

const fmtCap = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const TYPE_LABEL: Record<string, string> = { actif: 'Actif', reserviste: 'Réserviste', recrue: 'Recrue' }

function plusDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtDay(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

function itemKey(i: TradeableItem): string {
  return i.kind === 'player' ? `player-${i.playerId}` : `pick-${i.pickId}`
}

function itemLabel(i: TradeableItem): string {
  return i.kind === 'player'
    ? `${i.name}${i.position ? ` (${i.position}${i.teamCode ? ', ' + i.teamCode : ''})` : ''}`
    : `Choix ronde ${i.round} (${i.season})`
}

export default function MarcheEchangesClient({ saisonId, selfPoolerId, today, listings, requests }: {
  saisonId: number
  selfPoolerId: string
  today: string
  listings: MarketListingView[]
  requests: MarketRequestView[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<'none' | 'offrir' | 'chercher'>('none')

  // ── Mettre sur le marché ──────────────────────────────────────────────────
  const [myAssets, setMyAssets] = useState<TradeableItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [expiresOn, setExpiresOn] = useState(plusDays(today, 7))

  useEffect(() => {
    if (panel !== 'offrir') return
    listTradeableAssetsAction(selfPoolerId, saisonId).then(setMyAssets)
  }, [panel, selfPoolerId, saisonId])

  const alreadyListed = useMemo(
    () => new Set(listings.filter(l => l.poolerId === selfPoolerId).map(l => `${l.kind}-${l.itemId}`)),
    [listings, selfPoolerId],
  )

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleAddListings() {
    setError(null)
    const items = Array.from(selected).map(k => {
      const [kind, id] = k.split('-')
      return { kind: kind as 'player' | 'pick', id: Number(id) }
    })
    startTransition(async () => {
      const res = await addMarketListingsAction(saisonId, items, note, expiresOn)
      if (res.error) { setError(res.error); return }
      setSelected(new Set()); setNote(''); setPanel('none')
      router.refresh()
    })
  }

  // ── Je cherche ────────────────────────────────────────────────────────────
  const [category, setCategory] = useState<MarketCategory | ''>('')
  const [description, setDescription] = useState('')
  const [requestExpiresOn, setRequestExpiresOn] = useState(plusDays(today, 7))

  function handleAddRequest() {
    setError(null)
    startTransition(async () => {
      const res = await addMarketRequestAction(saisonId, category || null, description, requestExpiresOn)
      if (res.error) { setError(res.error); return }
      setCategory(''); setDescription(''); setPanel('none')
      router.refresh()
    })
  }

  function handleRemove(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      router.refresh()
    })
  }

  // ── Filtres ───────────────────────────────────────────────────────────────
  const [poolerFilter, setPoolerFilter] = useState('')
  const poolers = useMemo(() => {
    const m = new Map<string, string>()
    for (const x of [...listings, ...requests]) m.set(x.poolerId, x.poolerName)
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [listings, requests])
  const shownListings = poolerFilter ? listings.filter(l => l.poolerId === poolerFilter) : listings
  const shownRequests = poolerFilter ? requests.filter(r => r.poolerId === poolerFilter) : requests

  const maxDate = plusDays(today, 90)

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setPanel(p => p === 'offrir' ? 'none' : 'offrir')}
          className={`text-sm px-3 py-1.5 rounded font-medium ${panel === 'offrir' ? 'bg-gray-200 text-gray-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
          {panel === 'offrir' ? 'Annuler' : '+ Mettre sur le marché'}
        </button>
        <button onClick={() => setPanel(p => p === 'chercher' ? 'none' : 'chercher')}
          className={`text-sm px-3 py-1.5 rounded font-medium ${panel === 'chercher' ? 'bg-gray-200 text-gray-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
          {panel === 'chercher' ? 'Annuler' : '+ Je cherche…'}
        </button>
      </div>

      {panel === 'offrir' && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm text-gray-600">
            Coche ce que tu es prêt à échanger. Un élément déjà sur le marché est simplement remis à jour (note et date).
          </p>
          <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto divide-y">
            {myAssets.length === 0 && <p className="text-xs text-gray-400 p-2">Chargement…</p>}
            {myAssets.map(i => {
              const k = itemKey(i)
              return (
                <label key={k} className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                  <span className="flex items-center gap-2 min-w-0">
                    <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} />
                    <span className="truncate">{itemLabel(i)}</span>
                    {i.kind === 'player' && <span className="text-[11px] text-gray-400 shrink-0">{TYPE_LABEL[i.playerType]}</span>}
                    {alreadyListed.has(k) && <span className="text-[11px] text-blue-600 shrink-0">déjà sur le marché</span>}
                  </span>
                  {i.kind === 'player' && <span className="text-xs text-gray-500 shrink-0">{fmtCap(i.capNumber)}</span>}
                </label>
              )
            })}
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="flex-1 text-sm text-gray-600">
              Note (facultatif)
              <input value={note} onChange={e => setNote(e.target.value)} maxLength={300}
                placeholder="Ex : je cherche un défenseur en retour"
                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-sm text-gray-600">
              Sur le marché jusqu&apos;au
              <input type="date" value={expiresOn} min={today} max={maxDate} onChange={e => setExpiresOn(e.target.value)}
                className="mt-1 block border rounded-lg px-2 py-1.5 text-sm" />
            </label>
          </div>
          <button onClick={handleAddListings} disabled={isPending || selected.size === 0}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            Mettre sur le marché{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      )}

      {panel === 'chercher' && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm text-gray-600">
            Publie un besoin sans viser un joueur précis : les autres poolers pourront te faire une offre.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="text-sm text-gray-600">
              Type
              <select value={category} onChange={e => setCategory(e.target.value as MarketCategory | '')}
                className="mt-1 block border rounded-lg px-2 py-1.5 text-sm">
                <option value="">Autre</option>
                {(Object.keys(MARKET_CATEGORY_LABEL) as MarketCategory[]).map(c => (
                  <option key={c} value={c}>{MARKET_CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </label>
            <label className="flex-1 text-sm text-gray-600">
              Ce que tu cherches
              <input value={description} onChange={e => setDescription(e.target.value)} maxLength={300}
                placeholder="Ex : un défenseur offensif à moins de 3 M$"
                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-sm text-gray-600">
              Jusqu&apos;au
              <input type="date" value={requestExpiresOn} min={today} max={maxDate} onChange={e => setRequestExpiresOn(e.target.value)}
                className="mt-1 block border rounded-lg px-2 py-1.5 text-sm" />
            </label>
          </div>
          <button onClick={handleAddRequest} disabled={isPending || !description.trim()}
            className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            Publier
          </button>
        </div>
      )}

      {poolers.length > 1 && (
        <select value={poolerFilter} onChange={e => setPoolerFilter(e.target.value)} aria-label="Filtrer par pooler"
          className="border rounded-lg px-2 py-1.5 text-sm">
          <option value="">Tous les poolers</option>
          {poolers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Sur le marché</h2>
        {shownListings.length === 0
          ? <p className="text-sm text-gray-400">Aucun joueur ni choix de repêchage sur le marché pour l&apos;instant.</p>
          : (
            <ul className="bg-white rounded-lg shadow divide-y divide-gray-100">
              {shownListings.map(l => {
                const mine = l.poolerId === selfPoolerId
                return (
                  <li key={l.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">
                        <span className="font-semibold">{l.label}</span>
                        {l.position && <span className="text-gray-500"> ({l.position}{l.teamCode ? `, ${l.teamCode}` : ''})</span>}
                        {l.playerType && <span className="ml-2 text-[11px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{TYPE_LABEL[l.playerType]}</span>}
                        {l.capNumber != null && <span className="ml-2 text-xs text-gray-500">{fmtCap(l.capNumber)}</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {mine ? 'À toi' : l.poolerName} · jusqu&apos;au {fmtDay(l.expiresOn)}
                      </p>
                      {l.note && <p className="text-xs text-gray-600 italic mt-0.5">« {l.note} »</p>}
                    </div>
                    {mine ? (
                      <button onClick={() => handleRemove(() => removeMarketListingAction(l.id))} disabled={isPending}
                        className="self-start sm:self-auto text-xs text-red-600 border border-red-200 rounded px-2 py-1 hover:bg-red-50 disabled:opacity-50">
                        Retirer
                      </button>
                    ) : (
                      <Link href={tradeOfferHref(l.poolerId, `${l.kind}-${l.itemId}`)}
                        className="self-start sm:self-auto text-xs bg-blue-600 text-white rounded px-3 py-1.5 font-medium hover:bg-blue-700 whitespace-nowrap">
                        Faire une offre
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Je cherche</h2>
        {shownRequests.length === 0
          ? <p className="text-sm text-gray-400">Aucune recherche publiée pour l&apos;instant.</p>
          : (
            <ul className="bg-white rounded-lg shadow divide-y divide-gray-100">
              {shownRequests.map(r => {
                const mine = r.poolerId === selfPoolerId
                return (
                  <li key={r.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">
                        {r.category && <span className="mr-2 text-[11px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">{MARKET_CATEGORY_LABEL[r.category]}</span>}
                        {r.description}
                      </p>
                      <p className="text-xs text-gray-500">{mine ? 'À toi' : r.poolerName} · jusqu&apos;au {fmtDay(r.expiresOn)}</p>
                    </div>
                    {mine ? (
                      <button onClick={() => handleRemove(() => removeMarketRequestAction(r.id))} disabled={isPending}
                        className="self-start sm:self-auto text-xs text-red-600 border border-red-200 rounded px-2 py-1 hover:bg-red-50 disabled:opacity-50">
                        Retirer
                      </button>
                    ) : (
                      <Link href={tradeOfferHref(r.poolerId)}
                        className="self-start sm:self-auto text-xs bg-emerald-600 text-white rounded px-3 py-1.5 font-medium hover:bg-emerald-700 whitespace-nowrap">
                        Faire une offre
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
      </section>

      <p className="text-xs text-gray-400">
        Un élément disparaît du marché à sa date d&apos;expiration, ou dès que le joueur ou le choix change d&apos;alignement.
      </p>
    </div>
  )
}
