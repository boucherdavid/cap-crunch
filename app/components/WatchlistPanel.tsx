'use client'

// Panneau « Mes listes » (David, 2026-09-27) — listes privées de joueurs à surveiller, mêmes
// données partout où il est affiché (/listes, /repechage-recrues, /repechage-agents-libres,
// /gestion-effectifs, /simulation). Un joueur pris par un pooler n'est pas retiré de la liste :
// il passe dans la section repliée « Déjà pris », avec le nom du pooler. `refreshMs` recharge
// la liste périodiquement (soir du pool : les joueurs pris disparaissent d'eux-mêmes).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listWatchlistsAction, createWatchlistAction, renameWatchlistAction, deleteWatchlistAction,
  getWatchlistItemsAction, addWatchlistItemAction, removeWatchlistItemAction,
  reorderWatchlistAction, setWatchlistNoteAction, searchWatchlistPlayersAction, listWatchlistTeamsAction,
  type Watchlist, type WatchlistItem, type WatchlistKind, type PlayerSearchResult, type SearchOptions,
} from '@/app/listes/actions'

const KIND_LABEL: Record<WatchlistKind, string> = { joueurs: 'Agents libres', recrues: 'Recrues' }
const STORAGE_KEY = 'watchlist-selected'

function fmtCap(n: number | null) {
  if (n == null) return null
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} M$` : `${Math.round(n / 1000)} k$`
}

function readStored(): number | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v ? Number(v) : null
  } catch { return null }
}
function writeStored(id: number | null) {
  try {
    if (id == null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, String(id))
  } catch { /* stockage indisponible — simple commodité */ }
}

export default function WatchlistPanel({
  kinds,
  defaultOpen = true,
  refreshMs,
  onSimulate,
}: {
  kinds: WatchlistKind[]
  defaultOpen?: boolean
  refreshMs?: number
  // Présent seulement dans /simulation : ajoute le joueur à la simulation en cours (listes
  // d'agents libres seulement — une recrue repêchée ne compte pas dans la masse salariale).
  onSimulate?: (playerId: number) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [lists, setLists] = useState<Watchlist[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [items, setItems] = useState<WatchlistItem[]>([])
  // Liste dont les items sont chargés — « Chargement… » tant qu'elle diffère de la liste choisie.
  const [loadedListId, setLoadedListId] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [showTaken, setShowTaken] = useState(false)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<WatchlistKind>(kinds[0])
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerSearchResult[]>([])
  const [truncated, setTruncated] = useState(false)
  const [searching, setSearching] = useState(false)
  // Filtres de recherche, comme /simulation (David, 2026-09-27) — parcourir sans connaître le nom.
  const [fPosition, setFPosition] = useState<'' | 'forward' | 'defense' | 'goalie'>('')
  const [fTeam, setFTeam] = useState('')
  const [fMaxSalary, setFMaxSalary] = useState('')
  const [fElc, setFElc] = useState(false)
  const [fSort, setFSort] = useState<'' | NonNullable<SearchOptions['sort']>>('')
  const [teams, setTeams] = useState<{ code: string; name: string }[]>([])

  const selected = lists.find(l => l.id === selectedId) ?? null
  const kindsKey = kinds.join(',')

  const applyLists = useCallback((fetched: Watchlist[], preferId?: number | null) => {
    setLists(fetched)
    const wanted = preferId ?? readStored()
    const next = fetched.find(l => l.id === wanted) ?? fetched[0] ?? null
    setSelectedId(next?.id ?? null)
  }, [])

  const loadLists = useCallback(async (preferId?: number | null) => {
    const res = await listWatchlistsAction(kindsKey.split(',') as WatchlistKind[])
    applyLists(res.lists, preferId)
  }, [kindsKey, applyLists])

  const loadItems = useCallback(async (listId: number) => {
    const res = await getWatchlistItemsAction(listId)
    if (res.items) setItems(res.items)
    setLoadedListId(listId)
  }, [])

  useEffect(() => {
    let cancelled = false
    listWatchlistsAction(kindsKey.split(',') as WatchlistKind[]).then(res => {
      if (!cancelled) applyLists(res.lists)
    })
    return () => { cancelled = true }
  }, [kindsKey, applyLists])

  useEffect(() => {
    if (selectedId == null) return
    writeStored(selectedId)
    let cancelled = false
    getWatchlistItemsAction(selectedId).then(res => {
      if (cancelled) return
      if (res.items) setItems(res.items)
      setLoadedListId(selectedId)
    })
    return () => { cancelled = true }
  }, [selectedId])

  // Rafraîchissement périodique + au retour sur l'onglet du navigateur.
  const selectedRef = useRef(selectedId)
  useEffect(() => { selectedRef.current = selectedId }, [selectedId])
  useEffect(() => {
    const refresh = () => { if (selectedRef.current != null) loadItems(selectedRef.current) }
    window.addEventListener('focus', refresh)
    const timer = refreshMs ? window.setInterval(refresh, refreshMs) : undefined
    return () => {
      window.removeEventListener('focus', refresh)
      if (timer) window.clearInterval(timer)
    }
  }, [refreshMs, loadItems])

  // Équipes pour le filtre — chargées une seule fois, à la première ouverture de la recherche.
  useEffect(() => {
    if (!adding || teams.length > 0) return
    let cancelled = false
    listWatchlistTeamsAction().then(res => { if (!cancelled) setTeams(res.teams) })
    return () => { cancelled = true }
  }, [adding, teams.length])

  // Recherche (délai de frappe) — le nom est optionnel : sans nom, parcourt les disponibles
  // selon les filtres.
  const selectedKind = selected?.kind ?? null
  useEffect(() => {
    if (!adding || !selectedKind) return
    const maxM = parseFloat(fMaxSalary.replace(',', '.'))
    const opts: SearchOptions = {
      query,
      position: fPosition || undefined,
      teamCode: fTeam || undefined,
      maxSalary: selectedKind === 'joueurs' && !Number.isNaN(maxM) && maxM > 0 ? Math.round(maxM * 1_000_000) : undefined,
      elcOnly: selectedKind === 'joueurs' && fElc ? true : undefined,
      sort: fSort || undefined,
    }
    const t = window.setTimeout(async () => {
      setSearching(true)
      const res = await searchWatchlistPlayersAction(selectedKind, opts)
      setSearching(false)
      setResults(res.players)
      setTruncated(res.truncated)
    }, 300)
    return () => window.clearTimeout(t)
  }, [adding, selectedKind, query, fPosition, fTeam, fMaxSalary, fElc, fSort])

  const flash = (text: string) => { setMsg(text); window.setTimeout(() => setMsg(null), 3000) }

  const handleCreate = async () => {
    const res = await createWatchlistAction(newKind, newName)
    if (res.error) return flash(res.error)
    setCreating(false); setNewName('')
    await loadLists(res.id)
    setAdding(true)
  }

  const handleRename = async () => {
    if (!selected) return
    const res = await renameWatchlistAction(selected.id, renameValue)
    if (res.error) return flash(res.error)
    setRenaming(false)
    await loadLists(selected.id)
  }

  const handleDelete = async () => {
    if (!selected || !window.confirm(`Supprimer la liste « ${selected.name} » ?`)) return
    const res = await deleteWatchlistAction(selected.id)
    if (res.error) return flash(res.error)
    writeStored(null)
    await loadLists(null)
  }

  const handleAdd = async (p: PlayerSearchResult) => {
    if (!selected) return
    const res = await addWatchlistItemAction(selected.id, p.id)
    if (res.error) return flash(res.error)
    setResults(r => r.filter(x => x.id !== p.id))
    await loadItems(selected.id)
    setLists(ls => ls.map(l => l.id === selected.id ? { ...l, itemCount: l.itemCount + 1 } : l))
  }

  const handleRemove = async (item: WatchlistItem) => {
    if (!selected) return
    setItems(its => its.filter(i => i.itemId !== item.itemId))
    const res = await removeWatchlistItemAction(selected.id, item.itemId)
    if (res.error) { flash(res.error); loadItems(selected.id) }
    setLists(ls => ls.map(l => l.id === selected.id ? { ...l, itemCount: Math.max(0, l.itemCount - 1) } : l))
  }

  // Déplace parmi TOUS les items (pris compris) pour garder un ordre stable si un joueur
  // redevient disponible (libéré).
  const handleMove = async (item: WatchlistItem, dir: -1 | 1) => {
    if (!selected) return
    const available = items.filter(i => !i.takenBy)
    const idx = available.findIndex(i => i.itemId === item.itemId)
    const target = available[idx + dir]
    if (!target) return
    const order = [...items]
    const a = order.findIndex(i => i.itemId === item.itemId)
    const b = order.findIndex(i => i.itemId === target.itemId)
    ;[order[a], order[b]] = [order[b], order[a]]
    setItems(order)
    const res = await reorderWatchlistAction(selected.id, order.map(i => i.itemId))
    if (res.error) { flash(res.error); loadItems(selected.id) }
  }

  const handleNote = async (item: WatchlistItem, note: string) => {
    if (!selected || (item.note ?? '') === note.trim()) return
    setItems(its => its.map(i => i.itemId === item.itemId ? { ...i, note: note.trim() || null } : i))
    const res = await setWatchlistNoteAction(selected.id, item.itemId, note)
    if (res.error) flash(res.error)
  }

  // Dérivés plutôt que remis à zéro dans un effet : aucune liste choisie → aucun item ;
  // requête trop courte → aucun résultat.
  const loading = selectedId != null && loadedListId !== selectedId
  const shownItems = selectedId == null || loading ? [] : items
  const available = shownItems.filter(i => !i.takenBy)
  const taken = shownItems.filter(i => i.takenBy)
  const shownResults = results
  const hasFilters = !!(query || fPosition || fTeam || fMaxSalary || fElc || fSort)
  const resetFilters = () => { setQuery(''); setFPosition(''); setFTeam(''); setFMaxSalary(''); setFElc(false); setFSort('') }
  const inList = new Set(items.map(i => i.playerId))

  return (
    <section className="bg-white rounded-lg shadow border border-indigo-100 mb-6">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-semibold text-gray-800">
          📋 Mes listes
          <span className="ml-2 text-xs font-normal text-gray-500">privées — toi seul les vois</span>
        </span>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          {/* Barre de sélection / gestion des listes */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {lists.length > 0 && !renaming && (
              <select
                value={selectedId ?? ''}
                onChange={e => { setSelectedId(Number(e.target.value)); setAdding(false); setQuery('') }}
                className="border rounded-lg px-3 py-1.5 text-sm bg-white text-gray-800 min-w-0 max-w-full"
              >
                {kinds.map(k => {
                  const ofKind = lists.filter(l => l.kind === k)
                  if (ofKind.length === 0) return null
                  return (
                    <optgroup key={k} label={KIND_LABEL[k]}>
                      {ofKind.map(l => <option key={l.id} value={l.id}>{l.name} ({l.itemCount})</option>)}
                    </optgroup>
                  )
                })}
              </select>
            )}
            {renaming && selected && (
              <>
                <input
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename() }}
                  className="border rounded-lg px-3 py-1.5 text-sm"
                  maxLength={100}
                  autoFocus
                />
                <button type="button" onClick={handleRename} className="text-sm text-blue-600 hover:underline">Renommer</button>
                <button type="button" onClick={() => setRenaming(false)} className="text-sm text-gray-500 hover:underline">Annuler</button>
              </>
            )}
            {selected && !renaming && (
              <>
                <button type="button" onClick={() => { setRenameValue(selected.name); setRenaming(true) }} className="text-xs text-gray-500 hover:text-gray-800">Renommer</button>
                <button type="button" onClick={handleDelete} className="text-xs text-red-500 hover:text-red-700">Supprimer</button>
              </>
            )}
            {!creating ? (
              <button type="button" onClick={() => setCreating(true)} className="ml-auto text-sm px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                + Nouvelle liste
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
                {kinds.length > 1 && (
                  <select value={newKind} onChange={e => setNewKind(e.target.value as WatchlistKind)} className="border rounded-lg px-2 py-1.5 text-sm bg-white">
                    {kinds.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                )}
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                  placeholder={kinds.length === 1 && kinds[0] === 'recrues' ? 'Ex : Mes cibles 1re ronde' : 'Ex : Défenseurs à surveiller'}
                  className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-0"
                  maxLength={100}
                  autoFocus
                />
                <button type="button" onClick={handleCreate} className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Créer</button>
                <button type="button" onClick={() => { setCreating(false); setNewName('') }} className="text-sm text-gray-500 hover:underline">Annuler</button>
              </div>
            )}
          </div>

          {msg && <p className="text-xs text-red-600 mb-2">{msg}</p>}

          {lists.length === 0 && !creating && (
            <p className="text-sm text-gray-500">
              Aucune liste pour l&apos;instant. Crée une liste pour garder une trace des{' '}
              {kinds.includes('recrues') && kinds.includes('joueurs') ? 'joueurs et recrues' : kinds[0] === 'recrues' ? 'recrues' : 'joueurs'}{' '}
              qui t&apos;intéressent — un joueur pris par un pooler est automatiquement masqué.
            </p>
          )}

          {selected && (
            <>
              {loading ? (
                <p className="text-sm text-gray-400">Chargement…</p>
              ) : available.length === 0 ? (
                <p className="text-sm text-gray-500 mb-2">
                  {taken.length > 0 ? 'Tous les joueurs de cette liste sont déjà pris.' : 'Liste vide — ajoute des joueurs ci-dessous.'}
                </p>
              ) : (
                <ol className="divide-y divide-gray-100 mb-2">
                  {available.map((item, i) => (
                    <li key={item.itemId} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="w-6 text-right text-sm font-semibold text-indigo-600">{i + 1}</span>
                      <span className="flex flex-col">
                        <button type="button" onClick={() => handleMove(item, -1)} disabled={i === 0} className="text-xs leading-none text-gray-400 hover:text-gray-800 disabled:opacity-20" aria-label="Monter">▲</button>
                        <button type="button" onClick={() => handleMove(item, 1)} disabled={i === available.length - 1} className="text-xs leading-none text-gray-400 hover:text-gray-800 disabled:opacity-20" aria-label="Descendre">▼</button>
                      </span>
                      <span className="text-sm font-medium text-gray-800 min-w-0">
                        {item.lastName}, {item.firstName}
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          {[item.position, item.team, item.draftOverall ? `#${item.draftOverall}` : null, fmtCap(item.capNumber)].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <input
                        defaultValue={item.note ?? ''}
                        onBlur={e => handleNote(item, e.target.value)}
                        placeholder="Note…"
                        maxLength={200}
                        className="max-sm:order-last max-sm:basis-full max-sm:ml-9 flex-1 min-w-[8rem] border border-transparent hover:border-gray-200 focus:border-gray-300 rounded px-2 py-1 text-xs text-gray-600"
                      />
                      {onSimulate && selected.kind === 'joueurs' && (
                        <button type="button" onClick={() => onSimulate(item.playerId)} className="text-xs text-emerald-700 hover:underline">Simuler</button>
                      )}
                      <button type="button" onClick={() => handleRemove(item)} className="text-gray-300 hover:text-red-500 text-sm" aria-label="Retirer de la liste">✕</button>
                    </li>
                  ))}
                </ol>
              )}

              {taken.length > 0 && (
                <div className="mb-2">
                  <button type="button" onClick={() => setShowTaken(s => !s)} className="text-xs text-gray-500 hover:text-gray-800">
                    {showTaken ? '▾' : '▸'} Déjà pris ({taken.length})
                  </button>
                  {showTaken && (
                    <ul className="mt-1 space-y-1">
                      {taken.map(item => (
                        <li key={item.itemId} className="flex items-center gap-2 text-xs text-gray-400">
                          <span className="line-through">{item.lastName}, {item.firstName}</span>
                          <span>— pris par {item.takenBy}</span>
                          <button type="button" onClick={() => handleRemove(item)} className="ml-auto hover:text-red-500" aria-label="Retirer de la liste">✕</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {!adding ? (
                <button type="button" onClick={() => setAdding(true)} className="text-sm text-indigo-700 hover:underline">
                  + Ajouter des {selected.kind === 'recrues' ? 'recrues' : 'joueurs'}
                </button>
              ) : (
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Nom (optionnel — ou parcours avec les filtres)…"
                      className="flex-1 min-w-0 border rounded-lg px-3 py-1.5 text-sm"
                      autoFocus
                    />
                    <button type="button" onClick={() => { setAdding(false); resetFilters(); setResults([]) }} className="text-sm text-gray-500 hover:underline">Fermer</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <select value={fPosition} onChange={e => setFPosition(e.target.value as typeof fPosition)} className="border rounded-lg px-2 py-1 text-xs bg-white">
                      <option value="">Toutes positions</option>
                      <option value="forward">Attaquants</option>
                      <option value="defense">Défenseurs</option>
                      <option value="goalie">Gardiens</option>
                    </select>
                    <select value={fTeam} onChange={e => setFTeam(e.target.value)} className="border rounded-lg px-2 py-1 text-xs bg-white max-w-[12rem]">
                      <option value="">Toutes équipes</option>
                      {teams.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
                    </select>
                    {selected.kind === 'joueurs' && (
                      <>
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          value={fMaxSalary}
                          onChange={e => setFMaxSalary(e.target.value)}
                          placeholder="Salaire max (M$)"
                          className="w-36 border rounded-lg px-2 py-1 text-xs"
                        />
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          <input type="checkbox" checked={fElc} onChange={e => setFElc(e.target.checked)} />
                          ELC seulement
                        </label>
                      </>
                    )}
                    <select value={fSort} onChange={e => setFSort(e.target.value as typeof fSort)} className="border rounded-lg px-2 py-1 text-xs bg-white">
                      <option value="">{selected.kind === 'recrues' ? 'Tri : rang de repêchage' : 'Tri : salaire'}</option>
                      {selected.kind === 'recrues' ? <option value="salary">Tri : salaire</option> : <option value="draft">Tri : rang de repêchage</option>}
                      <option value="name">Tri : nom</option>
                      <option value="team">Tri : équipe</option>
                    </select>
                    {hasFilters && (
                      <button type="button" onClick={resetFilters} className="text-xs text-gray-500 hover:underline">Réinitialiser</button>
                    )}
                  </div>
                  {searching && <p className="text-xs text-gray-400">Recherche…</p>}
                  <ul className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                    {shownResults.filter(p => !inList.has(p.id)).map(p => (
                      <li key={p.id} className="py-1.5 flex items-center gap-2 text-sm">
                        <span className="text-gray-800 min-w-0">{p.lastName}, {p.firstName}</span>
                        <span className="text-xs text-gray-500">
                          {[p.position, p.team, p.draftOverall ? `#${p.draftOverall}` : null, fmtCap(p.capNumber)].filter(Boolean).join(' · ')}
                        </span>
                        {p.isElc && <span className="text-[10px] px-1 rounded bg-emerald-50 text-emerald-700">ELC</span>}
                        <button type="button" onClick={() => handleAdd(p)} className="ml-auto shrink-0 text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100">+ Ajouter</button>
                      </li>
                    ))}
                  </ul>
                  {!searching && shownResults.length === 0 && (
                    <p className="text-xs text-gray-400">Aucun joueur disponible trouvé.</p>
                  )}
                  {truncated && (
                    <p className="text-xs text-gray-400 mt-1">Plus de résultats que ce qui est affiché — affine avec un nom, une équipe ou une position.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
