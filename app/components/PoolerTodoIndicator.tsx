'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PoolerTodo } from './pooler-todo-actions'

/** Pastilles des choses à faire : bleu = échanges, orange = ballotage (David, 2026-10-03). */
export function TodoPills({ todo, compact = false }: { todo: Pick<PoolerTodo, 'trades' | 'waivers'>; compact?: boolean }) {
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
 * Bouton « À faire » de la barre du haut + panneau latéral (David, 2026-10-05) — pendant, côté
 * pooler, du bouton « Approbations » de l'admin (`AdminApprovalsPanel`). Toujours visible ; le
 * compteur rouge ne compte que ce qui attend une action du pooler. Chaque élément mène à la page
 * où agir. Remplace l'ancien indicateur à pastilles, qui n'apparaissait que pour les échanges et
 * le ballotage.
 */
export default function PoolerTodoIndicator({ todo }: { todo: PoolerTodo }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const count = todo.total
  const summary = count > 0 ? `${count} chose${count > 1 ? 's' : ''} à faire` : 'Rien à faire pour le moment'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={summary}
        className={`relative flex items-center gap-1.5 rounded px-2 py-1 text-sm border transition-colors ${
          count > 0 ? 'border-amber-400 text-white bg-amber-500/20 hover:bg-amber-500/30' : 'border-pool-silver/50 text-pool-silver hover:text-white'
        }`}
      >
        <span className="hidden lg:inline">À faire</span>
        <span className="lg:hidden" aria-hidden="true">🔔</span>
        {count > 0 && (
          <span className="min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">{count}</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-gray-50 shadow-xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-white shrink-0">
              <div>
                <p className="font-bold text-gray-900 text-lg leading-tight">À faire</p>
                <p className="text-sm text-gray-500">{summary}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="Fermer">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {todo.items.length === 0 && (
                <p className="text-sm text-gray-400">Tout est à jour : aucun échange, ballotage ou retour de LTIR ne t&apos;attend.</p>
              )}
              {todo.items.map(item => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block bg-white rounded-lg border p-4 transition-colors hover:bg-gray-50 ${
                    item.urgent ? 'border-red-300' : item.info ? 'border-gray-200' : 'border-amber-200'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                  <p className={`text-sm mt-0.5 ${item.urgent ? 'text-red-700 font-medium' : 'text-gray-600'}`}>{item.detail}</p>
                  {!item.info && <p className="text-sm text-blue-600 mt-2">Y aller →</p>}
                </Link>
              ))}
              <p className="text-xs text-gray-400 pt-2">
                Cette liste montre ce qui t&apos;attend en ce moment ; elle se met à jour toute seule dès que c&apos;est réglé.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  )
}
