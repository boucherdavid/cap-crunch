'use client'

import { useEffect } from 'react'

// Bouton de rafraîchissement manuel ajouté (David, 2026-09-10) — le rechargement automatique,
// même espacé, reste un compromis (clignotement, perte d'interactions non protégées) ; plutôt
// que de forcer un intervalle très court pour que tout le monde voie les changements vite,
// on allonge l'intervalle et on donne un moyen simple de rafraîchir à la demande (pas tout le
// monde ne pense à Ctrl+Maj+R).
export default function AutoReload({ enabled, intervalMs = 10000 }: { enabled: boolean; intervalMs?: number }) {
  useEffect(() => {
    if (!enabled) return
    // router.refresh() (rafraîchissement RSC "doux") s'est avéré peu fiable ici — un
    // rechargement complet reproduit exactement ce qu'un F5 manuel fait déjà, dont on sait
    // qu'il fonctionne.
    const id = setInterval(() => window.location.reload(), intervalMs)
    return () => clearInterval(id)
  }, [enabled, intervalMs])

  return (
    <span className="inline-flex items-center gap-3 text-xs text-gray-400">
      {enabled && (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Mise à jour automatique
        </span>
      )}
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
        title="Rafraîchir la page maintenant"
      >
        ↻ Rafraîchir
      </button>
    </span>
  )
}
