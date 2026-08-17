'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import {
  getPoolerRosterAction,
  searchPlayersAction,
  getSigningCountsAction,
  submitBatchAction,
} from './actions'
import type {
  ActionType,
  RosterEntry,
  RosterForPooler,
  RosterStatus,
  PlayerSearchResult,
  BatchActionInput,
  SigningCounts,
} from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<RosterStatus, string> = { actif: 'Actif', reserviste: 'Réserviste', recrue: 'Recrue' }
const STATUS_SHORT: Record<RosterStatus, string> = { actif: 'ACT', reserviste: 'RÉS', recrue: 'REC' }

type CartItem = {
  localId: string
  type: ActionType
  label: string
  entry1?: RosterEntry
  newType1?: RosterStatus
  entry2?: RosterEntry
  newType2?: RosterStatus
  ltirEntry?: RosterEntry
  returnLtirEntry?: RosterEntry
  deactivateActifEntry?: RosterEntry
  deactivateNewType?: 'reserviste' | 'ltir'
  releaseEntry?: RosterEntry
  newPlayerEntry?: RosterEntry
  newPlayerType?: 'actif' | 'reserviste' | 'recrue'
  newPlayerId?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayLocal() {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date())
}

function entryLabel(e: RosterEntry) {
  const meta = [e.position, e.teamCode].filter(Boolean).join(', ')
  return `${e.lastName}, ${e.firstName}${meta ? ` (${meta})` : ''}`
}

function capFmt(n: number | null) {
  if (!n) return '—'
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)
}

function posCategory(pos: string | null): 'F' | 'D' | 'G' {
  if (!pos) return 'F'
  const p = pos.toUpperCase()
  if (p === 'G') return 'G'
  if (p.includes('D')) return 'D'
  return 'F'
}

function isLocked(entry: RosterEntry | undefined, delaiJours: number): boolean {
  if (!entry?.lastDeactivatedAt) return false
  const days = (Date.now() - new Date(entry.lastDeactivatedAt).getTime()) / 86_400_000
  return days < delaiJours
}

function unlockDate(entry: RosterEntry | undefined, delaiJours: number): string {
  if (!entry?.lastDeactivatedAt) return ''
  const d = new Date(entry.lastDeactivatedAt)
  d.setDate(d.getDate() + delaiJours)
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
}

// Statuts atteignables depuis le statut courant d'une entrée — exclut le statut courant,
// et 'recrue' si le joueur n'est plus dans la fenêtre de protection (5 saisons).
function allowedNewStatuses(entry: RosterEntry | undefined): RosterStatus[] {
  if (!entry) return []
  const all: RosterStatus[] = ['actif', 'reserviste', 'recrue']
  return all.filter(s => s !== entry.playerType && (s !== 'recrue' || entry.recrueEligible))
}

function projectRoster(roster: RosterForPooler, cart: CartItem[]): RosterForPooler {
  const map = new Map<number, RosterEntry>()
  for (const e of [...roster.actifs, ...roster.reservistes, ...roster.ltir, ...roster.recrues]) {
    map.set(e.id, { ...e })
  }
  let fakeId = -1
  for (const item of cart) {
    switch (item.type) {
      case 'change_status':
        if (item.entry1 && item.newType1 && map.has(item.entry1.id))
          map.get(item.entry1.id)!.playerType = item.newType1
        if (item.entry2 && item.newType2 && map.has(item.entry2.id))
          map.get(item.entry2.id)!.playerType = item.newType2
        break
      case 'ltir':
        if (item.ltirEntry && map.has(item.ltirEntry.id))
          map.get(item.ltirEntry.id)!.playerType = 'ltir'
        break
      case 'return_ltir':
        if (item.deactivateActifEntry && map.has(item.deactivateActifEntry.id))
          map.get(item.deactivateActifEntry.id)!.playerType = item.deactivateNewType ?? 'reserviste'
        if (item.returnLtirEntry && map.has(item.returnLtirEntry.id))
          map.get(item.returnLtirEntry.id)!.playerType = 'actif'
        break
      case 'ltir_sign':
        if (item.ltirEntry && map.has(item.ltirEntry.id))
          map.get(item.ltirEntry.id)!.playerType = 'ltir'
        if (item.newPlayerEntry)
          map.set(fakeId--, { ...item.newPlayerEntry, id: fakeId, playerType: 'actif' })
        break
      case 'sign':
      case 'ballotage':
        if (item.newPlayerEntry)
          map.set(fakeId--, { ...item.newPlayerEntry, id: fakeId, playerType: item.newPlayerType ?? 'reserviste' })
        break
      case 'release':
        if (item.releaseEntry) map.delete(item.releaseEntry.id)
        break
    }
  }
  const all = [...map.values()]
  return {
    actifs:      all.filter(e => e.playerType === 'actif'),
    reservistes: all.filter(e => e.playerType === 'reserviste'),
    ltir:        all.filter(e => e.playerType === 'ltir'),
    recrues:     all.filter(e => e.playerType === 'recrue'),
  }
}

