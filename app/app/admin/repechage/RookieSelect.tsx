'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { normalizeSearch } from '@/lib/normalizeSearch'

const DASH = '—'

export type RookieOption = {
  id: number
  first_name: string
  last_name: string
  position: string | null
  teams: { code: string } | null
  draft_round: number | null
  draft_overall: number | null
}

function formatLabel(r: RookieOption) {
  const draftInfo = `R${r.draft_round ?? '?'} #${r.draft_overall ?? '?'}`
  return `${r.last_name}, ${r.first_name} ${r.position ?? ''} ${r.teams?.code ?? DASH} — ${draftInfo}`
}

export default function RookieSelect({
  rookies,
  value,
  onChange,
  excludeIds,
}: {
  rookies: RookieOption[]
  value: number | null
  onChange: (id: number | null) => void
  excludeIds: Set<number>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [coords, setCoords] = useState<{ inputTop: number; inputBottom: number; left: number; width: number; openUp: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selected = rookies.find(r => r.id === value) ?? null

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      const inInput = inputRef.current?.contains(target) ?? false
      const inDropdown = dropdownRef.current?.contains(target) ?? false
      if (!inInput && !inDropdown) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    const updateCoords = () => {
      if (!inputRef.current) return
      const rect = inputRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      // Près du bas de la fenêtre (dernier pick d'une ronde) : pas assez de place pour
      // ouvrir vers le bas sans chevaucher le contenu qui suit — on ouvre vers le haut.
      const openUp = spaceBelow < 260 && spaceAbove > spaceBelow
      setCoords({ inputTop: rect.top, inputBottom: rect.bottom, left: rect.left, width: rect.width, openUp })
    }
    updateCoords()
    window.addEventListener('scroll', updateCoords, true)
    window.addEventListener('resize', updateCoords)
    return () => {
      window.removeEventListener('scroll', updateCoords, true)
      window.removeEventListener('resize', updateCoords)
    }
  }, [open])

  const available = rookies.filter(r => r.id === value || !excludeIds.has(r.id))
  const filtered = query
    ? available.filter(r => normalizeSearch(`${r.last_name} ${r.first_name}`).includes(normalizeSearch(query)))
    : available

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={open ? query : (selected ? formatLabel(selected) : '')}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => setQuery(e.target.value)}
        placeholder="— Choisir une recrue —"
        className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
      />
      {open && coords && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            left: coords.left,
            width: coords.width,
            maxHeight: Math.max(120, Math.min(
              256,
              coords.openUp ? coords.inputTop - 8 : window.innerHeight - coords.inputBottom - 8,
            )),
            ...(coords.openUp
              ? { bottom: window.innerHeight - coords.inputTop + 4 }
              : { top: coords.inputBottom + 4 }),
          }}
          className="z-50 overflow-y-auto bg-white border rounded-lg shadow-lg"
        >
          <div
            className="px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50 cursor-pointer"
            onClick={() => { onChange(null); setOpen(false); setQuery('') }}
          >
            — Choisir une recrue —
          </div>
          {filtered.map(r => (
            <div
              key={r.id}
              className={`px-3 py-1.5 text-sm hover:bg-blue-50 cursor-pointer ${r.id === value ? 'bg-blue-100 font-medium text-gray-800' : 'text-gray-700'}`}
              onClick={() => { onChange(r.id); setOpen(false); setQuery('') }}
            >
              {formatLabel(r)}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-1.5 text-sm text-gray-400">Aucun résultat</div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
