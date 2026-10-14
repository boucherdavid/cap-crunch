'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizeSearch } from '@/lib/normalizeSearch'
import { addPlayerAction, removePlayerAction, updateRookieTypeAction } from '../rosters/actions'
import { submitTransactionAction } from '../transactions/actions'
import { isRookieProtected, lastProtectedSeason } from '@/lib/rookieProtection'

const DASH = '\u2014'
const CROSS = '\u2715'


type Pooler = { id: string; name: string }
type Rookie = {
  id: number
  first_name: string
  last_name: string
  position: string | null
  status: string | null
  draft_year: number | null
  draft_round: number | null
  draft_overall: number | null
  teams: { code: string } | null
  player_contracts?: { season: string; is_elc: boolean | null }[] | null
}
type BankEntry = {
  id: number
  player_id: number
  rookie_type: 'repeche' | 'agent_libre' | null
  pool_draft_year: number | null
  players: Rookie
  player_type?: string
  pooler_id?: string
}
type Saison = { id: number; season: string }
type PrevTag = { rookie_type: 'repeche' | 'agent_libre'; pool_draft_year: number | null }
type Hint = { text: string; review: boolean }

// Vue « Tous les poolers » du sélecteur (révision des étiquettes seulement).
const ALL_POOLERS = '__all__'

const TAG_LABEL = (t: PrevTag) => t.rookie_type === 'repeche' ? `Repêché du pool ${t.pool_draft_year ?? ''}`.trim() : 'Agent libre (ELC)'

/**
 * Indice pour retrouver un joueur protégé sans étiquette (David, 2026-10-14) — seulement pour un
 * joueur sans étiquette : étiquette de la saison passée (à vérifier si elle le protégerait encore),
 * sinon repêché par la LNH dans les 5 dernières années (candidat possible du repêchage du pool).
 */
function computeHint(entry: BankEntry, prevTag: PrevTag | undefined, prevSeason: string, season: string): Hint | null {
  if (entry.rookie_type) return null
  if (prevTag) {
    const stillProtected = isRookieProtected(prevTag.rookie_type, prevTag.pool_draft_year, entry.players.player_contracts, season)
    return {
      text: `Étiqueté en ${prevSeason} : ${TAG_LABEL(prevTag)} — ${stillProtected ? 'le protégerait encore, à vérifier' : 'protection terminée'}`,
      review: stillProtected,
    }
  }
  const startYear = parseInt(season.slice(0, 4), 10)
  const nhlYear = entry.players.draft_year
  if (nhlYear && nhlYear >= startYear - 4) {
    return { text: `Repêché par la LNH en ${nhlYear}, sans étiquette — à vérifier`, review: true }
  }
  return null
}
type RookieCategory = 'repeche' | 'agent_libre'

// Règle unique de la banque de recrues (lib/rookieProtection.ts).
const isEntryProtected = (entry: BankEntry, season: string): boolean =>
  isRookieProtected(entry.rookie_type, entry.pool_draft_year, entry.players.player_contracts, season)

const PLAYER_TYPE_LABEL: Record<string, string> = { actif: 'Actif', reserviste: 'Réserviste', ltir: 'LTIR' }

/** « Protégé jusqu'en 2030-31 », « Protégé (ELC) » ou « Non protégé ». */
function ProtectionStatus({ entry, season }: { entry: BankEntry; season: string }) {
  if (!isEntryProtected(entry, season)) {
    return <span className="text-xs text-gray-400 shrink-0">Non protégé</span>
  }
  const until = lastProtectedSeason(entry.rookie_type, entry.pool_draft_year)
  return (
    <span className="text-xs text-emerald-700 shrink-0">
      {until ? `Protégé jusqu'en ${until}` : 'Protégé (ELC)'}
    </span>
  )
}

const sortRookies = (a: Rookie, b: Rookie) => {
  const yearDiff = (a.draft_year ?? 9999) - (b.draft_year ?? 9999)
  if (yearDiff !== 0) return yearDiff
  return (a.last_name ?? '').localeCompare(b.last_name ?? '', 'fr-CA')
    || (a.first_name ?? '').localeCompare(b.first_name ?? '', 'fr-CA')
}

const draftLabel = (r: Rookie) => {
  if (!r.draft_year) return null
  const parts = [String(r.draft_year)]
  if (r.draft_round) parts.push(`R${r.draft_round}`)
  if (r.draft_overall) parts.push(`#${r.draft_overall}`)
  return parts.join(' ')
}

