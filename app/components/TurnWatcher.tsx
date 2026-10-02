'use client'

import { useEffect, useRef } from 'react'
import { getPresaisonTurnSignatureAction, getRookieDraftSignatureAction } from './turn-watch-actions'

/**
 * Surveille l'avancement d'un repêchage sans recharger la page pour rien (David, 2026-10-01) :
 * sonde une courte empreinte de l'état toutes les `intervalMs` et ne recharge que lorsqu'elle
 * change (tour suivant, pause, fin). Complète AutoReload, dont l'intervalle est volontairement
 * long. `enabled=false` : en pause pendant qu'une sélection est en cours sur la page — le
 * changement sera détecté au premier sondage une fois la sélection terminée.
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
    const fetchSignature = kind === 'agents-libres' ? getPresaisonTurnSignatureAction : getRookieDraftSignatureAction
    const check = async () => {
      let sig: string | null
      try { sig = await fetchSignature(saisonId) } catch { return }  // réseau : on réessaie au prochain tour
      if (cancelled) return
      if (baseline.current === undefined) { baseline.current = sig; return }
      if (sig === baseline.current) return
      // Ne pas recharger pendant qu'on écrit dans un champ (recherche, note) — même règle
      // qu'AutoReload ; l'empreinte reste différente, donc on recharge au sondage suivant.
      const el = document.activeElement
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      window.location.reload()
    }
    check()
    const id = setInterval(check, intervalMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [kind, saisonId, enabled, intervalMs])

  return null
}
