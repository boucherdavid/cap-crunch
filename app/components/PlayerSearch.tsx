'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { searchPlayersGlobalAction, type PlayerSearchResult } from './player-search-actions'

/**
 * Recherche globale d'un joueur (David, 2026-10-01) — barre du haut, disponible sur toutes les
 * pages. Un résultat ouvre la fiche (`PlayerSlideOver`) : `?joueur=<nhl_id>` pour un joueur LNH,
 * `?fiche=<id interne>` pour un prospect sans nhl_id.
 */
export default function PlayerSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerSearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const request = ++requestRef.current
    const timer = setTimeout(async () => {
      const data = await searchPlayersGlobalAction(q)
      if (request !== requestRef.current) return  // une frappe plus récente a pris le relais
      setResults(data)
      setHighlight(0)
      setLoading(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const onChange = (value: string) => {
    setQuery(value)
    setOpen(true)
    if (value.trim().length < 2) { setResults(null); setLoading(false) } else setLoading(true)
  }

  const select = (r: PlayerSearchResult) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('joueur')
    params.delete('fiche')
    if (r.nhlId) params.set('joueur', String(r.nhlId))
    else params.set('fiche', String(r.id))
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
    setOpen(false)
    setQuery('')
    setResults(null)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!results?.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % results.length) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + results.length) % results.length) }
    if (e.key === 'Enter') { e.preventDefault(); select(results[highlight]) }
  }

  const showPanel = open && query.trim().length >= 2

  return (
    <div ref={boxRef} className="relative flex-1 max-w-md mx-3">
      <input
        type="search"
        value={query}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Chercher un joueur"
        aria-label="Chercher un joueur"
        className="w-full rounded-lg bg-white/10 text-white placeholder-white/60 text-sm px-3 py-1.5 border border-white/20 focus:outline-none focus:bg-white focus:text-gray-900 focus:placeholder-gray-400"
      />
      {showPanel && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50">
          {loading && <p className="px-3 py-2.5 text-sm text-gray-400">Recherche…</p>}
          {!loading && results?.length === 0 && <p className="px-3 py-2.5 text-sm text-gray-400">Aucun joueur trouvé</p>}
          {!loading && results && results.length > 0 && (
            <ul>
              {results.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => select(r)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm ${i === highlight ? 'bg-blue-50' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-gray-800">{r.name}</span>
                      <span className="ml-1.5 text-xs text-gray-400">{[r.teamCode, r.position].filter(Boolean).join(' · ')}</span>
                    </span>
                    {r.ownerName
                      ? <span className="shrink-0 text-xs text-gray-500">{r.ownerName}</span>
                      : <span className="shrink-0 inline-flex items-center gap-1 text-xs text-green-600 font-medium"><span className="inline-block w-2 h-2 rounded-full bg-green-500" />Disponible</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
