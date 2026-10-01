'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { addWatchlistItemAction, listWatchlistsForPlayerAction, type Watchlist, type WatchlistKind } from '@/app/listes/actions'

/**
 * Bouton « Ajouter à une liste » de la fiche joueur (David, 2026-10-01) — réutilise les actions
 * de « Mes listes ». Ne propose que les listes du bon type (recrues pour un joueur du dernier
 * repêchage LNH, joueurs sinon) ; un joueur déjà pris reste ajoutable (classé « Déjà pris » dans
 * le panneau des listes). Rien d'affiché si personne n'est connecté (listes privées).
 */
export default function AddToWatchlist({ playerId, onNavigate }: { playerId: number; onNavigate: () => void }) {
  const [data, setData] = useState<{ playerId: number; loggedIn: boolean; kind: WatchlistKind; lists: Watchlist[] } | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ playerId: number; text: string; error: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    listWatchlistsForPlayerAction(playerId).then(res => {
      if (!cancelled) setData({ playerId, ...res })
    })
    return () => { cancelled = true }
  }, [playerId])

  const current = data?.playerId === playerId ? data : null
  if (!current?.loggedIn) return null
  const kindLabel = current.kind === 'recrues' ? 'recrues' : 'joueurs'
  const shown = message?.playerId === playerId ? message : null

  const add = async (list: Watchlist) => {
    setBusy(true)
    const res = await addWatchlistItemAction(list.id, playerId)
    setBusy(false)
    setOpen(false)
    setMessage(res.error
      ? { playerId, text: res.error, error: true }
      : { playerId, text: `Ajouté à « ${list.name} »`, error: false })
  }

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        + Ajouter à une liste
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          {current.lists.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-gray-500">
              Tu n&apos;as aucune liste de {kindLabel}.{' '}
              <Link href="/listes" onClick={onNavigate} className="underline hover:text-blue-700">Créer une liste</Link>
            </p>
          ) : (
            <ul>
              {current.lists.map(l => (
                <li key={l.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => add(l)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50 disabled:opacity-50"
                  >
                    <span className="text-gray-800">{l.name}</span>
                    <span className="text-xs text-gray-400">{l.itemCount} joueur{l.itemCount > 1 ? 's' : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {shown && (
        <p className={`mt-2 text-xs ${shown.error ? 'text-red-600' : 'text-green-700'}`}>{shown.text}</p>
      )}
    </div>
  )
}