function computeCap(roster: RosterForPooler) {
  return [...roster.actifs, ...roster.reservistes].reduce((s, e) => s + (Number(e.capNumber) || 0), 0)
}

function cartItemToInput(item: CartItem): BatchActionInput {
  return {
    type: item.type,
    entry1Id:          item.entry1?.id,
    newType1:          item.newType1,
    entry2Id:          item.entry2?.id,
    newType2:          item.newType2,
    deactivateActifId: item.deactivateActifEntry?.id,
    deactivateNewType: item.deactivateNewType,
    ltirEntryId:       item.ltirEntry?.id,
    returnLtirEntryId: item.returnLtirEntry?.id,
    releaseEntryId:    item.releaseEntry?.id,
    newPlayerId:       item.newPlayerId,
    newPlayerType:     item.newPlayerType,
  }
}

// Computes how many AL / LTIR budget slots the current cart will consume
function cartSigningUsage(cart: CartItem[], dbLtir: number, maxLtir: number) {
  let alFromCart = 0
  let ltirFromCart = 0
  let ltirBudgetRemaining = Math.max(0, maxLtir - dbLtir)

  for (const item of cart) {
    if (item.type === 'sign') {
      alFromCart++
    } else if (item.type === 'ltir_sign') {
      if (ltirBudgetRemaining > 0) {
        ltirFromCart++
        ltirBudgetRemaining--
      } else {
        alFromCart++  // débord sur le budget AL
      }
    }
  }
  return { alFromCart, ltirFromCart }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EntrySelect({
  label, entries, value, onChange,
}: {
  label: string; entries: RosterEntry[]; value: number; onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value || ''}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">— Choisir —</option>
        {entries.filter(e => e.id > 0).map(e => (
          <option key={e.id} value={e.id}>{entryLabel(e)}</option>
        ))}
      </select>
    </div>
  )
}

