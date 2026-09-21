'use client'

import { useState } from 'react'
import type { SimRosterEntry } from './actions'

// Regroupe l'alignement RÉEL (non simulé) par position — pour la colonne "Alignement actuel"
// en lecture seule (David, 2026-09-21), affichée à côté du panneau simulé pour ne plus avoir à
// deviner l'état de départ derrière les lignes biffées.
export function groupRosterEntries(roster: SimRosterEntry[]): { label: string; entries: SimRosterEntry[] }[] {
  const groups: { label: string; match: (e: SimRosterEntry) => boolean }[] = [
    { label: 'Attaquants', match: e => e.player_type === 'actif' && posBucket(e.position) === 'forward' },
    { label: 'Défenseurs', match: e => e.player_type === 'actif' && posBucket(e.position) === 'defense' },
    { label: 'Gardiens', match: e => e.player_type === 'actif' && posBucket(e.position) === 'goalie' },
    { label: 'Réservistes', match: e => e.player_type === 'reserviste' },
    { label: 'LTIR', match: e => e.player_type === 'ltir' },
  ]
  return groups
    .map(g => ({ label: g.label, entries: roster.filter(g.match).sort((a, b) => b.cap_number - a.cap_number) }))
    .filter(g => g.entries.length > 0)
}

export type PlayerType = 'actif' | 'reserviste' | 'ltir'

export type FreeAgent = {
  id: number
  first_name: string
  last_name: string
  position: string | null
  cap_number: number
  playerType: PlayerType
  // Nom du pooler d'origine — soit parce que le joueur était déjà possédé au moment de la
  // recherche (voir searchSimulationPlayersAction), soit parce qu'il arrive d'un envoi depuis
  // l'autre panneau de l'onglet Transaction (David, 2026-09-14 suite). null = agent libre.
  ownerName: string | null
}

export type RecrueOption = { roster_id: number; player_id: number; name: string; position: string | null; cap_number: number }

export type SimEntry = {
  key: string
  playerId: number
  playerName: string
  firstName: string
  lastName: string
  position: string | null
  capNumber: number
  playerType: PlayerType
  removedFlag: boolean
  kind: 'current' | 'recrue' | 'fa'
  ownerName?: string | null
  // Seuls les joueurs déjà réellement dans l'alignement (kind='current') peuvent être "envoyés"
  // à l'autre pooler dans l'onglet Transaction — un agent libre/une recrue tout juste ajoutés
  // en simulation ne sont pas encore "à toi" pour de vrai.
  canSend: boolean
}

