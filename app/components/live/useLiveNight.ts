'use client'

import { useEffect, useState } from 'react'
import type { LiveNight } from '@/lib/liveNight'

const POLL_MS = 60_000
const START_MARGIN_MS = 5 * 60_000

/** Faut-il resonder ? Seulement si un match est en cours, ou si un match pas encore terminé
 * commence dans moins de 5 minutes — jamais en journée ni une fois la soirée terminée. */
function needsPolling(night: LiveNight): boolean {
  if (night.isLive) return true
  const now = Date.now()
  return night.games.some(g =>
    g.state !== 'FINAL' && g.state !== 'OFF' && g.startTimeUTC
    && new Date(g.startTimeUTC).getTime() - START_MARGIN_MS <= now,
  )
}

/**
 * Pointage en direct côté client (David, 2026-10-04) : part des données rendues par le serveur
 * et les met à jour chaque minute pendant les matchs, onglet visible seulement. Interroge
 * `/en-direct/donnees` (JSON, calcul en cache 45 s côté serveur) — jamais un rechargement de la
 * page, qui recalculerait aussi le classement de la saison.
 */
export function useLiveNight(initial: LiveNight): LiveNight {
  const [night, setNight] = useState(initial)

  useEffect(() => {
    let cancelled = false
    let current = initial
    const refresh = async () => {
      if (document.hidden || !needsPolling(current)) return
      try {
        const res = await fetch('/en-direct/donnees', { cache: 'no-store' })
        if (!res.ok) return
        const next = (await res.json()) as LiveNight
        if (cancelled) return
        current = next
        setNight(next)
      } catch { /* réseau : on réessaie au prochain tour */ }
    }
    const id = window.setInterval(refresh, POLL_MS)
    const onVisible = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [initial])

  return night
}

export function fmtLivePts(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

/** « dimanche 4 octobre » */
export function fmtNightDate(date: string): string {
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
    }).format(new Date(`${date}T12:00:00Z`))
  } catch { return date }
}

export function fmtUpdatedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso)).replace(':', ' h ')
  } catch { return '' }
}
