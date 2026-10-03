'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { PoolerTodo } from './pooler-todo-actions'

/** Pastilles des choses à faire : bleu = échanges, orange = ballotage (David, 2026-10-03). */
export function TodoPills({ todo, compact = false }: { todo: PoolerTodo; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {todo.trades > 0 && (
        <span className="min-w-5 h-5 px-1.5 rounded-full bg-blue-500 text-white text-xs font-bold inline-flex items-center justify-center" title={`${todo.trades} échange${todo.trades > 1 ? 's' : ''} à traiter`}>
          {compact ? todo.trades : `Échanges ${todo.trades}`}
        </span>
      )}
      {todo.waivers > 0 && (
        <span className="min-w-5 h-5 px-1.5 rounded-full bg-orange-500 text-white text-xs font-bold inline-flex items-center justify-center" title={`${todo.waivers} ballotage${todo.waivers > 1 ? 's' : ''} à traiter`}>
          {compact ? todo.waivers : `Ballotage ${todo.waivers}`}
        </span>
      )}
    </span>
  )
}

/**
 * Indicateur de la barre du haut (David, 2026-10-03) : n'apparaît que s'il y a quelque chose à
 * faire ; au clic, un menu mène directement au bon onglet de Gestion d'effectifs.
 */
export default function PoolerTodoIndicator({ todo }: { todo: PoolerTodo }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (todo.trades === 0 && todo.waivers === 0) return null
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-pool-navy-light"
        title="Choses à faire"
      >
        <span className="hidden lg:inline">
          <TodoPills todo={todo} />
        </span>
        <span className="lg:hidden">
          <TodoPills todo={todo} compact />
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 rounded-lg bg-white shadow-xl border border-gray-200 z-50 overflow-hidden">
          <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 border-b">À faire</p>
          {todo.trades > 0 && (
            <Link href="/gestion-effectifs?tab=echanges" onClick={() => setOpen(false)} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-gray-800 hover:bg-blue-50">
              <span>Échange{todo.trades > 1 ? 's' : ''} à traiter</span>
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-blue-500 text-white text-xs font-bold inline-flex items-center justify-center">{todo.trades}</span>
            </Link>
          )}
          {todo.waivers > 0 && (
            <Link href="/gestion-effectifs?tab=ballotage" onClick={() => setOpen(false)} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-gray-800 hover:bg-orange-50">
              <span>Ballotage{todo.waivers > 1 ? 's' : ''} à traiter</span>
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-orange-500 text-white text-xs font-bold inline-flex items-center justify-center">{todo.waivers}</span>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
