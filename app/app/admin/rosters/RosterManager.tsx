'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { submitRosterAction, adminInitRosterAction, updateRookieTypeAction, viderRostersAction } from './actions'
import TeamBadge from '@/components/TeamBadge'
import { normalizeSearch } from '@/lib/normalizeSearch'

type Pooler = { id: string; name: string }
type Player = {
  id: number
  first_name: string
  last_name: string
  position: string | null
  status: string | null
  is_available: boolean
  is_rookie: boolean
  draft_year: number | null
  draft_round: number | null
  draft_overall: number | null
  teams: { code: string } | null
  player_contracts: { season: string; cap_number: number }[]
}
type Saison = { id: number; season: string; pool_cap: number; nhl_cap: number }
type RosterEntry = {
  id: number
  player_id: number
  player_type: string
  rookie_type?: 'repeche' | 'agent_libre' | null
  pool_draft_year?: number | null
  players: Player
}
type NormalizedRosterEntry = Omit<RosterEntry, 'player_type'> & {
  player_type: 'actif' | 'recrue' | 'reserviste' | 'ltir'
}

type PlayerBucket = 'forward' | 'defense' | 'goalie'

const DASH = '\u2014'
const STAR = '\u2605'
const CROSS = '\u2715'
const ACTIVE_LIMITS: Record<PlayerBucket, number> = {
  forward: 12,
  defense: 6,
  goalie: 2,
}

const PLAYER_TYPES = [
  { value: 'actif', label: 'Actif' },
  { value: 'reserviste', label: 'Reserviste' },
  { value: 'ltir', label: 'LTIR' },
  { value: 'recrue', label: 'Banque recrues' },
] as const

