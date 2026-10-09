// Icône et couleur d'accent de chaque famille du menu (David, 2026-10-09) — la même icône sert
// dans la sidebar (Navbar.tsx) et dans l'en-tête des cartes de l'accueil qui s'y rattachent, pour
// qu'on associe d'un coup d'œil une carte à sa section. Ajouter ici toute nouvelle famille.

export type SectionId =
  | 'accueil' | 'mon-equipe' | 'pool' | 'calendrier' | 'statistiques' | 'analytique' | 'blessures'
  | 'contrats' | 'prospects' | 'repechage' | 'communaute' | 'aide' | 'admin' | 'actualite'

// Classes écrites en entier : Tailwind ne détecte pas un nom de classe construit à la volée.
const STYLES: Record<SectionId, { text: string; border: string }> = {
  'accueil':      { text: 'text-slate-300',   border: 'border-slate-300' },
  'mon-equipe':   { text: 'text-violet-400',  border: 'border-violet-400' },
  'pool':         { text: 'text-sky-400',     border: 'border-sky-400' },
  'calendrier':   { text: 'text-green-400', border: 'border-green-400' },
  'statistiques': { text: 'text-cyan-400',    border: 'border-cyan-400' },
  'analytique':   { text: 'text-indigo-400',  border: 'border-indigo-400' },
  'blessures':    { text: 'text-red-500',    border: 'border-red-500' },
  'contrats':     { text: 'text-amber-400',   border: 'border-amber-400' },
  'prospects':    { text: 'text-orange-500',  border: 'border-orange-500' },
  'repechage':    { text: 'text-teal-400',    border: 'border-teal-400' },
  'communaute':   { text: 'text-pink-500',    border: 'border-pink-500' },
  'aide':         { text: 'text-slate-300',   border: 'border-slate-300' },
  'admin':        { text: 'text-gray-400',    border: 'border-gray-400' },
  'actualite':    { text: 'text-slate-400',   border: 'border-slate-400' },
}

// Tracés au trait, grille 24 × 24.
const PATHS: Record<SectionId, string> = {
  'accueil':      'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  'mon-equipe':   'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0',
  'pool':         'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  'calendrier':   'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  'statistiques': 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  'analytique':   'M3 3v18h18M7 15l4-4 3 3 5-6',
  'blessures':    'M12 8v8M8 12h8M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  'contrats':     'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h5',
  'prospects':    'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z',
  'repechage':    'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  'communaute':   'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z',
  'aide':         'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
  'admin':        'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  'actualite':    'M4 4h13v16H6a2 2 0 0 1-2-2V4ZM17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h5',
}

/** Bande de couleur à gauche d'un en-tête de carte. */
export function sectionBorderClass(section: SectionId): string {
  return `border-l-8 ${STYLES[section].border}`
}

export default function SectionIcon({ section, className = 'w-5 h-5' }: { section: SectionId; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${STYLES[section].text} ${className}`}
    >
      <path d={PATHS[section]} />
    </svg>
  )
}
