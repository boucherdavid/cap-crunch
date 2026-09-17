'use client'

import { useRouter } from 'next/navigation'
import { addMonths, currentMonthET } from '@/lib/dateRanges'

function fmtMonthLabel(month: string): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto', month: 'long', year: 'numeric',
  }).format(new Date(`${month}-15T12:00:00`))
}

export default function MonthNav({ month }: { month: string }) {
  const router = useRouter()
  const prevMonth = addMonths(month, -1)
  const nextMonth = addMonths(month, 1)
  const isCurrent = month >= currentMonthET()

  function navigate(m: string) {
    router.push(`/classement/mensuel?mois=${m}`)
  }

  return (
    <div className="flex items-center justify-between gap-4 bg-white rounded-lg shadow px-4 py-3">
      <button
        type="button"
        onClick={() => navigate(prevMonth)}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
      >
        ← Mois précédent
      </button>
      <span className="font-semibold text-gray-800 capitalize">{fmtMonthLabel(month)}</span>
      {!isCurrent ? (
        <button
          type="button"
          onClick={() => navigate(nextMonth)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          Mois suivant →
        </button>
      ) : (
        <span className="text-sm text-gray-300 px-2 py-1 select-none">Mois suivant →</span>
      )}
    </div>
  )
}