const PENCIL = '\u270e'

function BankRow({ entry, season, poolerName, hint, onRemove, onEdit, onActivate, onRelease, loading, expired = false }: {
  entry: BankEntry
  season: string
  poolerName?: string
  hint?: Hint | null
  onRemove?: (id: number) => void
  onEdit: () => void
  onActivate?: () => void
  onRelease?: () => void
  loading: boolean
  expired?: boolean
}) {
  const typeLabel = entry.rookie_type === 'repeche'
    ? <span className="inline-block bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5 text-xs font-medium" title="Année de repêchage dans le pool — détermine la fin de protection (+5 saisons)">
        Repêché du pool {entry.pool_draft_year ?? ''}
      </span>
    : entry.rookie_type === 'agent_libre'
      ? <span className="inline-block bg-amber-50 text-amber-600 rounded px-1.5 py-0.5 text-xs font-medium" title="Protégé tant que le contrat LNH réel est un ELC">Agent libre (ELC)</span>
      : <span className="inline-block bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 text-xs font-medium" title="Jamais étiqueté : traité comme un agent libre (protégé tant que son contrat est un ELC). Clique sur ✎ pour corriger">
          Sans étiquette
        </span>

  return (
    <div className="py-1.5 px-3 rounded-lg hover:bg-gray-50 group">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm min-w-0">
        {poolerName && <span className="text-xs font-medium text-gray-600 w-24 truncate shrink-0">{poolerName}</span>}
        <span className="text-gray-400 w-8 text-center text-xs shrink-0">
          {entry.players.teams?.code ?? DASH}
        </span>
        <span className={`font-medium truncate ${expired ? 'text-red-700' : 'text-gray-800'}`}>
          {entry.players.last_name}, {entry.players.first_name}
        </span>
        <span className="text-gray-400 text-xs shrink-0">{entry.players.position ?? DASH}</span>
        {entry.player_type && (
          <span className="text-gray-500 text-xs shrink-0">
            {PLAYER_TYPE_LABEL[entry.player_type] ?? entry.player_type}
          </span>
        )}
        {typeLabel}
        <ProtectionStatus entry={entry} season={season} />
        {draftLabel(entry.players) && (
          <span className="text-gray-400 text-xs shrink-0" title="Vrai repêchage LNH (indépendant du type de protection dans le pool)">
            LNH {draftLabel(entry.players)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 ml-2 shrink-0">
        {expired && onActivate && (
          <button onClick={onActivate} disabled={loading}
            className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-xs font-medium disabled:opacity-30 px-2 py-1 rounded whitespace-nowrap">
            Activer
          </button>
        )}
        {expired && onRelease && (
          <button onClick={onRelease} disabled={loading}
            className="text-red-700 bg-red-50 hover:bg-red-100 text-xs font-medium disabled:opacity-30 px-2 py-1 rounded whitespace-nowrap">
            Libérer
          </button>
        )}
        <div className={`flex gap-1 transition-opacity ${expired || !onRemove ? '' : 'opacity-0 group-hover:opacity-100'}`}>
          <button onClick={onEdit} disabled={loading}
            className="text-blue-400 hover:text-blue-600 text-xs disabled:opacity-30"
            title="Modifier le type">
            {PENCIL}
          </button>
          {!expired && onRemove && (
            <button onClick={() => onRemove(entry.id)} disabled={loading}
              className="text-red-400 hover:text-red-600 text-xs disabled:opacity-30">
              {CROSS}
            </button>
          )}
        </div>
      </div>
    </div>
    {hint && (
      <p className={`text-xs mt-0.5 ${poolerName ? 'pl-36' : 'pl-10'} ${hint.review ? 'text-amber-700' : 'text-gray-400'}`}>
        {hint.text}
      </p>
    )}
    </div>
  )
}

function ActivatePanel({ rookie, onConfirm, onCancel, loading }: {
  rookie: Rookie
  onConfirm: (type: 'actif' | 'reserviste') => void
  onCancel: () => void
  loading: boolean
}) {
  const [type, setType] = useState<'actif' | 'reserviste'>('actif')

  return (
    <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
      <p className="font-medium text-gray-700 mb-1">
        Activer {rookie.last_name}, {rookie.first_name}
      </p>
      <p className="text-xs text-gray-500 mb-2">
        Protection expirée — cette activation est permanente, le joueur ne pourra plus revenir dans la banque.
      </p>
      <div className="flex gap-3 mb-3">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="activateType" value="actif"
            checked={type === 'actif'} onChange={() => setType('actif')} />
          <span>Actif</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="activateType" value="reserviste"
            checked={type === 'reserviste'} onChange={() => setType('reserviste')} />
          <span>Réserviste</span>
        </label>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(type)}
          disabled={loading}
          className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded hover:bg-emerald-700 disabled:opacity-50"
        >
          Confirmer
        </button>
        <button
          onClick={onCancel}
          className="text-gray-500 text-xs px-3 py-1.5 rounded hover:bg-gray-100"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

function TypePanel({ rookie, initialType, initialYear, defaultYear, onConfirm, onCancel, loading }: {
  rookie: Rookie
  initialType?: RookieCategory
  initialYear?: number | null
  defaultYear: number
  onConfirm: (type: RookieCategory, poolDraftYear: number | null) => void
  onCancel: () => void
  loading: boolean
}) {
  // « Agent libre » par défaut (David, 2026-10-07) : seul le repêchage des recrues du pool pose
  // « repêché » ; ici, c'est un choix délibéré de l'admin.
  const [type, setType] = useState<RookieCategory>(initialType ?? 'agent_libre')
  // Année du repêchage des recrues DU POOL, jamais celle de la LNH (David, 2026-10-14).
  const [year, setYear] = useState<number>(initialYear ?? defaultYear)
  const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100

  return (
    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
      <p className="font-medium text-gray-700 mb-2">
        {rookie.last_name}, {rookie.first_name} — type de protection
      </p>
      <div className="flex gap-3 mb-3">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="type" value="repeche"
            checked={type === 'repeche'} onChange={() => setType('repeche')} />
          <span>Repêché du pool</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="type" value="agent_libre"
            checked={type === 'agent_libre'} onChange={() => setType('agent_libre')} />
          <span>Agent libre (ELC)</span>
        </label>
      </div>
      {type === 'repeche' && (
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-gray-600" htmlFor={`pool-year-${rookie.id}`}>Repêché par le pool en</label>
          <input
            id={`pool-year-${rookie.id}`}
            type="number"
            min={2000}
            max={2100}
            value={Number.isNaN(year) ? '' : year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="w-20 border rounded px-2 py-1 text-sm"
          />
          {validYear && (
            <span className="text-gray-400 text-xs">
              {`protégé jusqu'en ${lastProtectedSeason('repeche', year)}`}
            </span>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(type, type === 'repeche' ? year : null)}
          disabled={loading || (type === 'repeche' && !validYear)}
          className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded hover:bg-emerald-700 disabled:opacity-50"
        >
          Confirmer
        </button>
        <button
          onClick={onCancel}
          className="text-gray-500 text-xs px-3 py-1.5 rounded hover:bg-gray-100"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

export default function BanqueRecruesManager({
  poolers,
  rookies,
  saison,
}: {
  poolers: Pooler[]
  rookies: Rookie[]
  saison: Saison | null
}) {
  const supabase = createClient()
  const [selectedPooler, setSelectedPooler] = useState(poolers[0]?.id ?? '')
  const [bank, setBank] = useState<BankEntry[]>([])
  // Tous les actifs, réservistes et LTIR du pooler (David, 2026-10-14) : pour corriger leur
  // étiquette rétroactivement, jamais ajoutés/retirés d'ici.
  const [protectedActives, setProtectedActives] = useState<BankEntry[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  // Révision des étiquettes (David, 2026-10-14) : étiquettes de la saison passée, filtre, vue globale.
  const [prevTags, setPrevTags] = useState<Map<number, PrevTag>>(new Map())
  const [reviewOnly, setReviewOnly] = useState(false)
  const [allEntries, setAllEntries] = useState<BankEntry[]>([])
  const isAll = selectedPooler === ALL_POOLERS
  const [allTakenIds, setAllTakenIds] = useState<Set<number>>(new Set())
  const [selectedTeam, setSelectedTeam] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingRookie, setPendingRookie] = useState<Rookie | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null)
  const [activatingEntryId, setActivatingEntryId] = useState<number | null>(null)

  const season = saison?.season ?? ''
  // Année du repêchage des recrues du pool pour cette saison (2026-27 → 2026).
  const currentDraftYear = parseInt(season.slice(0, 4), 10) || new Date().getFullYear()
  const prevSeason = season ? `${currentDraftYear - 1}-${String(currentDraftYear).slice(2)}` : ''
  const poolerNames = useMemo(() => new Map(poolers.map((p) => [p.id, p.name])), [poolers])
  const hintFor = (entry: BankEntry) => computeHint(entry, prevTags.get(entry.player_id), prevSeason, season)

  // Charger tous les IDs de recrues prises (tous poolers) pour éviter doublons
  useEffect(() => {
    if (!saison) return
    supabase
      .from('pooler_rosters')
      .select('player_id')
      .eq('pool_season_id', saison.id)
      .eq('player_type', 'recrue')
      .eq('is_active', true)
      .then(({ data }) => setAllTakenIds(new Set((data ?? []).map((r) => r.player_id))))
  }, [saison, supabase])

  // Étiquettes de la saison passée, pour l'indice de révision.
  useEffect(() => {
    if (!prevSeason) return
    const load = async () => {
      const { data: prev } = await supabase
        .from('pool_seasons').select('id').eq('season', prevSeason).eq('is_playoff', false).maybeSingle()
      if (!prev) { setPrevTags(new Map()); return }
      const { data } = await supabase
        .from('pooler_rosters')
        .select('player_id, rookie_type, pool_draft_year')
        .eq('pool_season_id', prev.id)
        .not('rookie_type', 'is', null)
      setPrevTags(new Map((data ?? []).map((r) => [r.player_id as number, r as unknown as PrevTag])))
    }
    load()
  }, [prevSeason, supabase])

  // Vue « Tous les poolers » : tous les joueurs des alignements, banque comprise.
  useEffect(() => {
    if (!isAll || !saison) return
    const load = async () => {
      const { data } = await supabase
        .from('pooler_rosters')
        .select('id, player_id, pooler_id, player_type, rookie_type, pool_draft_year, players(id, first_name, last_name, position, status, draft_year, draft_round, draft_overall, teams(code), player_contracts(season, is_elc))')
        .eq('pool_season_id', saison.id)
        .in('player_type', ['actif', 'reserviste', 'ltir', 'recrue'])
        .eq('is_active', true)
      setAllEntries((data ?? []) as unknown as BankEntry[])
    }
    load()
  }, [isAll, saison, supabase, reloadKey])

  useEffect(() => {
    if (!selectedPooler || !saison || isAll) return
    setPendingRookie(null)

    const fetchBank = async () => {
      const { data } = await supabase
        .from('pooler_rosters')
        .select('id, player_id, rookie_type, pool_draft_year, players(id, first_name, last_name, position, status, draft_year, draft_round, draft_overall, teams(code), player_contracts(season, is_elc))')
        .eq('pooler_id', selectedPooler)
        .eq('pool_season_id', saison.id)
        .eq('player_type', 'recrue')
        .eq('is_active', true)

      setBank((data ?? []) as unknown as BankEntry[])

      const { data: actives } = await supabase
        .from('pooler_rosters')
        .select('id, player_id, player_type, rookie_type, pool_draft_year, players(id, first_name, last_name, position, status, draft_year, draft_round, draft_overall, teams(code), player_contracts(season, is_elc))')
        .eq('pooler_id', selectedPooler)
        .eq('pool_season_id', saison.id)
        .in('player_type', ['actif', 'reserviste', 'ltir'])
        .eq('is_active', true)

      setProtectedActives((actives ?? []) as unknown as BankEntry[])
    }

    fetchBank()
  }, [selectedPooler, saison, supabase, reloadKey, isAll])

  const teamOptions = useMemo(() =>
    Array.from(new Set(rookies.map((r) => r.teams?.code ?? '').filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'fr-CA')),
    [rookies],
  )

  const availableRookies = useMemo(() => {
    const s = normalizeSearch(search.trim())
    return rookies
      .filter((r) => !allTakenIds.has(r.id))
      .filter((r) => {
        if (selectedTeam && (r.teams?.code ?? '') !== selectedTeam) return false
        if (!s) return true
        const name = normalizeSearch(`${r.first_name} ${r.last_name}`)
        const rev = normalizeSearch(`${r.last_name} ${r.first_name}`)
        return name.includes(s) || rev.includes(s) || normalizeSearch(r.teams?.code ?? '').includes(s)
      })
      .sort(sortRookies)
  }, [rookies, allTakenIds, search, selectedTeam])

  const { protectedBank, expiredBank } = useMemo(() => {
    const sorted = [...bank].sort((a, b) => sortRookies(a.players, b.players))
    return {
      protectedBank: sorted.filter((e) => isEntryProtected(e, season)),
      expiredBank: sorted.filter((e) => !isEntryProtected(e, season)),
    }
  }, [bank, season])

  const confirmAdd = async (type: RookieCategory, year: number | null) => {
    if (!saison || !pendingRookie) return
    setLoading(true)
    const poolDraftYear = type === 'repeche' ? (year ?? undefined) : undefined
    const result = await addPlayerAction(selectedPooler, pendingRookie.id, saison.id, 'recrue', type, poolDraftYear)
    if (result.error || result.id == null) {
      setMessage(`Erreur : ${result.error ?? 'id manquant'}`)
    } else {
      const newEntry: BankEntry = {
        id: result.id,
        player_id: pendingRookie.id,
        rookie_type: type,
        pool_draft_year: poolDraftYear ?? null,
        players: pendingRookie,
      }
      setBank((prev) => [...prev, newEntry])
      setAllTakenIds((prev) => new Set([...prev, pendingRookie.id]))
      setMessage('Recrue ajoutée !')
      setPendingRookie(null)
      setSearch('')
    }
    setLoading(false)
    setTimeout(() => setMessage(''), 3000)
  }

  const confirmEdit = async (entryId: number, type: RookieCategory, draftYear: number | null) => {
    setLoading(true)
    const result = await updateRookieTypeAction(entryId, type, draftYear ?? undefined)
    if (result.error) {
      setMessage(`Erreur : ${result.error}`)
    } else {
      // Rechargé : une recrue devenue non protégée vient d'être activée automatiquement.
      setReloadKey((k) => k + 1)
      setEditingEntryId(null)
      setMessage('Étiquette mise à jour.')
    }
    setLoading(false)
    setTimeout(() => setMessage(''), 3000)
  }

  const removeFromBank = async (entryId: number, successMessage?: string) => {
    setLoading(true)
    const result = await removePlayerAction(entryId)
    if (!result.error) {
      const removed = bank.find((e) => e.id === entryId)
      setBank((prev) => prev.filter((e) => e.id !== entryId))
      if (removed) setAllTakenIds((prev) => { const next = new Set(prev); next.delete(removed.player_id); return next })
      if (successMessage) {
        setMessage(successMessage)
        setTimeout(() => setMessage(''), 3000)
      }
    } else {
      setMessage(`Erreur : ${result.error}`)
      setTimeout(() => setMessage(''), 3000)
    }
    setLoading(false)
  }

  // Libérer une recrue à protection expirée : même opération que le ✕ (hard delete, pas
  // d'historique — Mode init), mais mise en évidence ici puisque le pooler doit choisir entre
  // Activer et Libérer, contrairement au reste de la banque où le retrait est une correction
  // ponctuelle cachée derrière le survol.
  const releaseExpired = (entry: BankEntry) => {
    const label = `${entry.players.last_name}, ${entry.players.first_name}`
    if (!window.confirm(`Libérer ${label} ? Cette recrue redevient un agent libre, disponible pour n'importe quel pooler.`)) return
    removeFromBank(entry.id, `${label} libéré.`)
  }

  // Activation permanente — protection expirée : "Promouvoir recrue" via submitTransactionAction
  // efface automatiquement rookie_type/pool_draft_year au moment même de l'activation (David,
  // 2026-09-03). Notes distinctes de 'Repêchage pré-saison' pour ne pas être ramassées par la
  // "Zone de test" de /admin/init?tab=presaison, qui ne doit annuler que les signatures d'AL.
  const confirmActivate = async (entry: BankEntry, newType: 'actif' | 'reserviste') => {
    if (!saison) return
    setLoading(true)
    const result = await submitTransactionAction(saison.id, 'Ajustement pré-saison', [{
      action_type: 'promote',
      to_pooler_id: selectedPooler,
      from_pooler_id: selectedPooler,
      player_id: entry.player_id,
      old_player_type: 'recrue',
      new_player_type: newType,
    }])
    if (result.error) {
      setMessage(`Erreur : ${result.error}`)
    } else {
      setBank((prev) => prev.filter((e) => e.id !== entry.id))
      setAllTakenIds((prev) => { const next = new Set(prev); next.delete(entry.player_id); return next })
      setActivatingEntryId(null)
      setMessage(`${entry.players.last_name}, ${entry.players.first_name} activé.`)
    }
    setLoading(false)
    setTimeout(() => setMessage(''), 3000)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-4 flex-wrap">
        <label className="text-sm font-medium text-gray-700">Pooler :</label>
        <select
          value={selectedPooler}
          onChange={(e) => setSelectedPooler(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {poolers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value={ALL_POOLERS}>Tous les poolers (révision des étiquettes)</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
          À vérifier seulement
        </label>
        {message && (
          <span className={`text-sm font-medium ${message.startsWith('Erreur') ? 'text-red-600' : 'text-emerald-600'}`}>
            {message}
          </span>
        )}
      </div>

      {isAll && (() => {
        const rows = [...allEntries]
          .filter((e) => !reviewOnly || hintFor(e)?.review)
          .sort((a, b) => (poolerNames.get(a.pooler_id ?? '') ?? '').localeCompare(poolerNames.get(b.pooler_id ?? '') ?? '', 'fr-CA')
            || sortRookies(a.players, b.players))
        return (
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="font-semibold text-gray-700 mb-1">
              {`Révision des étiquettes — ${rows.length} joueur${rows.length > 1 ? 's' : ''}`}
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Tous les joueurs des alignements, banque comprise. « À vérifier » : un joueur sans étiquette qui était protégé la saison passée, ou repêché par la LNH dans les 5 dernières années.
            </p>
            {rows.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">{reviewOnly ? 'Aucun joueur à vérifier' : 'Aucun joueur'}</p>
            ) : (
              <div className="space-y-1">
                {rows.map((entry) => (
                  <div key={entry.id}>
                    <BankRow entry={entry} season={season} loading={loading}
                      poolerName={poolerNames.get(entry.pooler_id ?? '')}
                      hint={hintFor(entry)}
                      onEdit={() => setEditingEntryId(editingEntryId === entry.id ? null : entry.id)} />
                    {editingEntryId === entry.id && (
                      <TypePanel
                        rookie={entry.players}
                        initialType={entry.rookie_type ?? undefined}
                        initialYear={entry.pool_draft_year}
                        defaultYear={currentDraftYear}
                        onConfirm={(type, year) => confirmEdit(entry.id, type, year)}
                        onCancel={() => setEditingEntryId(null)}
                        loading={loading}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {!isAll && (
      <div className="grid grid-cols-2 gap-6">
        {/* Banque actuelle */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="font-semibold text-gray-700 mb-4">
              {`Banque de recrues \u2014 ${protectedBank.length} recrue(s)`}
            </h2>
            {bank.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Banque vide</p>
            ) : protectedBank.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Aucune recrue protégée</p>
            ) : (
              <div className="space-y-1">
                {protectedBank.map((entry) => (
                  <div key={entry.id}>
                    <BankRow entry={entry} season={season} onRemove={removeFromBank} loading={loading}
                      onEdit={() => setEditingEntryId(editingEntryId === entry.id ? null : entry.id)} />
                    {editingEntryId === entry.id && (
                      <TypePanel
                        rookie={entry.players}
                        initialType={entry.rookie_type ?? undefined}
                        initialYear={entry.pool_draft_year}
                        defaultYear={currentDraftYear}
                        onConfirm={(type, year) => confirmEdit(entry.id, type, year)}
                        onCancel={() => setEditingEntryId(null)}
                        loading={loading}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {expiredBank.length > 0 && (
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-red-400">
              <h2 className="font-semibold text-red-600 mb-1">
                {`Activation obligatoire \u2014 ${expiredBank.length} recrue(s)`}
              </h2>
              <p className="text-xs text-gray-400 mb-4">
                La période de protection est terminée. Ces recrues doivent être activées en début de saison.
              </p>
              <div className="space-y-1">
                {expiredBank.map((entry) => (
                  <div key={entry.id}>
                    <BankRow entry={entry} season={season} onRemove={removeFromBank} loading={loading} expired
                      onEdit={() => setEditingEntryId(editingEntryId === entry.id ? null : entry.id)}
                      onActivate={() => setActivatingEntryId(activatingEntryId === entry.id ? null : entry.id)}
                      onRelease={() => releaseExpired(entry)} />
                    {editingEntryId === entry.id && (
                      <TypePanel
                        rookie={entry.players}
                        initialType={entry.rookie_type ?? undefined}
                        initialYear={entry.pool_draft_year}
                        defaultYear={currentDraftYear}
                        onConfirm={(type, year) => confirmEdit(entry.id, type, year)}
                        onCancel={() => setEditingEntryId(null)}
                        loading={loading}
                      />
                    )}
                    {activatingEntryId === entry.id && (
                      <ActivatePanel
                        rookie={entry.players}
                        onConfirm={(type) => confirmActivate(entry, type)}
                        onCancel={() => setActivatingEntryId(null)}
                        loading={loading}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {protectedActives.length > 0 && (
            <div className="bg-white rounded-lg shadow p-5">
              <h2 className="font-semibold text-gray-700 mb-1">
                {`Autres joueurs de l'alignement — ${protectedActives.length} joueur${protectedActives.length > 1 ? 's' : ''}`}
              </h2>
              <p className="text-xs text-gray-400 mb-4">
                Clique sur {PENCIL}{' '}pour corriger l&apos;étiquette d&apos;un joueur, même en cours de saison : repêché par le pool (protégé 5 saisons, incluant celle de son repêchage) ou agent libre (protégé tant que son contrat est un ELC). Un joueur protégé peut retourner en banque.
              </p>
              <div className="space-y-1">
                {[...protectedActives]
                  .filter((e) => !reviewOnly || hintFor(e)?.review)
                  .sort((a, b) => sortRookies(a.players, b.players)).map((entry) => (
                  <div key={entry.id}>
                    <BankRow entry={entry} season={season} loading={loading} hint={hintFor(entry)}
                      onEdit={() => setEditingEntryId(editingEntryId === entry.id ? null : entry.id)} />
                    {editingEntryId === entry.id && (
                      <TypePanel
                        rookie={entry.players}
                        initialType={entry.rookie_type ?? undefined}
                        initialYear={entry.pool_draft_year}
                        defaultYear={currentDraftYear}
                        onConfirm={(type, year) => confirmEdit(entry.id, type, year)}
                        onCancel={() => setEditingEntryId(null)}
                        loading={loading}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recrues disponibles */}
        <div className="bg-white rounded-lg shadow p-5 sticky top-4 self-start">
          <h2 className="font-semibold text-gray-700 mb-4">
            {`Recrues disponibles \u2014 ${availableRookies.length} joueur(s)`}
          </h2>
          <div className="flex gap-2 mb-4 flex-wrap">
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-28 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Équipe</option>
              {teamOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Rechercher par nom..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
            {availableRookies.map((rookie) => (
              <div key={rookie.id}>
                <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 group">
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    <span className="text-gray-400 w-8 text-center text-xs shrink-0">{rookie.teams?.code ?? DASH}</span>
                    <span className="font-medium text-gray-800 truncate">
                      {rookie.last_name}, {rookie.first_name}
                    </span>
                    <span className="text-gray-400 text-xs shrink-0">{rookie.position ?? DASH}</span>
                    {draftLabel(rookie) && (
                      <span className="text-gray-400 text-xs shrink-0">LNH {draftLabel(rookie)}</span>
                    )}
                    {rookie.status === 'ELC' && !rookie.draft_year && (
                      <span className="text-amber-500 text-xs shrink-0">ELC</span>
                    )}
                  </div>
                  <button
                    onClick={() => setPendingRookie(pendingRookie?.id === rookie.id ? null : rookie)}
                    disabled={loading}
                    className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30 ml-2 shrink-0"
                  >
                    Ajouter
                  </button>
                </div>
                {pendingRookie?.id === rookie.id && (
                  <TypePanel
                    rookie={rookie}
                    defaultYear={currentDraftYear}
                    onConfirm={confirmAdd}
                    onCancel={() => setPendingRookie(null)}
                    loading={loading}
                  />
                )}
              </div>
            ))}
            {availableRookies.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">
                {search || selectedTeam ? 'Aucun résultat' : 'Toutes les recrues sont déjà assignées'}
              </p>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
