'use client'

import { useRouter } from 'next/navigation'

// Sélecteur de pooler de /poolers/[id] — conserve l'onglet ouvert (?onglet=) quand on change de
// pooler, plutôt que de revenir à Alignement (David, 2026-09-27).
export default function PoolerSwitcher({
  poolers,
  currentId,
}: {
  poolers: { id: string; name: string }[]
  currentId: string
}) {
  const router = useRouter()

  return (
    <label className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
      <span className="text-sm font-medium text-blue-800 whitespace-nowrap">Voir l&apos;alignement de</span>
      <select
        value={currentId}
        onChange={e => router.push(`/poolers/${e.target.value}${window.location.search}`)}
        className="text-base font-semibold border border-blue-300 rounded-md px-3 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        {poolers.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </label>
  )
}
