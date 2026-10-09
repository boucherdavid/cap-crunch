'use client'

import { Children, useState, type ReactNode } from 'react'

// Carte repliée par défaut sur téléphone seulement (David, 2026-10-09) : l'accueil mobile ne
// garde ouvert que l'essentiel, le reste s'ouvre d'un toucher. À partir de `sm`, la carte est
// toujours ouverte et le bouton disparaît. Premier enfant = en-tête, les suivants = contenu.
export default function MobileFold({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [header, ...body] = Children.toArray(children)
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* L'en-tête réserve la place du bouton à droite pour ne pas le chevaucher. */}
      <div className="relative max-sm:[&>div]:pr-12">
        {header}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label={open ? 'Replier' : 'Déplier'}
          className="sm:hidden absolute inset-y-0 right-0 w-12 flex items-center justify-center text-slate-200"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
            className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      <div className={open ? '' : 'hidden sm:block'}>{body}</div>
    </div>
  )
}
