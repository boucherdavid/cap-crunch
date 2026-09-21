'use client'

import { useRouter } from 'next/navigation'
import { addWeeks, currentMondayET } from '@/lib/dateRanges'
import { addDaysToDate } from '@/lib/daily-recap'

function fmtWeekLabel(monday: string): string {
  const sunday = addDaysToDate(monday, 6)
  const fmt = (d: string) => new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto', day: 'numeric', month: 'short',
  }).format(new Date(d + 'T12:00:00'))
  return `${fmt(monday)} – ${fmt(sunday)}`
}

export default function WeekNav({ monday }: { monday: string }) {
  const router = useRouter()
  const prevMonday = addWeeks(monday, -1)
  const nextMonday = addWeeks(monday, 1)
  const isCurrent = monday >= currentMondayET()

  function navigate(m: string) {
    router.push(`/classement/hebdomadaire?semaine=${m}`)
  }

  return (
    <div className="flex items-center justify-between gap-4 bg-white rounded-lg shadow px-4 py-3">
      <button
        type="button"
        onClick={() => navigate(prevMonday)}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
      >
        ← Semaine précédente
      </button>
      <span className="font-semibold text-gray-800">{fmtWeekLabel(monday)}</span>
      {!isCurrent ? (
        <button
          type="button"
          onClick={() => navigate(nextMonday)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          Semaine suivante →
        </button>
      ) : (
        <span className="text-sm text-gray-300 px-2 py-1 select-none">Semaine suivante →</span>
      )}
    </div>
  )
}