const formatCap = (amount: number | null) => {
  if (!amount) return DASH
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

const normalizePlayerType = (playerType: string): 'actif' | 'recrue' | 'reserviste' | 'ltir' => {
  if (playerType === 'agent_libre') return 'reserviste'
  if (playerType === 'recrue') return 'recrue'
  if (playerType === 'reserviste') return 'reserviste'
  if (playerType === 'ltir') return 'ltir'
  return 'actif'
}

const normalizeRosterEntries = (entries: RosterEntry[] | null | undefined): NormalizedRosterEntry[] => {
  return (entries ?? []).map((entry) => ({
    ...entry,
    player_type: normalizePlayerType(entry.player_type),
  }))
}

const sortPlayersByTeamAndName = (a: Player, b: Player) => {
  const teamCompare = (a.teams?.code ?? 'ZZZ').localeCompare(b.teams?.code ?? 'ZZZ', 'fr-CA')
  if (teamCompare !== 0) return teamCompare
  const lastNameCompare = a.last_name.localeCompare(b.last_name, 'fr-CA')
  if (lastNameCompare !== 0) return lastNameCompare
  return a.first_name.localeCompare(b.first_name, 'fr-CA')
}

const getPlayerBucket = (position: string | null): PlayerBucket => {
  const normalizedPosition = (position ?? '').toUpperCase()
  if (normalizedPosition.includes('G')) return 'goalie'
  if (normalizedPosition.includes('D')) return 'defense'
  return 'forward'
}


const getCurrentCap = (player: Player | undefined, season: string | undefined) => {
  if (!player || !season) return 0
  return player.player_contracts?.find((contract) => contract.season === season)?.cap_number ?? 0
}

export default function RosterManager({ poolers, players, saison, allTakenPlayerIds, playerOwnerMap }: {
  poolers: Pooler[]
  players: Player[]
  saison: Saison | null
  allTakenPlayerIds: number[]
  playerOwnerMap: Record<number, string>
}) {
  const supabase = createClient()
  const router = useRouter()
  const tempIdCounter = useRef(-1)

  const [selectedPooler, setSelectedPooler] = useState<string>(poolers[0]?.id ?? '')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [roster, setRoster] = useState<NormalizedRosterEntry[]>([])
  const [originalRoster, setOriginalRoster] = useState<NormalizedRosterEntry[]>([])
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  // Démarre activé : cette page ne sert qu'à saisir les rosters de départ d'une saison,
  // et l'état étant local au navigateur (pas persisté), il se réinitialise à chaque
  // rechargement — une saisie multi-poolers étalée dans le temps oubliait facilement de
  // le réactiver, produisant des lignes datées de la saisie au lieu du début de saison et
  // du bruit dans roster_change_log (bug trouvé par David le 2026-08-11, 328/330 lignes
  // pooler_rosters mal datées en staging).
  const [initMode, setInitMode] = useState(true)

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage(text)
    setMessageType(type)
    setTimeout(() => setMessage(''), 4000)
  }

  const applyRoster = (data: RosterEntry[] | null) => {
    const normalized = normalizeRosterEntries(data)
    setRoster(normalized)
    setOriginalRoster(normalized)
  }

  useEffect(() => {
    if (!selectedPooler || !saison) return
    const fetchRoster = async () => {
      const { data } = await supabase
        .from('pooler_rosters')
        .select('id, player_id, player_type, rookie_type, pool_draft_year, players(id, first_name, last_name, position, status, is_rookie, draft_year, draft_round, draft_overall, teams(code), player_contracts(season, cap_number))')
        .eq('pooler_id', selectedPooler)
        .eq('pool_season_id', saison.id)
        .eq('is_active', true)
      applyRoster(data as RosterEntry[] | null)
    }
    fetchRoster()
  }, [selectedPooler, saison])

  const isDirty = useMemo(() => {
    if (roster.length !== originalRoster.length) return true
    const origMap = new Map(originalRoster.map(r => [r.id, r.player_type]))
    return roster.some(r => r.id < 0 || origMap.get(r.id) !== r.player_type)
  }, [roster, originalRoster])

  const rosterPlayerIds = useMemo(() => new Set(roster.map((r) => r.player_id)), [roster])

  // IDs pris par les AUTRES poolers (exclut le roster courant en état serveur pour permettre le re-ajout en brouillon)
  const otherPoolersTakenIds = useMemo(() => {
    const currentServerIds = new Set(originalRoster.map((r) => r.player_id))
    return new Set(allTakenPlayerIds.filter((id) => !currentServerIds.has(id)))
  }, [allTakenPlayerIds, originalRoster])

  const teamOptions = useMemo(() => {
    const uniqueTeams = Array.from(new Set(
      players.map((player) => player.teams?.code ?? '').filter((teamCode) => teamCode !== ''),
    ))
    return uniqueTeams.sort((a, b) => a.localeCompare(b, 'fr-CA'))
  }, [players])

  const filteredPlayers = useMemo(() => {
    const normalizedSearch = normalizeSearch(search.trim())
    return players
      .filter((player) => {
        if (rosterPlayerIds.has(player.id)) return false
        // En mode init : montrer aussi les joueurs appartenant aux autres poolers
        if (!initMode && otherPoolersTakenIds.has(player.id)) return false
        const teamCode = player.teams?.code ?? ''
        if (selectedTeam !== '' && teamCode !== selectedTeam) return false
        if (normalizedSearch === '') return selectedTeam !== ''
        const fullName = normalizeSearch(`${player.first_name} ${player.last_name}`)
        const reverseName = normalizeSearch(`${player.last_name} ${player.first_name}`)
        const position = normalizeSearch(player.position ?? '')
        return fullName.includes(normalizedSearch) || reverseName.includes(normalizedSearch) || position.includes(normalizedSearch)
      })
      .sort(sortPlayersByTeamAndName)
  }, [players, rosterPlayerIds, otherPoolersTakenIds, search, selectedTeam, initMode])

  const actifs = useMemo(() => roster.filter((r) => r.player_type === 'actif'), [roster])
  const reservistes = useMemo(() => roster.filter((r) => r.player_type === 'reserviste'), [roster])

  const activeCounts = useMemo(() => {
    return actifs.reduce(
      (counts, entry) => {
        const bucket = getPlayerBucket(entry.players?.position ?? null)
        counts[bucket] += 1
        return counts
      },
      { forward: 0, defense: 0, goalie: 0 } as Record<PlayerBucket, number>,
    )
  }, [actifs])

  const capUtilise = useMemo(() => {
    return roster
      .filter((r) => r.player_type === 'actif' || r.player_type === 'reserviste')
      .reduce((sum, entry) => sum + getCurrentCap(entry.players, saison?.season), 0)
  }, [roster, saison])

  const conformite = useMemo(() => {
    const issues: string[] = []
    if (activeCounts.forward !== ACTIVE_LIMITS.forward)
      issues.push(`Attaquants actifs : ${activeCounts.forward} / ${ACTIVE_LIMITS.forward}`)
    if (activeCounts.defense !== ACTIVE_LIMITS.defense)
      issues.push(`Défenseurs actifs : ${activeCounts.defense} / ${ACTIVE_LIMITS.defense}`)
    if (activeCounts.goalie !== ACTIVE_LIMITS.goalie)
      issues.push(`Gardiens actifs : ${activeCounts.goalie} / ${ACTIVE_LIMITS.goalie}`)
    if (reservistes.length < 2)
      issues.push(`Réservistes insuffisants : ${reservistes.length} / 2 minimum`)
    if (saison && capUtilise > saison.pool_cap)
      issues.push(`Cap dépassé : ${formatCap(capUtilise)} / ${formatCap(saison.pool_cap)}`)
    return issues
  }, [activeCounts, reservistes, capUtilise, saison])

  // --- Actions locales (pas de BD) ---

  const addPlayer = (player: Player, playerType: 'actif' | 'recrue' | 'reserviste') => {
    if (rosterPlayerIds.has(player.id)) return
    setSearch('')
    if (playerType === 'recrue' && !initMode) {
      const saisonFin = saison ? parseInt(saison.season.split('-')[0], 10) + 1 : new Date().getFullYear()
      const draftYearCutoff = saisonFin - 5
      const isEligible = player.is_rookie || (player.draft_year != null && player.draft_year >= draftYearCutoff)
      if (!isEligible) {
        showMessage('Seuls les joueurs recrues peuvent aller dans la banque de recrues.', 'error')
        return
      }
    }
    const tempId = tempIdCounter.current--
    // Auto-détection du type recrue selon la présence d'un draft_year
    const rookieType: 'repeche' | 'agent_libre' | null = player.is_rookie
      ? (player.draft_year ? 'repeche' : 'agent_libre')
      : null
    const newEntry: NormalizedRosterEntry = {
      id: tempId,
      player_id: player.id,
      player_type: playerType,
      rookie_type: rookieType,
      pool_draft_year: player.is_rookie && player.draft_year ? player.draft_year : null,
      players: player,
    }
    setRoster(prev => [...prev, newEntry])
  }

  const changeRookieType = (entry: NormalizedRosterEntry, newRookieType: 'repeche' | 'agent_libre') => {
    // pool_draft_year = toujours players.draft_year (année NHL réelle, non modifiable)
    const poolDraftYear = newRookieType === 'repeche' ? (entry.players.draft_year ?? null) : null
    setRoster(prev => prev.map(r => r.id === entry.id
      ? { ...r, rookie_type: newRookieType, pool_draft_year: poolDraftYear }
      : r
    ))
    // Persistance immédiate pour les entrées existantes (id > 0)
    if (entry.id > 0) {
      updateRookieTypeAction(entry.id, newRookieType, poolDraftYear ?? undefined).then((res) => {
        if (res.error) showMessage(res.error, 'error')
        else showMessage('Type de recrue sauvegardé.', 'success')
      })
    }
  }

  const removePlayer = (rosterId: number) => {
    setRoster(prev => prev.filter(r => r.id !== rosterId))
  }

  const changeType = (entry: NormalizedRosterEntry, newType: 'actif' | 'recrue' | 'reserviste' | 'ltir') => {
    if (newType === 'recrue') {
      const saisonFin = saison ? parseInt(saison.season.split('-')[0], 10) + 1 : new Date().getFullYear()
      const draftYearCutoff = saisonFin - 5
      const isEligible = entry.players.is_rookie || (entry.players.draft_year != null && entry.players.draft_year >= draftYearCutoff)
      if (!isEligible) {
        showMessage('Seuls les joueurs recrues peuvent aller dans la banque de recrues.', 'error')
        return
      }
    }
    setRoster(prev => prev.map(r => r.id === entry.id ? { ...r, player_type: newType } : r))
  }

  const handleCancel = () => {
    setRoster(originalRoster)
  }

  const handleViderTous = async () => {
    if (!saison) return
    if (!window.confirm(`Supprimer TOUS les rosters de la saison ${saison.season} ? Cette action est irréversible.`)) return
    setSubmitting(true)
    const result = await viderRostersAction(saison.id)
    setSubmitting(false)
    if (result.error) {
      showMessage(result.error, 'error')
    } else {
      applyRoster([])
      showMessage(`${result.deleted ?? 0} entrées supprimées.`, 'success')
      router.refresh()
    }
  }

  const handleSubmit = async () => {
    if (!saison || !isDirty) return
    setSubmitting(true)

    const currentIds = new Set(roster.map(r => r.id))

    const toAdd = roster
      .filter(r => r.id < 0)
      .map(r => ({
        player_id: r.player_id,
        player_type: r.player_type,
        rookie_type: r.rookie_type ?? undefined,
        pool_draft_year: r.pool_draft_year ?? undefined,
      }))

    const toRemove = originalRoster
      .filter(r => !currentIds.has(r.id))
      .map(r => r.id)

    const toChangeType = roster
      .filter(r => r.id > 0)
      .flatMap(r => {
        const orig = originalRoster.find(o => o.id === r.id)
        return orig && orig.player_type !== r.player_type ? [{ entryId: r.id, newType: r.player_type }] : []
      })

    const action = initMode ? adminInitRosterAction : submitRosterAction
    const result = await action(selectedPooler, saison.id, toAdd, toRemove, toChangeType)

    if (result.error) {
      showMessage(result.error, 'error')
    } else {
      // Recharger depuis la BD pour avoir les vrais IDs
      const { data, error: fetchErr } = await supabase
        .from('pooler_rosters')
        .select('id, player_id, player_type, rookie_type, pool_draft_year, players(id, first_name, last_name, position, status, is_rookie, draft_year, draft_round, draft_overall, teams(code), player_contracts(season, cap_number))')
        .eq('pooler_id', selectedPooler)
        .eq('pool_season_id', saison.id)
        .eq('is_active', true)
      if (!fetchErr && data && data.length > 0) {
        applyRoster(data as unknown as RosterEntry[])
      } else {
        // Le fetch client a échoué ou retourné vide — on garde l'état local soumis
        setOriginalRoster(roster)
      }
      // allTakenPlayerIds/playerOwnerMap viennent des props serveur (calculées une seule
      // fois au chargement de la page) — sans ce refresh, elles restent figées après un
      // submit et affichent un ancien propriétaire dans "Joueurs disponibles" une fois
      // qu'on change de pooler.
      router.refresh()
      showMessage('Alignement sauvegardé.', 'success')
    }

    setSubmitting(false)
  }

  const handlePoolerChange = (newPoolerId: string) => {
    if (isDirty && !window.confirm('Des modifications non soumises seront perdues. Continuer ?')) return
    setSelectedPooler(newPoolerId)
  }

  const capPct = saison ? (capUtilise / saison.pool_cap) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Barre du haut */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-4 flex-wrap">
        <label className="text-sm font-medium text-gray-700">Pooler:</label>
        <select
          value={selectedPooler}
          onChange={(e) => handlePoolerChange(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {poolers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {isDirty && (
          <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded">
            Modifications non soumises
          </span>
        )}

        {message && (
          <span className={`text-sm font-medium ${messageType === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setInitMode(m => !m)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              initMode
                ? 'bg-orange-100 border-orange-400 text-orange-700 hover:bg-orange-200'
                : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'
            }`}
          >
            {initMode ? '⚙ Mode init ON' : '⚙ Mode init'}
          </button>
          {isDirty && (
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Annuler
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!isDirty || submitting}
            className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Soumission...' : 'Soumettre'}
          </button>
        </div>
      </div>

      {/* Bannière mode init */}
      {initMode && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg px-4 py-3 text-sm text-orange-800 flex items-start justify-between gap-4">
          <span>
            <span className="font-semibold">Mode init actif</span> — Aucune validation (limites de positions, réservistes, recrues). Les joueurs appartenant à un autre pooler sont affichés et seront automatiquement retirés de leur roster actuel lors de la soumission. Pas de snapshots NHL ni de notifications.
          </span>
          <button
            onClick={handleViderTous}
            disabled={submitting}
            className="shrink-0 text-xs px-3 py-1.5 rounded border border-red-400 text-red-600 bg-white hover:bg-red-50 font-medium disabled:opacity-40"
          >
            Vider tous les rosters
          </button>
        </div>
      )}

      {/* Cap et conformité */}
      {saison && (
        <div className="bg-white rounded-lg shadow p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-gray-700">Masse salariale</span>
            <span>
              <span className={capPct > 100 ? 'text-red-600 font-bold' : 'text-gray-800 font-semibold'}>{formatCap(capUtilise)}</span>
              <span className="text-gray-400"> / {formatCap(saison.pool_cap)}</span>
              <span className="text-gray-400 ml-2">{`${DASH} Dispo: `}<span className={capUtilise > saison.pool_cap ? 'text-red-600' : 'text-green-600'}>{formatCap(saison.pool_cap - capUtilise)}</span></span>
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full ${capPct > 100 ? 'bg-red-500' : capPct > 90 ? 'bg-orange-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(capPct, 100)}%` }}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Actifs: {actifs.length} / 20</div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Attaquants: {activeCounts.forward} / 12</div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Defenseurs: {activeCounts.defense} / 6</div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Gardiens: {activeCounts.goalie} / 2</div>
          </div>
          <p className="text-xs text-gray-500">La banque de recrues ne compte pas dans la masse salariale. Les joueurs actifs et reservistes comptent toujours dans la masse salariale, meme s'ils sont recrues. Les joueurs LTIR ne comptent pas dans la masse salariale.</p>
          {conformite.length === 0 ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <span className="text-green-500 font-bold">✓</span> Alignement conforme
            </div>
          ) : (
            <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-orange-700 mb-1">Alignement non conforme :</p>
              <ul className="space-y-0.5">
                {conformite.map((issue, i) => (
                  <li key={i} className="text-xs text-orange-600 flex items-center gap-1">
                    <span>⚠</span> {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alignement courant */}
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="font-semibold text-gray-700 mb-4">{`Alignement ${DASH} ${roster.length} joueur(s)`}</h2>
          {PLAYER_TYPES.map(({ value, label }) => {
            const group = roster.filter((r) => r.player_type === value)
            if (group.length === 0) return null

            const POSITION_GROUPS: { bucket: PlayerBucket; label: string }[] = [
              { bucket: 'forward', label: 'Attaquants' },
              { bucket: 'defense', label: 'Défenseurs' },
              { bucket: 'goalie', label: 'Gardiens' },
            ]

            const sortedByCap = (entries: NormalizedRosterEntry[]) =>
              [...entries].sort((a, b) => getCurrentCap(b.players, saison?.season) - getCurrentCap(a.players, saison?.season))

            type Row =
              | { type: 'subheader'; bucket: PlayerBucket; subLabel: string }
              | { type: 'entry'; entry: NormalizedRosterEntry }

            const rows: Row[] = value === 'actif'
              ? POSITION_GROUPS.flatMap(({ bucket, label: subLabel }) => {
                  const sub = sortedByCap(group.filter((r) => getPlayerBucket(r.players?.position ?? null) === bucket))
                  if (sub.length === 0) return []
                  return [
                    { type: 'subheader' as const, bucket, subLabel },
                    ...sub.map((entry) => ({ type: 'entry' as const, entry })),
                  ]
                })
              : [...group]
                  .sort((a, b) => {
                    if (a.player_type === 'recrue' && b.player_type === 'recrue') {
                      const yearDiff = (a.pool_draft_year ?? 9999) - (b.pool_draft_year ?? 9999)
                      if (yearDiff !== 0) return yearDiff
                      return (a.players?.last_name ?? '').localeCompare(b.players?.last_name ?? '', 'fr-CA')
                        || (a.players?.first_name ?? '').localeCompare(b.players?.first_name ?? '', 'fr-CA')
                    }
                    return 0
                  })
                  .map((entry) => ({ type: 'entry' as const, entry }))

            return (
              <div key={value} className="mb-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{label}</h3>
                <div className="space-y-1">
                  {rows.map((row) => {
                    if (row.type === 'subheader') {
                      return (
                        <p key={`sub-${row.bucket}`} className="text-xs text-gray-400 pl-1 pt-1 pb-0.5 italic">
                          {row.subLabel}
                        </p>
                      )
                    }
                    const { entry } = row
                    const isTemp = entry.id < 0
                    const contractCap = entry.player_type === 'recrue' ? null : getCurrentCap(entry.players, saison?.season)
                    const isRookie = entry.players?.is_rookie
                    return (
                      <div
                        key={entry.id}
                        className={`py-1.5 px-3 rounded-lg hover:bg-gray-50 group ${isTemp ? 'border-l-2 border-blue-300' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm">
                            <TeamBadge code={entry.players?.teams?.code} size="sm" />
                            <span className="text-gray-300">|</span>
                            <span className="font-medium text-gray-800">
                              {isRookie && <span className="text-yellow-500 mr-1">{STAR}</span>}
                              {entry.players?.last_name}, {entry.players?.first_name}
                            </span>
                            <span className="text-gray-400">{entry.players?.position}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">{formatCap(contractCap)}</span>
                            <select
                              value={entry.player_type}
                              onChange={(e) => changeType(entry, e.target.value as 'actif' | 'recrue' | 'reserviste' | 'ltir')}
                              className="text-xs border rounded px-1 py-0.5 text-gray-500"
                            >
                              {PLAYER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                            </select>
                            <button
                              onClick={() => removePlayer(entry.id)}
                              className="text-red-400 hover:text-red-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              {CROSS}
                            </button>
                          </div>
                        </div>
                        {isRookie && (
                          <div className="flex items-center gap-2 mt-0.5 pl-9">
                            <select
                              value={entry.rookie_type ?? ''}
                              onChange={(e) => {
                                if (e.target.value) changeRookieType(entry, e.target.value as 'repeche' | 'agent_libre')
                              }}
                              className={`text-xs border rounded px-1 py-0.5 ${
                                entry.rookie_type === 'repeche' ? 'text-purple-700 bg-purple-50 border-purple-200'
                                : entry.rookie_type === 'agent_libre' ? 'text-blue-700 bg-blue-50 border-blue-200'
                                : 'text-orange-600 bg-orange-50 border-orange-200'
                              }`}
                            >
                              {!entry.rookie_type && <option value="">— type recrue requis —</option>}
                              <option value="repeche">Repêché</option>
                              <option value="agent_libre">Agent libre</option>
                            </select>
                            {entry.rookie_type === 'repeche' && entry.players.draft_year && (
                              <span className="text-xs text-purple-500">
                                {`Repêché ${entry.players.draft_year} — protection jusqu'en ${entry.players.draft_year + 5}`}
                              </span>
                            )}
                            {entry.rookie_type === 'agent_libre' && (
                              <span className="text-xs text-blue-500">Protection ELC seulement</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {roster.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-4">{`Alignement vide ${DASH} ajoutez des joueurs depuis la liste`}</p>
          )}
        </div>

        {/* Joueurs disponibles — remonté en premier quand la fenêtre est trop étroite pour
            afficher les 2 colonnes côte à côte (sous lg), pour éviter de devoir défiler
            jusqu'en bas à chaque ajout de joueur pendant l'initialisation. */}
        <div className="order-first lg:order-none bg-white rounded-lg shadow p-5">
          <h2 className="font-semibold text-gray-700 mb-4">
            {initMode ? 'Tous les joueurs' : 'Joueurs disponibles'}
          </h2>
          <div className="flex gap-2 mb-4">
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-32 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Equipe</option>
              {teamOptions.map((teamCode) => (
                <option key={teamCode} value={teamCode}>{teamCode}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Rechercher un joueur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
            {filteredPlayers.map((player) => {
              const contract = getCurrentCap(player, saison?.season)
              const rookieBankDisabled = !player.is_rookie && !initMode
              const ownerName = initMode ? (playerOwnerMap[player.id] ?? null) : null
              return (
                <div key={player.id} className={`flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 group ${ownerName ? 'bg-orange-50/50' : ''}`}>
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    <TeamBadge code={player.teams?.code} size="sm" />
                    <span className="font-medium text-gray-800 truncate">
                      {player.is_rookie && <span className="text-yellow-500 mr-1">{STAR}</span>}
                      {player.last_name}, {player.first_name}
                    </span>
                    <span className="text-gray-400 text-xs whitespace-nowrap">{player.position ?? DASH}</span>
                    {player.status && <span className="text-xs text-gray-400 whitespace-nowrap">{player.status}</span>}
                    {ownerName && (
                      <span className="text-xs text-orange-600 whitespace-nowrap font-medium">({ownerName})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-gray-500 mr-1">{formatCap(contract)}</span>
                    <button
                      onClick={() => addPlayer(player, 'actif')}
                      title="Ajouter comme Actif"
                      className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Act
                    </button>
                    <button
                      onClick={() => addPlayer(player, 'recrue')}
                      disabled={rookieBankDisabled}
                      title={rookieBankDisabled ? 'Reserve aux joueurs recrues' : 'Ajouter a la banque de recrues'}
                      className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                    >
                      Banq
                    </button>
                    <button
                      onClick={() => addPlayer(player, 'reserviste')}
                      title="Ajouter comme Reserviste"
                      className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Res
                    </button>
                  </div>
                </div>
              )
            })}
            {filteredPlayers.length === 0 && search.trim() === '' && selectedTeam === '' && (
              <p className="text-gray-400 text-sm text-center py-4">Choisissez une equipe ou commencez a taper un nom.</p>
            )}
            {filteredPlayers.length === 0 && !(search.trim() === '' && selectedTeam === '') && (
              <p className="text-gray-400 text-sm text-center py-4">Aucun joueur disponible</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
