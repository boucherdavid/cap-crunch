import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDataVersion } from '@/lib/dataVersion'
import { unstable_cache } from 'next/cache'
import { getStandings } from '@/lib/standings'
import { fmtPts } from '@/lib/nhl-stats'
import SummaryTable from '@/components/SummaryTable'
import { getPlayoffStandingsCached } from '@/app/gestion-series/playoff-pool-actions'
import {
  fetchPlayoffRecapForDate,
  getYesterdayET,
  type RecapPooler,
} from '@/lib/daily-recap'
import Link from 'next/link'
import Image from 'next/image'
import { fetchInjuriesByPlayerId } from '@/lib/injuries'
import { loadTradeMarket } from '@/lib/tradeMarket'
import { getLiveNight, type LiveNight } from '@/lib/liveNight'
import LiveNightCards from '@/components/live/LiveNightCards'
import { MARQUEUR_URL } from '@/lib/externalLinks'
import { after } from 'next/server'
import SectionIcon, { sectionBorderClass, type SectionId } from '@/components/SectionIcon'
import MobileFold from '@/components/MobileFold'
import { syncLtirReturns } from '@/lib/ltirReturns'
import { syncDeadlines } from '@/lib/deadlineSync'
import { syncNhlTransactions, loadRecentNhlTransactions, type NhlTransactionView } from '@/lib/nhlTransactions'
import { poolDraftYear } from '@/lib/poolDraftYear'
import { getPoolGoaliesTonight, type PoolGoalieTonight } from '@/lib/startingGoalies'

export const dynamic = 'force-dynamic'

// ---------- schedule ----------

type TodayGame = {
  id: number
  awayAbbrev: string
  homeAbbrev: string
  startTimeUTC: string
  gameState: string
}

async function fetchTodayGames(): Promise<{ date: string; games: TodayGame[] }> {
  try {
    const res = await fetch('https://api-web.nhle.com/v1/schedule/now', { next: { revalidate: 300 } })
    if (!res.ok) return { date: '', games: [] }
    const data = await res.json()
    const todayET = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    const entry = (data.gameWeek ?? []).find((d: { date: string }) => d.date === todayET)
      ?? data.gameWeek?.[0]
    if (!entry) return { date: '', games: [] }
    return {
      date: entry.date as string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      games: (entry.games ?? []).map((g: any) => ({
        id: g.id,
        awayAbbrev: g.awayTeam?.abbrev ?? '',
        homeAbbrev: g.homeTeam?.abbrev ?? '',
        startTimeUTC: g.startTimeUTC ?? '',
        gameState: g.gameState ?? 'FUT',
      })),
    }
  } catch {
    return { date: '', games: [] }
  }
}

function fmtGameTime(utcStr: string): string {
  if (!utcStr) return ''
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Toronto',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(utcStr)).replace(':', 'h') + ' ET'
  } catch { return '' }
}

function fmtDateShort(isoDate: string): string {
  if (!isoDate) return 'HIER'
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Toronto',
      day: 'numeric', month: 'short',
    }).format(new Date(isoDate + 'T12:00:00')).replace('.', '').toUpperCase()
  } catch { return 'HIER' }
}

function fmtDateFr(isoDate: string): string {
  if (!isoDate) return ''
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Toronto',
      weekday: 'long', day: 'numeric', month: 'long',
    }).format(new Date(isoDate + 'T12:00:00'))
  } catch { return isoDate }
}

const GAME_STATE_LABEL: Record<string, string> = {
  LIVE: 'En cours', CRIT: 'En cours', FINAL: 'Terminé', OFF: 'Terminé',
}

// ---------- position helpers ----------

function posGroup(pos: string): 'A' | 'D' | 'G' {
  const p = (pos ?? '').split(',')[0].trim()
  if (p === 'G') return 'G'
  if (['D', 'LD', 'RD'].includes(p)) return 'D'
  return 'A'
}

function fmtDetail(players: Array<{ position: string }>): string {
  const counts = { A: 0, D: 0, G: 0 }
  for (const p of players) counts[posGroup(p.position)]++
  return (['A', 'D', 'G'] as const)
    .filter(k => counts[k] > 0)
    .map(k => `${counts[k]}${k}`)
    .join(' · ')
}

// ---------- types activité ----------

type PoolerActivity = {
  poolerId: string
  poolerName: string
  count: number
  detail: string
  isMe: boolean
}

const RANK_COLOR = ['text-yellow-500', 'text-gray-400', 'text-amber-600']

// ---------- composants inline ----------

// Titre d'une carte : icône de la famille du menu (voir SectionIcon) et lien vers la page.
function CardTitle({ section, href, children }: { section: SectionId; href?: string; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-white font-bold text-sm uppercase tracking-wide">
      <SectionIcon section={section} />
      {href ? <Link href={href} className="hover:underline">{children}</Link> : <span>{children}</span>}
    </h2>
  )
}

