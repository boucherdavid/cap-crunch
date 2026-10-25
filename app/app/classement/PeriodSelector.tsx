import Link from 'next/link'

export type ClassementPeriod = 'quotidien' | 'saison' | 'mensuel' | 'hebdomadaire'

const PERIODS: { id: ClassementPeriod; label: string; href: string }[] = [
  { id: 'quotidien', label: 'Quotidien', href: '/classement/quotidien' },
  { id: 'saison', label: 'Saison complète', href: '/classement' },
  { id: 'mensuel', label: 'Mensuel', href: '/classement/mensuel' },
  { id: 'hebdomadaire', label: 'Hebdomadaire', href: '/classement/hebdomadaire' },
]

// Sélecteur de période partagé par les vues du classement (David, 2026-09-30, Quotidien ajouté le
// 2026-10-25) — remplace l'ancien groupe de menu « Classement du pool » ; chaque vue garde sa route.
export default function PeriodSelector({ active }: { active: ClassementPeriod }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-gray-300 text-sm">
      {PERIODS.map((p) => (
        <Link
          key={p.id}
          href={p.href}
          aria-current={p.id === active ? 'page' : undefined}
          className={`px-3 py-1.5 whitespace-nowrap transition-colors ${
            p.id === active ? 'bg-blue-600 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  )
}