export function posBucket(position: string | null): 'forward' | 'defense' | 'goalie' {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

// Regroupe l'alignement courant + les ajouts simulés (recrues activées, joueurs ajoutés) en une
// seule vue par position/réserve/LTIR, selon le statut choisi pour chaque entrée.
export function groupSimEntries(entries: SimEntry[]): { label: string; entries: SimEntry[] }[] {
  const groups: { label: string; match: (e: SimEntry) => boolean }[] = [
    { label: 'Attaquants', match: e => e.playerType === 'actif' && posBucket(e.position) === 'forward' },
    { label: 'Défenseurs', match: e => e.playerType === 'actif' && posBucket(e.position) === 'defense' },
    { label: 'Gardiens', match: e => e.playerType === 'actif' && posBucket(e.position) === 'goalie' },
    { label: 'Réservistes', match: e => e.playerType === 'reserviste' },
    { label: 'LTIR', match: e => e.playerType === 'ltir' },
  ]
  return groups
    .map(g => ({ label: g.label, entries: entries.filter(g.match).sort((a, b) => b.capNumber - a.capNumber) }))
    .filter(g => g.entries.length > 0)
}

// État d'une simulation pour UN pooler (retirer/changer de statut ses joueurs actuels, ajouter
// un agent libre ou une recrue de sa banque) — instancié une fois pour "Mon alignement", deux
// fois (soi + l'autre pooler) pour l'onglet Transaction (David, 2026-09-14 suite). L'envoi d'un
// joueur d'un panneau à l'autre se fait en combinant les actions des deux instances (voir
// SimulationTool.tsx, sendEntry) — pas géré ici, ce hook ne connaît que son propre pooler.
export function useSimState(roster: SimRosterEntry[], recruePlayers: RecrueOption[]) {
  const [removed, setRemoved] = useState<Set<number>>(new Set())
  const [added, setAdded] = useState<FreeAgent[]>([])
  const [addedRecrues, setAddedRecrues] = useState<Map<number, PlayerType>>(new Map())
  const [currentTypeOverrides, setCurrentTypeOverrides] = useState<Map<number, PlayerType>>(new Map())

  const toggleRemove = (playerId: number) => {
    setRemoved(prev => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })
  }
  const setCurrentType = (playerId: number, t: PlayerType) => {
    setCurrentTypeOverrides(prev => { const next = new Map(prev); next.set(playerId, t); return next })
  }
  const addFA = (fa: Omit<FreeAgent, 'playerType'> & { playerType?: PlayerType }) => {
    setAdded(prev => prev.some(a => a.id === fa.id) ? prev : [...prev, { ...fa, playerType: fa.playerType ?? 'actif' }])
  }
  const removeAdded = (id: number) => setAdded(prev => prev.filter(a => a.id !== id))
  const setFAType = (id: number, t: PlayerType) => setAdded(prev => prev.map(a => a.id === id ? { ...a, playerType: t } : a))

  const addRecrue = (playerId: number) => setAddedRecrues(prev => { const next = new Map(prev); next.set(playerId, 'actif'); return next })
  const removeRecrue = (playerId: number) => setAddedRecrues(prev => { const next = new Map(prev); next.delete(playerId); return next })
  const setRecrueType = (playerId: number, t: PlayerType) => setAddedRecrues(prev => { const next = new Map(prev); next.set(playerId, t); return next })

  const reset = () => {
    setRemoved(new Set()); setAdded([]); setAddedRecrues(new Map()); setCurrentTypeOverrides(new Map())
  }

  const restore = (data: {
    removed: number[]
    added: FreeAgent[]
    addedRecrues: { id: number; playerType: PlayerType }[]
    currentTypeOverrides: { playerId: number; playerType: PlayerType }[]
  }) => {
    setRemoved(new Set(data.removed))
    setAdded(data.added)
    setAddedRecrues(new Map(data.addedRecrues.map(r => [r.id, r.playerType])))
    setCurrentTypeOverrides(new Map((data.currentTypeOverrides ?? []).map(o => [o.playerId, o.playerType])))
  }

  const current: SimEntry[] = roster.map(e => ({
    key: `cur-${e.player_id}`, playerId: e.player_id, playerName: e.playerName,
    firstName: e.firstName, lastName: e.lastName,
    position: e.position, capNumber: e.cap_number,
    playerType: currentTypeOverrides.get(e.player_id)
      ?? (e.player_type === 'reserviste' ? 'reserviste' : e.player_type === 'ltir' ? 'ltir' : 'actif'),
    removedFlag: removed.has(e.player_id), kind: 'current', canSend: true,
  }))
  const recrue: SimEntry[] = recruePlayers
    .filter(r => addedRecrues.has(r.player_id))
    .map(r => {
      const [lastName, firstName] = r.name.split(', ')
      return {
        key: `rec-${r.player_id}`, playerId: r.player_id, playerName: r.name,
        firstName: firstName ?? '', lastName: lastName ?? r.name,
        position: r.position, capNumber: r.cap_number,
        playerType: addedRecrues.get(r.player_id)!, removedFlag: false, kind: 'recrue' as const, canSend: false,
      }
    })
  const fa: SimEntry[] = added.map(a => ({
    key: `fa-${a.id}`, playerId: a.id, playerName: `${a.last_name}, ${a.first_name}`,
    firstName: a.first_name, lastName: a.last_name,
    position: a.position, capNumber: a.cap_number ?? 0,
    playerType: a.playerType, removedFlag: false, kind: 'fa' as const, ownerName: a.ownerName, canSend: false,
  }))

  const entries = [...current, ...recrue, ...fa]
  const activeEntries = entries.filter(e => !e.removedFlag)
  const capUsed = activeEntries.filter(e => e.playerType !== 'ltir').reduce((s, e) => s + e.capNumber, 0)
  const counts = {
    forward: activeEntries.filter(e => e.playerType === 'actif' && posBucket(e.position) === 'forward').length,
    defense: activeEntries.filter(e => e.playerType === 'actif' && posBucket(e.position) === 'defense').length,
    goalie: activeEntries.filter(e => e.playerType === 'actif' && posBucket(e.position) === 'goalie').length,
    reserviste: activeEntries.filter(e => e.playerType === 'reserviste').length,
    ltir: activeEntries.filter(e => e.playerType === 'ltir').length,
  }
  const touched = removed.size > 0 || added.length > 0 || addedRecrues.size > 0 || currentTypeOverrides.size > 0

  return {
    entries, counts, capUsed, touched,
    removed, added, addedRecrues,
    toggleRemove, setCurrentType, addFA, removeAdded, setFAType, addRecrue, removeRecrue, setRecrueType, reset, restore,
  }
}

export type SimState = ReturnType<typeof useSimState>