function MarqueurCard() {
  return (
    <a
      href={MARQUEUR_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white rounded-lg shadow px-5 py-4 hover:shadow-md hover:bg-blue-50/40 transition"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Suivre et comparer</p>
      <p className="mt-1 font-bold text-blue-700">Notre pool sur Marqueur.com ↗</p>
      <p className="mt-0.5 text-xs text-gray-500">Nos alignements sur Marqueur.com, dans un nouvel onglet</p>
    </a>
  )
}

function ActivityTable({
  activity,
  todayDate,
  hasGames,
}: {
  activity: PoolerActivity[]
  todayDate: string
  hasGames: boolean
}) {
  if (!hasGames) return null

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className={`bg-slate-700 px-5 py-3 ${sectionBorderClass('pool')}`}>
        <CardTitle section="pool">Joueurs en action — {todayDate ? fmtDateFr(todayDate) : 'ce soir'}</CardTitle>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 text-left">Pooler</th>
              <th className="px-2 py-2 text-center w-12">Nb</th>
              <th className="px-4 py-2 text-left">Détail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activity.map(p => (
              <tr key={p.poolerId} className={p.isMe ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                <td className="px-4 py-2.5 font-medium text-gray-800">
                  {p.poolerName}
                  {p.isMe && <span className="ml-1.5 text-xs text-blue-500">(toi)</span>}
                </td>
                <td className="px-2 py-2.5 text-center font-bold text-gray-700">
                  {p.count > 0 ? p.count : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs font-medium text-gray-500">
                  {p.detail || <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScheduleList({
  todayDate,
  games,
}: {
  todayDate: string
  games: TodayGame[]
}) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className={`bg-slate-700 px-5 py-3 ${sectionBorderClass('calendrier')}`}>
        <CardTitle section="calendrier" href="/calendrier">{todayDate ? `Matchs — ${fmtDateFr(todayDate)}` : 'Matchs du jour'}</CardTitle>
      </div>
      {games.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400">Aucun match aujourd&apos;hui.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {games.map(g => {
            const stateLabel = GAME_STATE_LABEL[g.gameState]
            return (
              <li key={g.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-800">
                  {g.awayAbbrev} <span className="text-gray-400 font-normal">@</span> {g.homeAbbrev}
                </span>
                <span className={`text-xs shrink-0 ${stateLabel ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                  {stateLabel ?? fmtGameTime(g.startTimeUTC)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------- activité du pool ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function playerName(p: any): string {
  return p ? `${p.first_name} ${p.last_name}` : 'un joueur'
}

// Activité du pool (David, 2026-10-12) — deux sources :
// - roster_change_log : tous les mouvements réels de la saison, peu importe l'interface
//   (Gestion d'effectifs, approbation LTIR, ballotage, /admin/transactions). Les mouvements
//   faits par les poolers eux-mêmes n'écrivent RIEN dans `transactions` — d'où l'ancien widget
//   figé sur le repêchage des agents libres ;
// - transactions : seulement les échanges (une ligne pour l'échange au complet), dont les
//   mouvements individuels sont retirés de la première source pour éviter les doublons.
// Une fois la saison démarrée, seul ce qui suit `season_started_at` est affiché : le repêchage
// des agents libres et les ajustements pré-saison restent dans /journal-transactions.

// Faits saillants (David, 2026-10-13) : échanges, signatures (agent libre ou remplaçant LTIR) et
// ballotage ressortent — bandeau sous le logo et icône dans l'activité. Le reste est de la routine.
type ActivityKind = 'trade' | 'signing' | 'waiver' | 'routine'
// Texte découpé en segments : `b` = nom de pooler ou de joueur, mis en gras hors routine.
type Seg = { t: string; b?: boolean }
const B = (t: string): Seg => ({ t, b: true })
const segs = (...parts: (string | Seg | Seg[])[]): Seg[] =>
  parts.flatMap(p => (typeof p === 'string' ? [{ t: p }] : Array.isArray(p) ? p : [p]))
const joinSegs = (list: Seg[][], sep: string): Seg[] => list.flatMap((s, i) => (i === 0 ? s : [{ t: sep }, ...s]))

type TradeSide = { pooler: string; assets: string[] }
type Summary = { kind: ActivityKind; segs: Seg[]; trade?: TradeSide[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeTransaction(items: any[]): Summary | null {
  const transfers = items.filter(i => i.action_type === 'transfer')
  if (transfers.length > 0) {
    const names = Array.from(new Set(transfers.flatMap(i => [i.from_pooler?.name, i.to_pooler?.name]).filter(Boolean))) as string[]
    if (names.length !== 2) return { kind: 'trade', segs: segs('Échange entre poolers') }
    // Ce que chacun reçoit (David, 2026-10-12) — joueurs et choix de repêchage.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assetLabel = (i: any) => i.players
      ? playerName(i.players)
      : `choix de ${i.pick?.round ?? '?'}${i.pick?.round === 1 ? 're' : 'e'} ronde${i.pick?.pool_seasons?.season ? ` (${poolDraftYear(i.pick.pool_seasons.season)})` : ''}`
    const trade = names.map(name => ({ pooler: name, assets: transfers.filter(i => i.to_pooler?.name === name).map(assetLabel) }))
    const received = (side: TradeSide): Seg[] => side.assets.length ? joinSegs(side.assets.map(a => [B(a)]), ', ') : [{ t: 'rien' }]
    return {
      kind: 'trade',
      trade,
      segs: segs('Échange entre ', B(names[0]), ' et ', B(names[1]), ' — ', B(names[0]), ' reçoit ', received(trade[0]),
        ' ; ', B(names[1]), ' reçoit ', received(trade[1])),
    }
  }
  const ballotage = items.find(i => i.action_type === 'ballotage')
  if (ballotage) return { kind: 'waiver', segs: segs(B(ballotage.to_pooler?.name ?? '?'), ' obtient ', B(playerName(ballotage.players)), ' au ballotage') }
  const releases = items.filter(i => i.action_type === 'release')
  if (releases.length > 0) {
    const from = releases[0].from_pooler?.name ?? '?'
    return { kind: 'routine', segs: segs(B(from), releases.length > 1 ? ` libère ${releases.length} joueurs` : ` libère ${playerName(releases[0].players)}`) }
  }
  const sign = items.find(i => i.action_type === 'sign')
  if (sign) return { kind: 'signing', segs: segs(B(sign.to_pooler?.name ?? '?'), ' signe ', B(playerName(sign.players))) }
  return null
}

// Mouvement de roster_change_log — null = pas affiché.
function describeChange(changeType: string, oldType: string | null, newType: string | null, name: string): { kind: ActivityKind; segs: Seg[] } | null {
  const routine = (...p: (string | Seg)[]) => ({ kind: 'routine' as const, segs: segs(...p) })
  switch (changeType) {
    case 'signature_agent_libre': return { kind: 'signing', segs: segs('signe ', B(name)) }
    case 'signature_ltir':        return { kind: 'signing', segs: segs('signe ', B(name), ' (remplaçant LTIR)') }
    case 'ballotage':             return { kind: 'waiver', segs: segs('obtient ', B(name), ' au ballotage') }
    case 'ltir':                  return routine('place ', B(name), ' sur LTIR')
    case 'retour_ltir':           return newType === 'actif' ? routine('ramène ', B(name), ' du LTIR') : routine('ramène ', B(name), ' du LTIR en réserve')
    case 'activation':            return oldType === 'recrue' ? routine('active la recrue ', B(name)) : routine('active ', B(name))
    case 'deactivation':          return newType ? routine('envoie ', B(name), ' en réserve') : routine('libère ', B(name))
    case 'retrait':               return routine('libère ', B(name))
    case 'ajout_reserviste':
    case 'ajout_recrue':          return routine('ajoute ', B(name))
    case 'changement_type':
      if (newType === 'recrue') return routine('renvoie ', B(name), ' en banque')
      if (newType === 'reserviste') return routine('envoie ', B(name), ' en réserve')
      return null
    default: return null
  }
}

const KIND_RANK: Record<ActivityKind, number> = { trade: 3, signing: 2, waiver: 1, routine: 0 }

type PoolActivityItem = { id: string; createdAt: string } & Summary

async function fetchPoolActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolSeasonId: number,
  seasonStartedAt: string | null,
): Promise<PoolActivityItem[]> {
  try {
    let txQuery = supabase
      .from('transactions')
      .select(`
        id, created_at,
        transaction_items (
          action_type, player_id, from_pooler_id, to_pooler_id,
          from_pooler:poolers!from_pooler_id (name),
          to_pooler:poolers!to_pooler_id (name),
          players (first_name, last_name),
          pick:pool_draft_picks!pick_id (round, pool_seasons (season))
        )
      `)
      .eq('pool_season_id', poolSeasonId)
      .order('created_at', { ascending: false })
      .limit(25)
    if (seasonStartedAt) txQuery = txQuery.gte('created_at', seasonStartedAt)

    // Pré-saison : rien dans roster_change_log, l'ancien résumé des transactions suffit.
    const logQuery = seasonStartedAt
      ? supabase
          .from('roster_change_log')
          .select('id, player_id, pooler_id, change_type, old_type, new_type, changed_at, players (first_name, last_name), poolers!roster_change_log_pooler_id_fkey (name)')
          .eq('pool_season_id', poolSeasonId)
          .gte('changed_at', seasonStartedAt)
          .not('change_type', 'like', 'hist_%')
          .order('changed_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(80)
      : null

    const [{ data: txs }, logRes] = await Promise.all([txQuery, logQuery ?? Promise.resolve({ data: [] })])

    const out: PoolActivityItem[] = []
    // Mouvements déjà couverts par un échange : même joueur, même pooler, à un jour près.
    const tradeKeys: { playerId: number; poolerIds: Set<string>; at: number }[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const tx of (txs ?? []) as any[]) {
      const items = tx.transaction_items ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isTrade = items.some((i: any) => i.action_type === 'transfer')
      if (seasonStartedAt && !isTrade) continue
      const summary = summarizeTransaction(items)
      if (summary) out.push({ id: `tx-${tx.id}`, createdAt: tx.created_at, ...summary })
      if (isTrade) {
        const poolerIds = new Set<string>(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items.flatMap((i: any) => [i.from_pooler_id, i.to_pooler_id]).filter(Boolean),
        )
        const at = new Date(tx.created_at).getTime()
        for (const i of items) if (i.player_id) tradeKeys.push({ playerId: i.player_id, poolerIds, at })
      }
    }

    // Mouvement annulé le jour même (David, 2026-10-12) : un joueur qui passe d'actif à réserviste
    // et revient (ou l'inverse) dans la même journée, heure de l'Est, n'a rien changé — l'aller et
    // le retour disparaissent tous les deux de l'accueil (ils restent dans le journal).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logRows = (logRes.data ?? []) as any[]
    const etDay = (iso: string) => new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso))
    const swaps = new Map<string, { id: number; changed_at: string; old_type: string | null; new_type: string | null }[]>()
    for (const r of logRows) {
      if (r.change_type !== 'activation' && !(r.change_type === 'deactivation' && r.new_type)) continue
      const k = `${r.pooler_id}|${r.player_id}|${etDay(r.changed_at)}`
      swaps.set(k, [...(swaps.get(k) ?? []), r])
    }
    const cancelledIds = new Set<number>()
    for (const evts of swaps.values()) {
      if (evts.length < 2) continue
      const sorted = [...evts].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime() || a.id - b.id)
      if (sorted[0].old_type === sorted[sorted.length - 1].new_type) for (const e of sorted) cancelledIds.add(e.id)
    }

    // Un lot soumis d'un coup (même pooler, même horodatage) = une seule ligne.
    // Le lot prend le type le plus marquant de ses mouvements (ex : LTIR + signature = signature).
    const groups = new Map<string, { poolerName: string; at: string; kind: ActivityKind; parts: Seg[][] }>()
    for (const r of logRows) {
      if (cancelledIds.has(r.id)) continue
      const at = new Date(r.changed_at).getTime()
      if (tradeKeys.some(k => k.playerId === r.player_id && k.poolerIds.has(r.pooler_id) && Math.abs(k.at - at) < 86_400_000)) continue
      const part = describeChange(r.change_type, r.old_type, r.new_type, playerName(r.players))
      if (!part) continue
      const key = `${r.pooler_id}|${r.changed_at}`
      const g = groups.get(key) ?? { poolerName: r.poolers?.name ?? '?', at: r.changed_at, kind: 'routine' as ActivityKind, parts: [] as Seg[][] }
      g.parts.push(part.segs)
      if (KIND_RANK[part.kind] > KIND_RANK[g.kind]) g.kind = part.kind
      groups.set(key, g)
    }
    for (const [key, g] of groups) {
      out.push({ id: `log-${key}`, createdAt: g.at, kind: g.kind, segs: segs(B(g.poolerName), ' ', joinSegs(g.parts, ', ')) })
    }

    out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return out
  } catch {
    return []
  }
}

function fmtActivityDate(iso: string): string {
  try {
    const dayET = (d: Date) => new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d)
    const d = new Date(iso)
    if (dayET(d) === dayET(new Date())) return "Aujourd'hui"
    if (dayET(d) === dayET(new Date(Date.now() - 86400000))) return 'Hier'
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Toronto', day: 'numeric', month: 'short',
    }).format(d).replace('.', '')
  } catch { return '' }
}

// Classes écrites en entier : Tailwind ne détecte pas un nom de classe construit à la volée.
const KIND_STYLE: Record<Exclude<ActivityKind, 'routine'>, { label: string; path: string; badge: string; border: string }> = {
  trade:   { label: 'Échange',   path: 'M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16',                                              badge: 'bg-violet-100 text-violet-700',   border: 'border-violet-500' },
  signing: { label: 'Signature', path: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',                           badge: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-500' },
  waiver:  { label: 'Ballotage', path: 'M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3M9 2h6v4H9V2ZM9 14l2 2 4-4', badge: 'bg-orange-100 text-orange-700',   border: 'border-orange-500' },
}

function KindIcon({ kind, className = 'w-7 h-7' }: { kind: Exclude<ActivityKind, 'routine'>; className?: string }) {
  const s = KIND_STYLE[kind]
  return (
    <span className={`inline-flex items-center justify-center rounded-full shrink-0 ${s.badge} ${className}`} title={s.label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-1/2 h-1/2">
        <path d={s.path} />
      </svg>
    </span>
  )
}

function SegText({ segs: list, bold }: { segs: Seg[]; bold: boolean }) {
  return <>{list.map((s, i) => (s.b && bold ? <strong key={i} className="font-semibold text-gray-900">{s.t}</strong> : <span key={i}>{s.t}</span>))}</>
}

const HIGHLIGHT_DAYS = 7
const NEW_HOURS = 48
const HIGHLIGHT_MAX = 4

function HighlightsBanner({ items, now }: { items: PoolActivityItem[]; now: number }) {
  const recent = items
    .filter(i => i.kind !== 'routine' && now - new Date(i.createdAt).getTime() < HIGHLIGHT_DAYS * 86_400_000)
    .slice(0, HIGHLIGHT_MAX)
  if (recent.length === 0) return null
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">
          Faits saillants <span className="font-normal normal-case text-gray-400">· {HIGHLIGHT_DAYS} derniers jours</span>
        </h2>
        <Link href="/journal-transactions" className="text-xs text-blue-600 hover:underline">Journal des transactions →</Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {recent.map(item => {
          const kind = item.kind as Exclude<ActivityKind, 'routine'>
          const s = KIND_STYLE[kind]
          const isNew = now - new Date(item.createdAt).getTime() < NEW_HOURS * 3_600_000
          return (
            <div key={item.id} className={`bg-white rounded-lg shadow border-l-4 ${s.border} p-4 ${item.trade ? 'md:col-span-2' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <KindIcon kind={kind} />
                <span className="text-xs font-bold uppercase tracking-wide text-gray-700">{s.label}</span>
                {isNew && <span className="text-[10px] font-bold uppercase bg-red-500 text-white rounded-full px-2 py-0.5">Nouveau</span>}
                <span className="ml-auto text-xs text-gray-400">{fmtActivityDate(item.createdAt)}</span>
              </div>
              {item.trade ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {item.trade.map(side => (
                    <div key={side.pooler} className="bg-violet-50 rounded-md px-3 py-2">
                      <p className="text-sm text-gray-600"><strong className="text-gray-900">{side.pooler}</strong> reçoit</p>
                      <ul className="mt-1 space-y-0.5">
                        {side.assets.length === 0
                          ? <li className="text-sm text-gray-400">rien</li>
                          : side.assets.map(a => <li key={a} className="text-base font-semibold text-gray-900">{a}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-base text-gray-700"><SegText segs={item.segs} bold /></p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PoolActivityWidget({ items }: { items: PoolActivityItem[] }) {
  if (items.length === 0) return null
  return (
    <MobileFold>
      <div className={`bg-slate-700 px-5 py-3 flex items-center justify-between ${sectionBorderClass('pool')}`}>
        <CardTitle section="pool">Activité du pool</CardTitle>
        <Link href="/journal-transactions" className="text-xs text-slate-300 hover:text-white transition-colors">
          Tout voir →
        </Link>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map(item => {
          const highlight = item.kind !== 'routine'
          return (
            <li key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5 min-w-0">
                {highlight && <KindIcon kind={item.kind as Exclude<ActivityKind, 'routine'>} className="w-6 h-6" />}
                <span className={`text-sm ${highlight ? 'text-gray-800' : 'text-gray-500'}`}>
                  <SegText segs={item.segs} bold={highlight} />
                </span>
              </span>
              <span className="text-xs text-gray-400 shrink-0">{fmtActivityDate(item.createdAt)}</span>
            </li>
          )
        })}
      </ul>
    </MobileFold>
  )
}

// ---------- actualité LNH (RSS) ----------

type NewsItem = { title: string; link: string; pubDate: string; source: string }

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0*39;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractXmlTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  if (!m) return ''
  const raw = m[1].trim()
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/)
  return decodeXmlEntities(cdata ? cdata[1] : raw)
}

// Flux RSS officiels — pas de flux côté nhl.com (vérifié, David 2026-09-23) ni PuckPedia
// (vérifié le 2026-09-23 — site protégé contre les requêtes automatisées de toute façon).
// Parsé à la main (regex) plutôt que d'ajouter une dépendance XML pour un besoin aussi simple —
// même esprit que les autres fetch externes de cette page.
const NEWS_FEEDS = [
  { url: 'https://www.espn.com/espn/rss/nhl/news', source: 'ESPN' },
  { url: 'https://www.dailyfaceoff.com/feed', source: 'Daily Faceoff' },
]

async function fetchRssFeed(url: string, source: string, limit = 10): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) return []
    const xml = await res.text()
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []
    return blocks
      .map(block => ({
        title: extractXmlTag(block, 'title'),
        link: extractXmlTag(block, 'link'),
        pubDate: extractXmlTag(block, 'pubDate'),
        source,
      }))
      .filter(n => n.title && n.link)
      .slice(0, limit)
  } catch {
    return []
  }
}

async function fetchNhlNews(limit = 6): Promise<NewsItem[]> {
  const feeds = await Promise.all(NEWS_FEEDS.map(f => fetchRssFeed(f.url, f.source)))
  return feeds.flat()
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, limit)
}

function NhlNewsWidget({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return null
  return (
    <MobileFold>
      <div className={`bg-slate-700 px-5 py-3 ${sectionBorderClass('actualite')}`}>
        <CardTitle section="actualite">Actualité LNH</CardTitle>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map((n, i) => (
          <li key={i} className="px-4 py-2.5">
            <a
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-700 hover:text-blue-600 hover:underline"
            >
              {n.title}
            </a>
            <span className="ml-2 text-xs text-gray-400">{n.source}</span>
          </li>
        ))}
      </ul>
    </MobileFold>
  )
}

// ---------- blessures du pool ----------

type PoolInjuryItem = { poolerName: string; playerName: string; injuryType: string; status: string; eligible: boolean; backInAction: boolean }

// Limité aux joueurs actif/réserviste (ceux qui comptent dans la masse salariale et pour qui
// le LTIR est une vraie décision à prendre) — un joueur déjà en LTIR ou en banque de recrues
// n'a pas besoin de ce signal (David, 2026-09-23 : source CBS Sports + ESPN en recoupement,
// voir python_script/scrape_injuries.py et app/lib/injuries.ts).
// Alignements actif/réserviste de la saison (David, 2026-10-16) : la lecture coûtait ~200 ms à
// chaque visite de l'accueil (pg_stat_statements). Mise en cache tant que la version « standings »
// ne bouge pas (data_versions) ; l'admissibilité LTIR, qui dépend du jour, reste calculée à chaque
// affichage à partir des blessures déjà en cache.
type PoolRosterPlayer = { poolerName: string; playerId: number; playerName: string }

async function loadPoolActiveRoster(poolSeasonId: number): Promise<PoolRosterPlayer[]> {
  const { data } = await createAdminClient()
    .from('pooler_rosters')
    .select('poolers (name), players (id, first_name, last_name)')
    .eq('pool_season_id', poolSeasonId)
    .eq('is_active', true)
    .in('player_type', ['actif', 'reserviste'])
  const out: PoolRosterPlayer[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    if (!row.players) continue
    out.push({ poolerName: row.poolers?.name ?? '?', playerId: row.players.id, playerName: `${row.players.first_name} ${row.players.last_name}` })
  }
  return out
}

const cachedPoolActiveRoster = unstable_cache(
  async (poolSeasonId: number, _version: number) => loadPoolActiveRoster(poolSeasonId),
  ['home-pool-active-roster-v1'],
  { revalidate: 86_400 },
)

async function fetchPoolInjuries(poolSeasonId: number, limit = 8): Promise<PoolInjuryItem[]> {
  try {
    const version = await getDataVersion('standings')
    const [roster, injuriesByPlayerId] = await Promise.all([
      version === null ? loadPoolActiveRoster(poolSeasonId) : cachedPoolActiveRoster(poolSeasonId, version),
      fetchInjuriesByPlayerId(),
    ])

    const out: PoolInjuryItem[] = []
    for (const p of roster) {
      const inj = injuriesByPlayerId.get(p.playerId)
      if (!inj) continue
      out.push({
        poolerName: p.poolerName,
        playerName: p.playerName,
        injuryType: inj.injuryType,
        status: inj.status,
        eligible: inj.eligible,
        backInAction: inj.backInAction,
      })
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
}

function PoolInjuriesWidget({ items }: { items: PoolInjuryItem[] }) {
  if (items.length === 0) return null
  return (
    <MobileFold>
      <div className={`bg-slate-700 px-5 py-3 flex items-center justify-between ${sectionBorderClass('blessures')}`}>
        <CardTitle section="blessures" href="/statistiques/blessures">Blessures dans le pool</CardTitle>
        <span className="text-xs text-slate-300">Source : CBS Sports</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map((it, i) => (
          <li key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700">
              <span className="font-medium">{it.playerName}</span>
              <span className="text-gray-400"> ({it.poolerName})</span>
            </span>
            {it.backInAction
              ? <span className="text-xs font-bold text-sky-700 bg-sky-100 rounded px-1.5 py-0.5 text-right shrink-0" title={it.status}>De retour au jeu</span>
              : it.eligible
              ? <span className="text-xs font-bold text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5 text-right shrink-0" title={it.status}>Admissible LTIR</span>
              : <span className="text-xs text-red-600 text-right shrink-0" title={it.status}>{it.injuryType}</span>
            }
          </li>
        ))}
      </ul>
    </MobileFold>
  )
}

// ---------- gardiens du pool ce soir ----------

// Gardiens partants (David, 2026-10-16) — Daily Faceoff et Goaliepost, lib/startingGoalies.ts.
// Seulement les gardiens actifs et réservistes du pool dont l'équipe joue ce soir.
const GOALIE_SITUATION: Record<PoolGoalieTonight['situation'], { label: string; className: string }> = {
  confirme:       { label: 'Confirmé',       className: 'text-emerald-700 bg-emerald-100' },
  probable:       { label: 'Probable',       className: 'text-sky-700 bg-sky-100' },
  incertain:      { label: 'Non confirmé',   className: 'text-gray-600 bg-gray-100' },
  desaccord:      { label: 'Sources en désaccord', className: 'text-amber-700 bg-amber-100' },
  non_disponible: { label: 'Non disponible', className: 'text-gray-400 bg-gray-50' },
  auxiliaire:     { label: 'Ne devrait pas jouer', className: 'text-gray-500 bg-gray-100' },
}

function PoolGoaliesWidget({ items, myId }: { items: PoolGoalieTonight[]; myId: string | null }) {
  if (items.length === 0) return null
  return (
    <MobileFold>
      <div className={`bg-slate-700 px-5 py-3 flex items-center justify-between gap-3 ${sectionBorderClass('soir-de-match')}`}>
        <CardTitle section="soir-de-match" href="/statistiques/gardiens-partants">Gardiens du pool ce soir</CardTitle>
        <span className="text-xs text-slate-300 shrink-0">Daily Faceoff, Goaliepost</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map(it => {
          const s = GOALIE_SITUATION[it.situation]
          return (
            <li key={it.nhlId} className={`px-4 py-2.5 flex items-center justify-between gap-3 ${it.owner.poolerId === myId ? 'bg-violet-50' : ''}`}>
              <span className="text-sm text-gray-700 min-w-0">
                <span className="font-medium">{it.name}</span>
                <span className="text-gray-400"> ({it.owner.poolerName}{it.owner.playerType === 'reserviste' ? ', réserviste' : ''})</span>
                <span className="block text-xs text-gray-400">{it.home ? `${it.opponent} @ ${it.team}` : `${it.team} @ ${it.opponent}`} · {fmtGameTime(it.startUTC)}</span>
              </span>
              <span className={`text-xs font-bold rounded px-1.5 py-0.5 text-right shrink-0 ${s.className}`}>{s.label}</span>
            </li>
          )
        })}
      </ul>
    </MobileFold>
  )
}

// ---------- signatures et échanges de la LNH ----------

// Sources ESPN et LNH (lib/nhlTransactions.ts) — descriptions d'ESPN en anglais, telles quelles.
function NhlTransactionsWidget({ items }: { items: NhlTransactionView[] }) {
  if (items.length === 0) return null
  const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return (
    <MobileFold>
      <div className={`bg-slate-700 px-5 py-3 flex items-center justify-between gap-3 ${sectionBorderClass('contrats')}`}>
        <CardTitle section="contrats" href="/joueurs">Signatures et échanges dans la LNH</CardTitle>
        <span className="text-xs text-slate-300 shrink-0">Sources : ESPN, LNH</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map(it => (
          <li key={it.key} className={`px-4 py-2.5 ${it.owners.length > 0 ? 'bg-amber-50' : ''}`}>
            <p className="text-xs text-gray-400">
              <span className="font-semibold text-gray-600">{it.team}</span> · {fmtDate(it.txDate)}
            </p>
            <p className="text-sm text-gray-700">{it.description}</p>
            {it.owners.length > 0 && (
              <p className="text-xs font-semibold text-amber-700 mt-0.5">Dans le pool : {it.owners.join(', ')}</p>
            )}
          </li>
        ))}
      </ul>
    </MobileFold>
  )
}

// ---------- marché des échanges ----------

// Encadré « Sur le marché » (David, 2026-10-03) — derniers éléments offerts et recherches,
// lus par loadTradeMarket (qui retire au passage ce qui a expiré ou changé d'alignement).
async function fetchMarketSummary(poolSeasonId: number, limit = 5) {
  try {
    const { listings, requests } = await loadTradeMarket(poolSeasonId)
    const items = [
      ...listings.map(l => ({
        key: `l-${l.id}`, createdAt: l.createdAt, poolerName: l.poolerName,
        text: l.label + (l.position ? ` (${l.position})` : ''), kind: 'offre' as const,
      })),
      ...requests.map(r => ({
        key: `r-${r.id}`, createdAt: r.createdAt, poolerName: r.poolerName,
        text: r.description, kind: 'recherche' as const,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { items: items.slice(0, limit), total: items.length }
  } catch {
    return { items: [], total: 0 }
  }
}

function MarketWidget({ summary }: { summary: Awaited<ReturnType<typeof fetchMarketSummary>> }) {
  if (summary.items.length === 0) return null
  return (
    <MobileFold>
      <div className={`bg-slate-700 px-5 py-3 flex items-center justify-between ${sectionBorderClass('pool')}`}>
        <CardTitle section="pool">Sur le marché</CardTitle>
        <Link href="/marche-echanges" className="text-xs text-slate-300 hover:text-white">
          Tout voir ({summary.total}) →
        </Link>
      </div>
      <ul className="divide-y divide-gray-100">
        {summary.items.map(it => (
          <li key={it.key} className="px-4 py-2.5 flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700 min-w-0">
              <span className="font-medium">{it.text}</span>
              <span className="text-gray-400"> ({it.poolerName})</span>
            </span>
            {it.kind === 'offre'
              ? <span className="text-xs text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 shrink-0">Offert</span>
              : <span className="text-xs text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 shrink-0">Recherché</span>
            }
          </li>
        ))}
      </ul>
    </MobileFold>
  )
}

// ---------- header ----------

function Header({
  name, saison,
}: {
  name: string | null
  saison: { season: string; pool_cap: number } | null
}) {
  return (
    <div className="text-center">
      <Image
        src="/branding/logo-app.png"
        alt="Cap Crunch — Pool entre amis"
        width={1536}
        height={1024}
        className="w-full max-w-md mx-auto rounded-xl shadow-sm"
        priority
      />
      <div className="mt-3">
        {name && (
          <p className="text-sm font-medium text-gray-400">Bienvenue, {name}</p>
        )}
        <p className="text-gray-500 mt-1">
          {saison && (
            <>
              Saison {saison.season} &middot; Cap du pool :{' '}
              <span className="font-semibold text-blue-700">
                {new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(saison.pool_cap)}
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

// ---------- joueurs en action séries ----------

async function fetchTodaySeriesActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolSeasonId: number,
  playingTeams: Set<string>,
  myId: string | null,
): Promise<PoolerActivity[]> {
  const [{ data: rosters }, { data: poolerRows }] = await Promise.all([
    supabase
      .from('playoff_pool_rosters')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('pooler_id, players(position, teams(code))' as any)
      .eq('pool_season_id', poolSeasonId)
      .eq('is_active', true),
    supabase.from('poolers').select('id, name'),
  ])

  const poolerNames = new Map((poolerRows ?? []).map((p: any) => [p.id, p.name]))
  const activityMap = new Map<string, { count: number; players: { position: string }[] }>()

  for (const r of (rosters ?? []) as any[]) {
    if (!activityMap.has(r.pooler_id)) activityMap.set(r.pooler_id, { count: 0, players: [] })
    const teamCode: string | null = r.players?.teams?.code ?? null
    if (!teamCode || !playingTeams.has(teamCode)) continue
    const entry = activityMap.get(r.pooler_id)!
    entry.count++
    entry.players.push({ position: r.players?.position ?? '' })
  }

  return [...activityMap.entries()]
    .map(([poolerId, { count, players }]) => ({
      poolerId,
      poolerName: poolerNames.get(poolerId) ?? poolerId,
      count,
      detail: fmtDetail(players),
      isMe: poolerId === myId,
    }))
    .sort((a, b) => b.count - a.count || a.poolerName.localeCompare(b.poolerName))
}

// ---------- page ----------

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Retours au jeu des joueurs sur LTIR : détection en arrière-plan, sans ralentir l'accueil.
  after(() => syncLtirReturns())
  // Signatures et échanges de la LNH (ESPN) : même principe, avertit les admins des nouveautés.
  after(() => syncNhlTransactions())
  // Ballotage, échanges et plafond : règlement des délais échus et rappels (2026-10-16).
  after(() => syncDeadlines())

  const [{ data: saison }, { data: seriesSaison }, { data: me }] = await Promise.all([
    supabase.from('pool_seasons').select('id, season, pool_cap, season_started, season_started_at').eq('is_active', true).eq('is_playoff', false).single(),
    supabase.from('pool_seasons').select('id, season').eq('is_active', true).eq('is_playoff', true).maybeSingle(),
    user
      ? supabase.from('poolers').select('id, name').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const { date: todayDate, games: todayGames } = await fetchTodayGames()
  const playingTeams = new Set(todayGames.flatMap(g => [g.awayAbbrev, g.homeAbbrev]))
  const hasGames = todayGames.length > 0

  const [standings, poolActivity, poolInjuries, nhlNews, market, liveNight, nhlTransactions, poolGoalies] = await Promise.all([
    saison ? getStandings(saison.id) : Promise.resolve([]),
    saison ? fetchPoolActivity(supabase, saison.id, saison.season_started ? (saison.season_started_at ?? null) : null) : Promise.resolve([]),
    saison ? fetchPoolInjuries(saison.id) : Promise.resolve([]),
    fetchNhlNews(),
    saison ? fetchMarketSummary(saison.id) : Promise.resolve({ items: [], total: 0 }),
    // Pointage en direct (2026-10-04) — saison régulière seulement, calcul en cache 45 s.
    !seriesSaison ? getLiveNight() : Promise.resolve(null as LiveNight | null),
    loadRecentNhlTransactions(saison?.id ?? null),
    // Gardiens partants : seulement s'il y a des matchs ce soir (sources lues en cache 10 min).
    hasGames && !seriesSaison ? getPoolGoaliesTonight().then(r => r.items).catch(() => []) : Promise.resolve([] as PoolGoalieTonight[]),
  ])

  // Classement séries depuis le cache BD + récap d'hier + joueurs en action séries
  let playoffStandings: { poolerId: string; poolerName: string; totalPoints: number; hierPts: number }[] = []
  let activity: PoolerActivity[]
  let dailyRecap: { date: string; poolers: RecapPooler[] } = { date: '', poolers: [] }

  if (seriesSaison) {
    const [cached, seriesActivity, recap] = await Promise.all([
      getPlayoffStandingsCached(seriesSaison.id),
      fetchTodaySeriesActivity(supabase, seriesSaison.id, playingTeams, me?.id ?? null),
      fetchPlayoffRecapForDate(supabase, seriesSaison.id, getYesterdayET()),
    ])
    const hierMap = new Map(recap.poolers.map((p: RecapPooler) => [p.poolerId, p.pts]))
    playoffStandings = cached.map((s: { poolerId: string; poolerName: string; totalPoints: number }) => ({
      poolerId:    s.poolerId,
      poolerName:  s.poolerName,
      totalPoints: s.totalPoints,
      hierPts:     hierMap.get(s.poolerId) ?? 0,
    }))
    activity = seriesActivity
    dailyRecap = recap
  } else {
    activity = standings.map(pooler => {
      const playing = pooler.players.filter(
        p => p.playerType === 'actif' && playingTeams.has(p.teamAbbrev)
      )
      return {
        poolerId: pooler.poolerId,
        poolerName: pooler.poolerName,
        count: playing.length,
        detail: fmtDetail(playing),
        isMe: me?.id === pooler.poolerId,
      }
    }).sort((a, b) => b.count - a.count || a.poolerName.localeCompare(b.poolerName))
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <Header name={me?.name ?? null} saison={saison} />

      <HighlightsBanner items={poolActivity} now={new Date().getTime()} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-2">
          {/* Classement Pool Séries compact */}
          {seriesSaison && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-slate-800 px-5 py-3 flex items-center justify-between">
                <h2 className="text-white font-bold text-sm uppercase tracking-wide">
                  Classement séries {seriesSaison.season}
                </h2>
              </div>
              {playoffStandings.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-400">Aucun point enregistré pour l&apos;instant.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-2 text-left w-8">#</th>
                        <th className="px-4 py-2 text-left">Pooler</th>
                        <th className="px-2 py-2 text-blue-500">PTS</th>
                        {dailyRecap.date && <th className="px-3 py-2 text-green-600">{fmtDateShort(dailyRecap.date)}</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {playoffStandings.map((pooler, i) => (
                        <tr key={pooler.poolerId} className="hover:bg-gray-50">
                          <td className={`px-4 py-2.5 font-bold text-center ${RANK_COLOR[i] ?? 'text-gray-500'}`}>{i + 1}</td>
                          <td className="px-4 py-2.5 font-semibold text-gray-800">{pooler.poolerName}</td>
                          <td className="px-2 py-2.5 text-center font-bold text-blue-600">{fmtPts(pooler.totalPoints)}</td>
                          {dailyRecap.date && (
                            <td className="px-3 py-2.5 text-center font-semibold text-green-600">
                              {pooler.hierPts > 0 ? `+${pooler.hierPts}` : <span className="text-gray-300">—</span>}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-100">
                        <td colSpan={2}></td>
                        <td className="px-2 py-2 text-center">
                          <Link href="/classement-series" className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                            Classement détaillé →
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Link href={`/resultats?date=${dailyRecap.date || getYesterdayET()}`} className="text-xs text-green-600 hover:underline whitespace-nowrap">
                            Résultats détaillés →
                          </Link>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Classement Pool Saison — masqué quand les séries sont actives */}
          {!seriesSaison && (
            standings.length > 0 ? (
              <>
                <SummaryTable standings={standings} />
                <div className="text-right">
                  <Link href="/classement" className="text-sm text-blue-600 hover:underline">
                    Classement détaillé →
                  </Link>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg shadow p-6 text-gray-400 text-sm">
                Aucune donnée de classement disponible.
              </div>
            )
          )}

          {liveNight && <LiveNightCards initial={liveNight} myId={me?.id ?? null} />}

          {/* Téléphone : les matchs remontent ici, avant les cartes repliées (colonne de droite à partir de lg). */}
          <div className="lg:hidden">
            <ScheduleList todayDate={todayDate} games={todayGames} />
          </div>

          <PoolActivityWidget items={poolActivity.slice(0, 8)} />
          <MarketWidget summary={market} />
          <PoolInjuriesWidget items={poolInjuries} />
        </div>

        <div className="space-y-4">
          <MarqueurCard />
          <div className="hidden lg:block">
            <ScheduleList todayDate={todayDate} games={todayGames} />
          </div>
          {/* « Joueurs en action » remplacé par le pointage en direct en saison régulière (2026-10-04) */}
          {seriesSaison && <ActivityTable activity={activity} todayDate={todayDate} hasGames={hasGames} />}
          <PoolGoaliesWidget items={poolGoalies} myId={me?.id ?? null} />
          <NhlTransactionsWidget items={nhlTransactions} />
          <NhlNewsWidget items={nhlNews} />
        </div>
      </div>
    </div>
  )
}
