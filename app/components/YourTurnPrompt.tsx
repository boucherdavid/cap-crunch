'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

function readSeen(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

/**
 * Fenêtre « C'est ton tour ! » (David, 2026-10-01) — affichée une seule fois par tour au pooler
 * concerné, puis plus jamais pour ce tour, même après un rechargement de la page (drapeau dans
 * localStorage, clé = `turnKey`). Se ferme par le bouton, un clic à côté ou Échap.
 *
 * `turnKey` doit identifier le tour : l'id du choix pour le repêchage des recrues. Quand le même
 * pooler peut revenir avec une clé identique (file tournante des agents libres), le parent rend
 * `<YourTurnPromptReset>` pendant que ce n'est pas son tour, ce qui efface le drapeau.
 */
export default function YourTurnPrompt({ turnKey, children }: { turnKey: string; children: React.ReactNode }) {
  const storageKey = `your-turn:${turnKey}`
  // Rendu serveur : « déjà vu », pour ne rien afficher avant de connaître le navigateur.
  const seen = useSyncExternalStore(noopSubscribe, () => readSeen(storageKey), () => true)
  const [closedKey, setClosedKey] = useState<string | null>(null)
  const open = !seen && closedKey !== storageKey

  const close = () => {
    try { localStorage.setItem(storageKey, '1') } catch { /* stockage indisponible : fermé pour cette page seulement */ }
    setClosedKey(storageKey)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      try { localStorage.setItem(storageKey, '1') } catch { /* voir close() */ }
      setClosedKey(storageKey)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, storageKey])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="C'est ton tour">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border-4 border-amber-400 p-6 text-center">
        <p className="text-3xl font-extrabold text-amber-600">C&apos;est ton tour !</p>
        <div className="mt-3 text-gray-700">{children}</div>
        <button
          type="button"
          onClick={close}
          autoFocus
          className="mt-5 w-full rounded-lg bg-amber-500 px-4 py-2.5 text-base font-semibold text-white hover:bg-amber-600"
        >
          Compris
        </button>
      </div>
    </div>
  )
}

/** Efface le drapeau « déjà vu » d'un tour — à rendre pendant que ce n'est PAS le tour du pooler,
 * pour que la fenêtre réapparaisse à son prochain tour même si la clé est identique. */
export function YourTurnPromptReset({ turnKey }: { turnKey: string }) {
  useEffect(() => {
    try { localStorage.removeItem(`your-turn:${turnKey}`) } catch { /* rien à effacer */ }
  }, [turnKey])
  return null
}
