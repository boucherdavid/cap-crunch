'use client'

import { useEffect, useState } from 'react'
import { getPoolerTodoAction, type PoolerTodo } from './pooler-todo-actions'

const SEEN_KEY = 'ballotage-vu-le'
const REFRESH_EVENT = 'pooler-todo-refresh'
const REFRESH_MS = 60_000
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

/** Compteurs « à faire » du pooler connecté (David, 2026-10-03), relus chaque minute et à chaque
 * `refreshPoolerTodo()`. `enabled=false` (personne de connecté) : toujours zéro. */
export function usePoolerTodo(enabled: boolean): PoolerTodo {
  const [todo, setTodo] = useState<PoolerTodo>(EMPTY)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = () => getPoolerTodoAction(readSeen())
      .then(t => { if (!cancelled) setTodo(t) })
      .catch(() => { /* réseau ou mise à jour de l'app : on réessaiera au prochain tour */ })
    load()
    const id = setInterval(load, REFRESH_MS)
    window.addEventListener(REFRESH_EVENT, load)
    return () => { cancelled = true; clearInterval(id); window.removeEventListener(REFRESH_EVENT, load) }
  }, [enabled])
  return enabled ? todo : EMPTY
}
