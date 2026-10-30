'use client'

import { useSyncExternalStore } from 'react'
import { getPoolerTodoAction, type PoolerTodo } from './pooler-todo-actions'
import { startVisiblePolling } from './visiblePolling'

const SEEN_KEY = 'ballotage-vu-le'
const REFRESH_EVENT = 'pooler-todo-refresh'
// 5 minutes, onglet visible seulement (2026-10-30 — CPU Vercel) : les actions du pooler
// rafraîchissent déjà le compteur sur-le-champ (refreshPoolerTodo), et les push avisent du reste.
const REFRESH_MS = 5 * 60_000
const EMPTY: PoolerTodo = { trades: 0, waivers: 0, total: 0, items: [] }

function readSeen(): string | null {
  try { return localStorage.getItem(SEEN_KEY) } catch { return null }
}

/** À appeler à l'ouverture de l'onglet Ballotage : les joueurs déjà au ballotage ne comptent plus
 * comme « nouveaux » (voir getPoolerTodoAction). */
export function markBallotageSeen() {
  try { localStorage.setItem(SEEN_KEY, new Date().toISOString()) } catch { /* stockage indisponible */ }
  refreshPoolerTodo()
}

/** Demande à tous les indicateurs de la page de se mettre à jour (après une action du pooler). */
export function refreshPoolerTodo() {
  window.dispatchEvent(new Event(REFRESH_EVENT))
}

/** Compteurs « à faire » du pooler connecté (David, 2026-10-03), relus aux 5 minutes (onglet
 * visible) et à chaque `refreshPoolerTodo()`. Un seul sondage partagé par tous les composants qui
 * s'en servent (barre du haut, Gestion d'effectifs). `enabled=false` (personne de connecté) :
 * toujours zéro. */
let shared: PoolerTodo = EMPTY
const listeners = new Set<() => void>()
let stopPolling: (() => void) | null = null

function loadShared() {
  getPoolerTodoAction(readSeen())
    .then(t => { shared = t; listeners.forEach(l => l()) })
    .catch(() => { /* réseau ou mise à jour de l'app : on réessaiera au prochain tour */ })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    loadShared()
    const stopInterval = startVisiblePolling(loadShared, REFRESH_MS)
    window.addEventListener(REFRESH_EVENT, loadShared)
    stopPolling = () => { stopInterval(); window.removeEventListener(REFRESH_EVENT, loadShared) }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && stopPolling) { stopPolling(); stopPolling = null }
  }
}

const noSubscribe = () => () => {}
const getShared = () => shared
const getEmpty = () => EMPTY

export function usePoolerTodo(enabled: boolean): PoolerTodo {
  return useSyncExternalStore(enabled ? subscribe : noSubscribe, enabled ? getShared : getEmpty, getEmpty)
}
