'use client'

import type { PoolerCapInfo } from './types'

// Extrait de PresaisonManager.tsx (David, 2026-09-08) — réutilisé aussi par le panneau admin
// rétractable de /repechage-agents-libres (AdminPanel.tsx), pour ne pas dupliquer cette
// logique entre les deux pages.
export default function DraftOrderEditor({
  poolers, order, onChange, onSave, saving,
}: {
  poolers: PoolerCapInfo[]
  order: string[]
  onChange: (order: string[]) => void
  onSave: () => void
  saving: boolean
}) {
  const poolerMap = new Map(poolers.map(p => [p.id, p.name]))
  const unordered = poolers.filter(p => !order.includes(p.id))

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-2">
        Le pooler en position 1 signe en premier. L&apos;ordre est séquentiel et cyclique.
      </p>

      {order.map((id, idx) => (
        <div key={id} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded border">
          <span className="text-xs text-gray-400 w-5 text-right font-mono">{idx + 1}</span>
          <span className="flex-1 text-sm text-gray-800">{poolerMap.get(id) ?? id}</span>
          <div className="flex gap-1">
            <button
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-20 px-1 text-xs"
            >▲</button>
            <button
              onClick={() => move(idx, 1)}
              disabled={idx === order.length - 1}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-20 px-1 text-xs"
            >▼</button>
            <button
              onClick={() => onChange(order.filter(x => x !== id))}
              className="text-red-300 hover:text-red-500 px-1 text-xs ml-1"
            >✕</button>
          </div>
        </div>
      ))}

      {unordered.length > 0 && (
        <div className="pt-2 space-y-1">
          <p className="text-xs text-gray-400">Non inclus :</p>
          {unordered.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded border border-dashed">
              <span className="text-sm text-gray-500">{p.name}</span>
              <button
                onClick={() => onChange([...order, p.id])}
                className="text-xs text-blue-600 hover:underline"
              >
                Ajouter
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onSave}
        disabled={saving || order.length === 0}
        className="w-full mt-3 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40"
      >
        {saving ? 'Sauvegarde...' : 'Sauvegarder l\'ordre'}
      </button>
    </div>
  )
}