function PlayerSearch({
  label, season, onSelect,
}: {
  label: string; season: string; onSelect: (p: PlayerSearchResult) => void
}) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<PlayerSearchResult[]>([])
  const [selected, setSelected] = useState<PlayerSearchResult | null>(null)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      setResults(await searchPlayersAction(query, season))
      setLoading(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query, season])

  if (selected) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="flex items-center gap-2 border border-green-300 bg-green-50 rounded px-3 py-2 text-sm">
          <span className="flex-1 font-medium text-gray-800">{selected.lastName}, {selected.firstName}</span>
          {selected.capNumber != null && <span className="text-xs text-gray-500">{capFmt(selected.capNumber)}</span>}
          <button onClick={() => { setSelected(null); setQuery('') }} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text" value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Rechercher par nom..."
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      {loading && <p className="text-xs text-gray-400 mt-1">Recherche...</p>}
      {results.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
          {results.map(p => (
            <button key={p.id}
              onClick={() => { setSelected(p); setResults([]); setQuery(''); onSelect(p) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
            >
              <span className="font-medium">{p.lastName}, {p.firstName}</span>
              {p.position && <span className="text-xs text-gray-400">{p.position}</span>}
              <span className="ml-auto flex items-center gap-2 shrink-0">
                {p.capNumber != null && <span className="text-xs text-gray-500">{capFmt(p.capNumber)}</span>}
                {p.teamCode && <span className="text-xs text-gray-500">{p.teamCode}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Action definitions ───────────────────────────────────────────────────────

const ACTION_DEFS: { type: ActionType; label: string; description: string; adminOnly?: boolean }[] = [
  { type: 'change_status',   label: 'Changement de statut', description: 'Actif / Réserviste / Recrue' },
  { type: 'sign',            label: 'Signature',         description: 'Ajouter un agent libre' },
  { type: 'ballotage',      label: 'Ballotage',         description: 'Réclamer un joueur au ballotage', adminOnly: true },
  { type: 'release',         label: 'Libération',        description: 'Retirer un joueur' },
  { type: 'ltir',            label: 'LTIR',              description: 'Actif → LTIR', adminOnly: true },
  { type: 'return_ltir',     label: 'Retour LTIR',       description: 'LTIR → actif', adminOnly: true },
  { type: 'ltir_sign',       label: 'LTIR + Signature',  description: 'LTIR et signer', adminOnly: true },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function GestionEffectifsManager({
  isAdmin,
  poolers,
  selfPoolerId,
  selfPoolerName,
  saisonId,
  season,
  poolCap,
  delaiReactivationJours,
  maxSignaturesAl,
  maxSignaturesLtir,
}: {
  isAdmin: boolean
  poolers?: { id: string; name: string }[]
  selfPoolerId?: string
  selfPoolerName?: string
  saisonId: number
  season: string
  poolCap: number
  delaiReactivationJours: number
  maxSignaturesAl: number
  maxSignaturesLtir: number
}) {
  const [poolerId, setPoolerId]           = useState(selfPoolerId ?? '')
  const [roster, setRoster]               = useState<RosterForPooler | null>(null)
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [dbCounts, setDbCounts]           = useState<SigningCounts>({ al: 0, ltir: 0 })

  // Cart
  const [cart, setCart] = useState<CartItem[]>([])

  // Add-form fields
  const [addType, setAddType]               = useState<ActionType | null>(null)
  const [addEntry1Id, setAddEntry1Id]       = useState(0)
  const [addNewType1, setAddNewType1]       = useState<RosterStatus | ''>('')
  const [addEntry2Id, setAddEntry2Id]       = useState(0)
  const [addNewType2, setAddNewType2]       = useState<RosterStatus | ''>('')
  const [addDeactifId, setAddDeactifId]     = useState(0)
  const [addDeactifNewType, setAddDeactifNewType] = useState<'reserviste' | 'ltir'>('reserviste')
  const [addLtirId, setAddLtirId]           = useState(0)
  const [addReturnLtirId, setAddReturnLtirId] = useState(0)
  const [addReleaseId, setAddReleaseId]     = useState(0)
  const [addNewPlayer, setAddNewPlayer]     = useState<PlayerSearchResult | null>(null)
  const [addNewPlayerType, setAddNewPlayerType] = useState<'actif' | 'reserviste' | 'recrue'>('actif')
  const [searchKey, setSearchKey]           = useState(0)

  // Admin date override
  const [forceDateEnabled, setForceDateEnabled] = useState(false)
  const [forcedDate, setForcedDate]             = useState(todayLocal)

  // Submit
  const [isPending, startTransition] = useTransition()
  const [error, setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitWarning, setSubmitWarning] = useState<string | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────────

  const projected = useMemo(
    () => roster ? projectRoster(roster, cart) : null,
    [roster, cart],
  )

  const capUsed  = useMemo(() => projected ? computeCap(projected) : 0, [projected])
  const capOver  = capUsed > poolCap

  const actifCounts = useMemo(() => {
    if (!projected) return { F: 0, D: 0, G: 0 }
    return projected.actifs.reduce((acc, e) => { acc[posCategory(e.position)]++; return acc }, { F: 0, D: 0, G: 0 })
  }, [projected])

  // Signing budget
  const { alFromCart, ltirFromCart } = useMemo(
    () => cartSigningUsage(cart, dbCounts.ltir, maxSignaturesLtir),
    [cart, dbCounts.ltir, maxSignaturesLtir],
  )
  const totalAlUsed   = dbCounts.al + alFromCart
  const totalLtirUsed = dbCounts.ltir + ltirFromCart
  const alRemaining   = maxSignaturesAl - totalAlUsed
  const ltirRemaining = maxSignaturesLtir - totalLtirUsed

  // Can we add one more sign / ltir_sign?
  const canAddSign = alRemaining > 0
  const canAddLtirSign = ltirRemaining > 0 || alRemaining > 0

  // Reactivation lock for currently selected entries (non-admins)
  const returnLtirLocked  = !isAdmin && isLocked(projected ? findEntry(addReturnLtirId) : undefined, delaiReactivationJours)
  const entry1Locked = !isAdmin && addNewType1 === 'actif' && isLocked(projected ? findEntry(addEntry1Id) : undefined, delaiReactivationJours)
  const entry2Locked = !isAdmin && addNewType2 === 'actif' && isLocked(projected ? findEntry(addEntry2Id) : undefined, delaiReactivationJours)

  const compositionOk = actifCounts.F === 12 && actifCounts.D === 6 && actifCounts.G === 2
  const reservistesOk = (projected?.reservistes.length ?? 0) >= 2
  const canSubmit     = cart.length > 0 && !capOver && compositionOk && reservistesOk && !isPending

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!poolerId) { setRoster(null); return }
    setLoadingRoster(true)
    setCart([])
    resetAddForm()
    setSuccess(false)
    setError(null)
    Promise.all([
      getPoolerRosterAction(poolerId, saisonId, season),
      getSigningCountsAction(poolerId, saisonId),
    ]).then(([r, counts]) => {
      setRoster(r)
      setDbCounts(counts)
      setLoadingRoster(false)
    })
  }, [poolerId, saisonId, season])

  function resetAddForm() {
    setAddType(null)
    setAddEntry1Id(0); setAddNewType1(''); setAddEntry2Id(0); setAddNewType2('')
    setAddDeactifId(0); setAddDeactifNewType('reserviste')
    setAddLtirId(0); setAddReturnLtirId(0)
    setAddReleaseId(0); setAddNewPlayer(null)
    setAddNewPlayerType('actif')
    setSearchKey(k => k + 1)
  }

  function handleSelectAddType(type: ActionType) {
    setAddType(type)
    setAddEntry1Id(0); setAddNewType1(''); setAddEntry2Id(0); setAddNewType2('')
    setAddDeactifId(0); setAddDeactifNewType('reserviste')
    setAddLtirId(0); setAddReturnLtirId(0)
    setAddReleaseId(0); setAddNewPlayer(null)
    setAddNewPlayerType('actif')
    setSearchKey(k => k + 1)
  }

  function findEntry(id: number): RosterEntry | undefined {
    if (!projected) return undefined
    return [...projected.actifs, ...projected.reservistes, ...projected.ltir, ...projected.recrues].find(e => e.id === id)
  }

  function isAddReady(): boolean {
    if (!addType) return false
    switch (addType) {
      case 'change_status':
        return !!(
          addEntry1Id && addNewType1 && !entry1Locked &&
          (!addEntry2Id || (addNewType2 && !entry2Locked && addEntry2Id !== addEntry1Id))
        )
      case 'ltir':
        return !!addLtirId
      case 'return_ltir':
        return !!(addReturnLtirId && addDeactifId && !returnLtirLocked)
      case 'ltir_sign':
        return !!(addLtirId && addNewPlayer && canAddLtirSign)
      case 'sign':
        return !!(addNewPlayer && canAddSign)
      case 'ballotage':
        return !!addNewPlayer
      case 'release':
        return !!addReleaseId
      default:
        return false
    }
  }

  function buildCartItem(): CartItem | null {
    if (!addType || !projected) return null
    const localId = crypto.randomUUID()

    const makeNewEntry = (type: 'actif' | 'reserviste' | 'recrue'): RosterEntry => ({
      id: -(Date.now()),
      playerId: addNewPlayer!.id,
      playerType: type,
      firstName: addNewPlayer!.firstName,
      lastName: addNewPlayer!.lastName,
      position: addNewPlayer!.position,
      teamCode: addNewPlayer!.teamCode,
      nhlId: addNewPlayer!.nhlId,
      capNumber: addNewPlayer!.capNumber,
      lastDeactivatedAt: null,
      recrueEligible: false,
    })

    switch (addType) {
      case 'change_status': {
        const e1 = findEntry(addEntry1Id)
        if (!e1 || !addNewType1) return null
        const item: CartItem = {
          localId, type: 'change_status',
          label: `Statut : ${e1.lastName}, ${e1.firstName} → ${STATUS_SHORT[addNewType1]}`,
          entry1: e1, newType1: addNewType1,
        }
        if (addEntry2Id && addNewType2) {
          const e2 = findEntry(addEntry2Id)
          if (e2) {
            item.entry2 = e2
            item.newType2 = addNewType2
            item.label = `Statut : ${e1.lastName} → ${STATUS_SHORT[addNewType1]} / ${e2.lastName} → ${STATUS_SHORT[addNewType2]}`
          }
        }
        return item
      }
      case 'ltir': {
        const e = findEntry(addLtirId)
        if (!e) return null
        return { localId, type: 'ltir', label: `LTIR : ${e.lastName}, ${e.firstName}`, ltirEntry: e }
      }
      case 'return_ltir': {
        const ret = findEntry(addReturnLtirId); const act = findEntry(addDeactifId)
        if (!ret || !act) return null
        return {
          localId, type: 'return_ltir',
          label: `Retour LTIR : ${ret.lastName} → ACT / ${act.lastName} → ${addDeactifNewType === 'ltir' ? 'LTIR' : 'RÉS'}`,
          returnLtirEntry: ret, deactivateActifEntry: act, deactivateNewType: addDeactifNewType,
        }
      }
      case 'ltir_sign': {
        const e = findEntry(addLtirId)
        if (!e || !addNewPlayer) return null
        return { localId, type: 'ltir_sign', label: `LTIR+Sign : ${e.lastName} → LTIR / ${addNewPlayer.lastName} → ACT`, ltirEntry: e, newPlayerEntry: makeNewEntry('actif'), newPlayerId: addNewPlayer.id, newPlayerType: 'actif' }
      }
      case 'sign': {
        if (!addNewPlayer) return null
        return { localId, type: 'sign', label: `Signature : ${addNewPlayer.lastName}, ${addNewPlayer.firstName} (${STATUS_LABEL[addNewPlayerType]})`, newPlayerEntry: makeNewEntry(addNewPlayerType), newPlayerId: addNewPlayer.id, newPlayerType: addNewPlayerType }
      }
      case 'ballotage': {
        if (!addNewPlayer) return null
        return { localId, type: 'ballotage', label: `Ballotage : ${addNewPlayer.lastName}, ${addNewPlayer.firstName} (${STATUS_LABEL[addNewPlayerType]})`, newPlayerEntry: makeNewEntry(addNewPlayerType), newPlayerId: addNewPlayer.id, newPlayerType: addNewPlayerType }
      }
      case 'release': {
        const e = findEntry(addReleaseId)
        if (!e) return null
        return { localId, type: 'release', label: `Libération : ${e.lastName}, ${e.firstName}`, releaseEntry: e }
      }
      default: return null
    }
  }

  function handleAddToCart() {
    const item = buildCartItem()
    if (!item) return
    setCart(c => [...c, item])
    resetAddForm()
    setError(null); setSuccess(false)
  }

  function handleSubmit() {
    setError(null)
    setSubmitWarning(null)
    startTransition(async () => {
      const result = await submitBatchAction({
        poolerId, saisonId,
        actions: cart.map(cartItemToInput),
        forcedDate: isAdmin && forceDateEnabled ? forcedDate : undefined,
      })
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setSubmitWarning(result.warning ?? null)
        setCart([])
        resetAddForm()
        const [r, counts] = await Promise.all([
          getPoolerRosterAction(poolerId, saisonId, season),
          getSigningCountsAction(poolerId, saisonId),
        ])
        setRoster(r)
        setDbCounts(counts)
      }
    })
  }

  // ── Add-form fields ────────────────────────────────────────────────────────

  function renderLockWarning(entry: RosterEntry | undefined, label: string) {
    if (!entry || !isLocked(entry, delaiReactivationJours)) return null
    return (
      <p className="text-xs text-orange-600 mt-1">
        {label} ne peut pas être réactivé avant le {unlockDate(entry, delaiReactivationJours)} (délai {delaiReactivationJours} j).
      </p>
    )
  }

  function renderAddFields() {
    if (!addType || !projected) return null
    switch (addType) {
      case 'change_status': {
        const combined = [...projected.actifs, ...projected.reservistes, ...projected.recrues]
        const e1 = findEntry(addEntry1Id)
        const e2 = findEntry(addEntry2Id)
        const options1 = allowedNewStatuses(e1)
        const options2 = allowedNewStatuses(e2)
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EntrySelect
                label="Joueur"
                entries={combined}
                value={addEntry1Id}
                onChange={v => { setAddEntry1Id(v); setAddNewType1('') }}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau statut</label>
                <select
                  value={addNewType1}
                  onChange={e => setAddNewType1(e.target.value as RosterStatus)}
                  disabled={!e1}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">— Choisir —</option>
                  {options1.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                {e1 && !e1.recrueEligible && (
                  <p className="text-xs text-gray-400 mt-1">Protection recrue (5 saisons) expirée — retour à la banque impossible.</p>
                )}
              </div>
            </div>
            {renderLockWarning(addNewType1 === 'actif' ? e1 : undefined, 'Ce joueur')}

            <div className="pt-3 border-t border-gray-100 space-y-4">
              <p className="text-xs text-gray-500">2e joueur (optionnel — pour un échange en une seule action)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <EntrySelect
                  label="Joueur"
                  entries={combined.filter(e => e.id !== addEntry1Id)}
                  value={addEntry2Id}
                  onChange={v => { setAddEntry2Id(v); setAddNewType2('') }}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau statut</label>
                  <select
                    value={addNewType2}
                    onChange={e => setAddNewType2(e.target.value as RosterStatus)}
                    disabled={!e2}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">— Choisir —</option>
                    {options2.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>
              {renderLockWarning(addNewType2 === 'actif' ? e2 : undefined, 'Ce joueur')}
            </div>
          </div>
        )
      }
      case 'ltir':
        return <EntrySelect label="Actif à mettre sur LTIR" entries={projected.actifs} value={addLtirId} onChange={setAddLtirId} />
      case 'return_ltir':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EntrySelect label="Joueur LTIR à réintégrer" entries={projected.ltir}   value={addReturnLtirId} onChange={setAddReturnLtirId} />
              <EntrySelect label="Actif à désactiver"       entries={projected.actifs} value={addDeactifId}    onChange={setAddDeactifId} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ce joueur devient</label>
              <select
                value={addDeactifNewType}
                onChange={e => setAddDeactifNewType(e.target.value as 'reserviste' | 'ltir')}
                disabled={!addDeactifId}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="reserviste">Réserviste</option>
                <option value="ltir">LTIR (coïncide avec une nouvelle blessure)</option>
              </select>
            </div>
            {renderLockWarning(findEntry(addReturnLtirId), 'Ce joueur')}
          </div>
        )
      case 'ltir_sign':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <EntrySelect label="Actif à mettre sur LTIR" entries={projected.actifs} value={addLtirId} onChange={setAddLtirId} />
            <PlayerSearch key={searchKey} label="Agent libre à signer (actif)" season={season} onSelect={setAddNewPlayer} />
          </div>
        )
      case 'sign':
      case 'ballotage':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PlayerSearch key={searchKey} label={addType === 'ballotage' ? 'Joueur réclamé au ballotage' : 'Joueur à signer'} season={season} onSelect={setAddNewPlayer} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
              <select value={addNewPlayerType} onChange={e => setAddNewPlayerType(e.target.value as 'actif' | 'reserviste' | 'recrue')}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="actif">Actif</option>
                <option value="reserviste">Réserviste</option>
                {addType === 'sign' && <option value="recrue">Recrue (agent libre sur ELC)</option>}
              </select>
            </div>
          </div>
        )
      case 'release':
        return (
          <EntrySelect
            label="Joueur à libérer"
            entries={[...projected.actifs, ...projected.reservistes, ...projected.ltir].filter(e => e.id > 0)}
            value={addReleaseId}
            onChange={setAddReleaseId}
          />
        )
    }
  }

  const visibleActions = ACTION_DEFS.filter(a => isAdmin || !a.adminOnly)
  // La liste de poolers n'est fournie que par le hub admin (/admin/effectifs) — la page
  // personnelle (/gestion-effectifs) n'agit jamais que sur son propre pooler, même pour
  // un admin, donc le sélecteur ne doit dépendre de rien d'autre que de la présence de
  // cette liste (pas de isAdmin seul, sinon un admin sur sa propre page voit un menu
  // déroulant vide — repéré par David le 2026-08-13).
  const showPoolerPicker = !!poolers && poolers.length > 0
  const poolerName = poolers?.find(p => p.id === poolerId)?.name ?? selfPoolerName ?? ''

  // ── Signing budget pill helper ─────────────────────────────────────────────

  function BudgetPill({ used, max, label }: { used: number; max: number; label: string }) {
    const pct = max > 0 ? used / max : 0
    const color = pct >= 1 ? 'bg-red-100 text-red-700' : pct >= 0.75 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
        {label} : {used}/{max}
      </span>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Pooler selector — hub admin seulement (liste fournie par l'appelant) */}
      {showPoolerPicker && (
        <div className="bg-white rounded-lg shadow p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Pooler</label>
          <select value={poolerId} onChange={e => setPoolerId(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
            <option value="">— Choisir un pooler —</option>
            {poolers?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {loadingRoster && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400 text-sm">Chargement du roster...</div>
      )}

      {/* Signing budget (visible once roster loaded) */}
      {roster && (
        <div className="bg-white rounded-lg shadow px-5 py-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-gray-500 font-medium">Agents libres cette saison :</span>
          <BudgetPill used={totalAlUsed} max={maxSignaturesAl} label="Standard" />
          <BudgetPill used={totalLtirUsed} max={maxSignaturesLtir} label="LTIR" />
          {!isAdmin && (
            <span className="text-xs text-gray-400 ml-auto">Délai réactivation : {delaiReactivationJours} j</span>
          )}
        </div>
      )}

      {/* Add-action form */}
      {roster && projected && (
        <div className="bg-white rounded-lg shadow p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Ajouter une action</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {visibleActions.map(a => (
              <button key={a.type} onClick={() => handleSelectAddType(a.type)}
                className={`text-left px-3 py-2.5 rounded-lg border-2 transition-colors ${
                  addType === a.type ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <p className={`text-xs font-semibold leading-tight ${addType === a.type ? 'text-blue-700' : 'text-gray-800'}`}>{a.label}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">{a.description}</p>
              </button>
            ))}
          </div>

          {addType && (
            <div className="space-y-4 pt-3 border-t border-gray-100">
              {/* Signing limit warning */}
              {addType === 'sign' && !canAddSign && (
                <p className="text-xs text-red-600">Budget d&apos;agents libres standard épuisé ({totalAlUsed}/{maxSignaturesAl}).</p>
              )}
              {addType === 'ltir_sign' && !canAddLtirSign && (
                <p className="text-xs text-red-600">Budgets d&apos;agents libres épuisés (AL : {totalAlUsed}/{maxSignaturesAl}, LTIR : {totalLtirUsed}/{maxSignaturesLtir}).</p>
              )}
              {renderAddFields()}
              <div className="flex justify-end">
                <button onClick={handleAddToCart} disabled={!isAddReady()}
                  className="bg-green-600 text-white px-4 py-2 rounded font-medium text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  Ajouter au panier
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cart */}
      {cart.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Panier — {cart.length} action{cart.length > 1 ? 's' : ''}</p>
            <button onClick={() => { setCart([]); setError(null) }} className="text-xs text-red-500 hover:text-red-700">Vider</button>
          </div>
          <ul className="divide-y divide-gray-100">
            {cart.map(item => (
              <li key={item.localId} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-gray-700">{item.label}</span>
                <button onClick={() => setCart(c => c.filter(i => i.localId !== item.localId))}
                  className="text-gray-400 hover:text-red-500 ml-4 shrink-0 text-xs">Retirer</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Projected state */}
      {projected && cart.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-700">État projeté</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>
              Actifs :{' '}
              <span className={actifCounts.F !== 12 ? 'text-red-600 font-semibold' : 'text-gray-700'}>{actifCounts.F}A</span>{' '}
              <span className={actifCounts.D !== 6  ? 'text-red-600 font-semibold' : 'text-gray-700'}>{actifCounts.D}D</span>{' '}
              <span className={actifCounts.G !== 2  ? 'text-red-600 font-semibold' : 'text-gray-700'}>{actifCounts.G}G</span>
            </span>
            <span>Réservistes : <span className={projected.reservistes.length < 2 ? 'text-red-600 font-semibold' : 'text-gray-700'}>{projected.reservistes.length}</span></span>
            {projected.ltir.length   > 0 && <span>LTIR : {projected.ltir.length}</span>}
            {projected.recrues.length > 0 && <span>Recrues : {projected.recrues.length}</span>}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Masse salariale</span>
              <span className={capOver ? 'text-red-600 font-semibold' : 'text-gray-700'}>{capFmt(capUsed)} / {capFmt(poolCap)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${capOver ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min((capUsed / poolCap) * 100, 100)}%` }} />
            </div>
          </div>
          {!compositionOk && <p className="text-xs text-red-600">La composition des actifs doit être 12 attaquants / 6 défenseurs / 2 gardiens.</p>}
          {!reservistesOk && <p className="text-xs text-red-600">Minimum 2 réservistes requis.</p>}
          {capOver        && <p className="text-xs text-red-600">La masse salariale dépasse le cap du pool ({capFmt(poolCap)}).</p>}
        </div>
      )}

      {/* Admin date override */}
      {isAdmin && cart.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5 space-y-3">
          <div className="flex items-center gap-3">
            <input type="checkbox" id="force-date" checked={forceDateEnabled} onChange={e => setForceDateEnabled(e.target.checked)} className="rounded border-gray-300" />
            <label htmlFor="force-date" className="text-sm text-gray-700">Forcer une date effective</label>
          </div>
          {forceDateEnabled
            ? <input type="date" value={forcedDate} onChange={e => setForcedDate(e.target.value)} className="border border-gray-300 rounded px-3 py-2 text-sm max-w-xs" />
            : <p className="text-xs text-gray-400">Par défaut : date et heure de la soumission.</p>
          }
        </div>
      )}

      {/* Submit */}
      {cart.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5 flex items-center justify-between gap-4">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{poolerName}</span>
            {' — '}{cart.length} action{cart.length > 1 ? 's' : ''}
            {isAdmin && forceDateEnabled && ` — ${forcedDate}`}
          </div>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="bg-blue-600 text-white px-5 py-2 rounded font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
            {isPending ? 'En cours...' : 'Soumettre'}
          </button>
        </div>
      )}

      {error   && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-700">✓ Mouvements appliqués avec succès.</div>}
      {submitWarning && <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm text-orange-700">⚠ {submitWarning}</div>}
    </div>
  )
}
