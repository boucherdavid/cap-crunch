'use client'

import { useEffect } from 'react'

export default function AutoReload({ enabled, intervalMs = 10000 }: { enabled: boolean; intervalMs?: number }) {
  useEffect(() => {
    if (!enabled) return
    // router.refresh() (rafraîchissement RSC "doux") s'est avéré peu fiable ici — un
    // rechargement complet reproduit exactement ce qu'un F5 manuel fait déjà, dont on sait
    // qu'il fonctionne.
    const id = setInterval(() => window.location.reload(), intervalMs)
    return () => clearInterval(id)
  }, [enabled, intervalMs])

  if (!enabled) return null

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Mise à jour automatique
    </span>
  )
}
