'use client'

import { useRouter } from 'next/navigation'

export default function TeamSelect({ teams, selected }: { teams: { code: string; name: string }[]; selected: string }) {
  const router = useRouter()
  return (
    <select
      value={selected}
      onChange={e => router.push(`/analytique/trios?equipe=${e.target.value}`)}
      aria-label="Équipe"
      className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {teams.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
    </select>
  )
}
