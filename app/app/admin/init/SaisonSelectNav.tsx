'use client'

import { useRouter } from 'next/navigation'

type Saison = { id: number; season: string }

export function SaisonSelectNav({
  saisons,
  selectedId,
  baseHref,
}: {
  saisons: Saison[]
  selectedId: number
  baseHref: string
}) {
  const router = useRouter()
  return (
    <select
      value={selectedId}
      onChange={e => router.push(`${baseHref}${baseHref.includes('?') ? '&' : '?'}saisonId=${e.target.value}`)}
      className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    >
      {saisons.map(s => (
        <option key={s.id} value={s.id}>{s.season}</option>
      ))}
    </select>
  )
}
