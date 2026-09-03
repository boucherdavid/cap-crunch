'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AutoRefresh({ enabled, intervalMs = 6000 }: { enabled: boolean; intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [enabled, intervalMs, router])

  if (!enabled) return null

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Mise à jour automatique
    </span>
  )
}
