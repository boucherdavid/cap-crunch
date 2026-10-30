'use client'

/**
 * Sondage qui ne tourne que si l'onglet est visible (David, 2026-10-30 — alerte Vercel : 90 % du
 * CPU gratuit du mois consommé, surtout par des onglets oubliés ouverts qui relançaient un calcul
 * serveur chaque minute, jour et nuit). Onglet caché : rien. Retour sur l'onglet : relecture
 * immédiate si la dernière date de plus d'un intervalle. Retourne la fonction de nettoyage.
 */
export function startVisiblePolling(load: () => void, intervalMs: number): () => void {
  let last = Date.now()
  const run = () => { last = Date.now(); load() }
  const id = window.setInterval(() => { if (!document.hidden) run() }, intervalMs)
  const onVisible = () => { if (!document.hidden && Date.now() - last >= intervalMs) run() }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    window.clearInterval(id)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
