'use client'

import { useRouter } from 'next/navigation'
import { addDaysToDate, getTodayET } from '@/lib/daily-recap'

function fmtDayLabel(day: string): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(`${day}T12:00:00Z`))
}

export default function DayNav({ day }: { day: string }) {
  const router = useRouter()
  const prevDay = addDaysToDate(day, -1)
  const nextDay = addDaysToDate(day, 1)
  // Aujourd'hui reste consultable (points officiels après l'import de nuit), pas au-delà.
  const isLast = day >= getTodayET()

  function navigate(d: string) {
    router.push(`/classement/quotidien?jour=${d}`)
  }

  return (
    <div className="flex items-center justify-between gap-2 bg-white rounded-lg shadow px-2 sm:px-4 py-3">
      <button
        type="button"
        onClick={() => navigate(prevDay)}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
      >
        ← <span className="hidden sm:inline">Jour précédent</span>
      </button>
      <span className="font-semibold text-gray-800 text-center first-letter:uppercase">{fmtDayLabel(day)}</span>
      {!isLast ? (
        <button
          type="button"
          onClick={() => navigate(nextDay)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          <span className="hidden sm:inline">Jour suivant</span> →
        </button>
      ) : (
        <span className="text-sm text-gray-300 px-2 py-1 select-none">
          <span className="hidden sm:inline">Jour suivant</span> →
        </span>
      )}
    </div>
  )
}
