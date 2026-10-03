'use client'

import { useEffect, useRef } from 'react'
import { getPresaisonTurnSignatureAction, getRookieDraftSignatureAction } from './turn-watch-actions'

// Même valeur que dans turn-watch-actions.ts : sépare la partie « majeure » de l'empreinte
// (rechargement complet) de la partie « mineure » (bandeau seulement).
const MINOR_SEPARATOR = '§'
// Rechargements étalés (David, 2026-10-03) : sans délai, tous les poolers rechargeaient la page
// à la même seconde après chaque choix, ce qui ralentissait l'admin pendant le repêchage.
const MAX_RELOAD_JITTER_MS = 4000

/**
 * Surveille l'avancement d'un repêchage sans recharger la page pour rien (David, 2026-10-01) :
 * sonde une courte empreinte de l'état toutes les `intervalMs` et ne recharge que lorsqu'elle
 * change (tour suivant, pause, fin). Complète AutoReload, dont l'intervalle est volontairement
 * long. `enabled=false` : en pause pendant qu'une sélection est en cours sur la page — le
 * changement sera détecté au premier sondage une fois la sélection terminée.
 *
 * Allègement (2026-10-03) : aucun sondage quand l'onglet est caché ; un changement mineur
 * (sélection en attente, chrono) déclenche seulement l'événement `rookie-draft-changed`, que le
 * bandeau du tour écoute pour se mettre à jour sans recharger ; un changement majeur recharge
 * la page après un délai aléatoire de 0 à 4 s.
 */
export default function TurnWatcher({
  kind, saisonId, enabled, intervalMs = 10000,
}: {
  kind: 'agents-libres' | 'recrues'
  saisonId: number
  enabled: boolean
  intervalMs?: number
}) {
  const baseline = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let reloadTimer: number | undefined
    const fetchSignature = kind === 'agents-libres' ? getPresaisonTurnSignatureAction : getRookieDraftSignatureAction
    const split = (sig: string | null) => {
      const [major, minor = ''] = (sig ?? '').split(MINOR_SEPARATOR)
      return { major, minor }
    }
    const check = async () => {
      if (document.hidden || reloadTimer !== undefined) return
      let sig: string | null
      try { sig = await fetchSignature(saisonId) } catch { return }  // réseau : on réessaie au prochain tour
      if (cancelled) return
      if (baseline.current === undefined) { baseline.current = sig; return }
      if (sig === baseline.current) return
      const before = split(baseline.current)
      const after = split(sig)
      if (before.major === after.major) {
        baseline.current = sig
        window.dispatchEvent(new Event('rookie-draft-changed'))
        return
      }
      // Ne pas recharger pendant qu'on écrit dans un champ (recherche, note) — même règle
      // qu'AutoReload ; l'empreinte reste différente, donc on recharge au sondage suivant.
      const el = document.activeElement
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      reloadTimer = window.setTimeout(() => window.location.reload(), Math.random() * MAX_RELOAD_JITTER_MS)
    }
    const onVisible = () => { if (!document.hidden) check() }
    check()
    const id = setInterval(check, intervalMs)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      if (reloadTimer !== undefined) clearTimeout(reloadTimer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [kind, saisonId, enabled, intervalMs])

  return null
}
