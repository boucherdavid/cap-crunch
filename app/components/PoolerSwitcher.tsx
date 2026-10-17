'use client'

import { useRouter } from 'next/navigation'

// Sélecteur de pooler de /poolers/[id] — conserve l'onglet ouvert (?onglet=) quand on change de
// pooler, plutôt que de revenir à Alignement (David, 2026-09-27). Depuis le 2026-10-17, il sert
// aussi de titre à la page (plus de <h1> avec le nom du pooler) : d'où sa grande taille.
export default function PoolerSwitcher({
  poolers,
  currentId,
}: {
  poolers: { id: string; name: string }[]
  currentId: string
}) {
  const router = useRouter()

  return (
    <label className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-sm font-medium text-gray-500 whitespace-nowrap">Alignement de</span>
      <select
        value={currentId}
        onChange={e => router.push(`/poolers/${e.target.value}${window.location.search}`)}
        className="text-xl sm:text-2xl font-bold border border-blue-300 rounded-lg pl-3 pr-8 py-1.5 bg-blue-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        {poolers.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </label>
  )
}
