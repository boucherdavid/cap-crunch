'use client'

import { useState, Fragment } from 'react'
import { fmtPts } from '@/lib/nhl-stats'
import PlayerLink from '@/components/PlayerLink'
import type { PlayerContrib, PeriodContrib } from '@/lib/standings'
import type { StreakInfo, GoalieBadgeType } from '@/lib/streaks'
import StreakLegend from '@/components/StreakLegend'

type Tab = 'masse-salariale' | 'alignement' | 'historique' | 'recrues'

type ChangeLogEntry = {
  id: number
  change_type: string
  old_type: string | null
  new_type: string | null
  changed_at: string
  is_admin_override: boolean | null
  players: { first_name: string; last_name: string; position: string | null } | null
}

const GROUP_LABEL = ['Attaquants', 'Défenseurs', 'Gardiens']
const TYPE_BADGE: Record<string, string> = { reserviste: 'RES', ltir: 'LTIR' }

const CHANGE_LABEL: Record<string, string> = {
  activation:          'Activation',
  deactivation:        'Désactivation',
  ajout_reserviste:    'Ajout (réserviste)',
  ajout_recrue:        'Ajout (banque recrues)',
  retrait:             'Retrait',
  ltir:                'Mise sur LTIR',
  retour_ltir:         'Retour LTIR',
  changement_type:     'Changement de type',
  signature_agent_libre: 'Signature agent libre',
  ballotage:             'Ballotage',
}

const CHANGE_COLOR: Record<string, string> = {
  activation:          'bg-green-100 text-green-700',
  deactivation:        'bg-orange-100 text-orange-700',
  ajout_reserviste:    'bg-blue-100 text-blue-700',
  ajout_recrue:        'bg-purple-100 text-purple-700',
  retrait:             'bg-red-100 text-red-700',
  ltir:                'bg-yellow-100 text-yellow-700',
  retour_ltir:         'bg-teal-100 text-teal-700',
  changement_type:     'bg-gray-100 text-gray-600',
  signature_agent_libre: 'bg-indigo-100 text-indigo-700',
  ballotage:             'bg-cyan-100 text-cyan-700',
}

function positionGroup(pos: string): number {
  const p = (pos ?? '').toUpperCase()
  if (p === 'G') return 2
  if (p.includes('D')) return 1
  return 0
}

function groupAndSort(players: PlayerContrib[]): PlayerContrib[] {
  const groups: PlayerContrib[][] = [[], [], []]
  for (const p of players) groups[positionGroup(p.position)].push(p)
  for (const g of groups) g.sort((a, b) => b.poolPoints - a.poolPoints)
  return groups.flat()
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-CA', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'America/Toronto',
  })
}

const BADGE_META: Record<NonNullable<StreakInfo['badge']>, { emoji: string; label: string; cls: string }> = {
  en_feu:    { emoji: '🔥', label: 'En feu',    cls: 'text-orange-500' },
  en_forme:  { emoji: '✅', label: 'En forme',  cls: 'text-green-500'  },
  en_panne:  { emoji: '🧊', label: 'En panne',  cls: 'text-sky-500'    },
  en_crise:  { emoji: '🚨', label: 'En crise',  cls: 'text-red-500'    },
  en_hausse: { emoji: '📈', label: 'En hausse', cls: 'text-emerald-500' },
  en_baisse: { emoji: '📉', label: 'En baisse', cls: 'text-amber-500'  },
}

const GOALIE_BADGE_META: Record<NonNullable<GoalieBadgeType>, { emoji: string; label: (v?: number) => string }> = {
  wins_streak: { emoji: '🏆', label: (v) => `${v} victoires consécutives` },
  sv_elite:    { emoji: '🛡️', label: (v) => `Sv% récent : ${v?.toFixed(1)}%` },
  gaa_basse:   { emoji: '🎯', label: (v) => `GAA récente : ${v?.toFixed(2)}` },
}

function StreakBadge({ info }: { info: StreakInfo | undefined }) {
  if (!info || !info.badge) return null
  const meta = BADGE_META[info.badge]
  const hasCount = info.badge === 'en_feu' || info.badge === 'en_forme' || info.badge === 'en_panne' || info.badge === 'en_crise'
  const title = hasCount ? `${meta.label} — ${info.count} matchs consécutifs` : meta.label
  return (
    <span className={`ml-1 text-sm ${meta.cls}`} title={title}>
      {meta.emoji}
    </span>
  )
}

function GoalieBadge({ info }: { info: StreakInfo | undefined }) {
  if (!info?.goalieBadge) return null
  const meta = GOALIE_BADGE_META[info.goalieBadge]
  return <span className="ml-0.5 text-sm" title={meta.label(info.goalieValue)}>{meta.emoji}</span>
}

function PeriodPopup({ playerName, isGoalie, periods, totalPoints, onClose }: {
  playerName: string
  isGoalie: boolean
  periods: PeriodContrib[]
  totalPoints: number
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xs"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-gray-800 text-sm">{playerName}</span>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-2" aria-label="Fermer">✕</button>
        </div>
        <div className="px-4 py-3 space-y-3">
          {periods.map((p, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">
                  Période {i + 1}
                  {p.removedAt === null && <span className="ml-1.5 text-green-600 font-semibold">actif</span>}
                </span>
                <span className="text-xs text-gray-400">
                  {fmtDate(p.addedAt)} → {p.removedAt ? fmtDate(p.removedAt) : '…'}
                </span>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5">
                <span className="text-sm text-gray-600">
                  {isGoalie
                    ? `${p.goalie_wins}V  ${p.goalie_otl}DP  ${p.goalie_shutouts}BL`
                    : `${p.goals}B  ${p.assists}A`}
                </span>
                <span className="text-sm font-bold text-blue-600">{fmtPts(p.points)} pts</span>
              </div>
            </div>
          ))}
          <div className="border-t pt-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Total</span>
            <span className="text-sm font-bold text-blue-700">{fmtPts(totalPoints)} pts</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlayerStatsRow({ p, streaks, onPeriodClick }: { p: PlayerContrib; streaks: Record<number, StreakInfo>; onPeriodClick?: (p: PlayerContrib) => void }) {
  const isGoalie = p.position === 'G'
  const isActif = p.playerType === 'actif' && p.stillRostered
  // Un joueur qui a quitté le pooler (échangé/libéré) garde son dernier playerType
  // ('actif' la plupart du temps) — sans ce cas à part il s'affichait identique à un
  // vrai actif malgré ses points déjà gagnés et son départ (repéré par David le 2026-08-13).
  const badge = !p.stillRostered ? 'PARTI' : TYPE_BADGE[p.playerType]
  return (
    <tr className={isActif ? 'hover:bg-gray-50' : 'hover:bg-gray-50 opacity-60'}>
      <td className="px-4 py-2">
        <PlayerLink nhlId={p.nhlId}>
          <span className={`font-medium ${isActif ? 'text-gray-800' : 'text-gray-500'}`}>
            {p.lastName}, {p.firstName}
          </span>
        </PlayerLink>
        <StreakBadge info={p.nhlId ? streaks[p.nhlId] : undefined} />
        <GoalieBadge info={p.nhlId ? streaks[p.nhlId] : undefined} />
        {badge && <span className="ml-2 text-xs bg-gray-100 text-gray-400 rounded px-1">{badge}</span>}
        <button
          type="button"
          onClick={() => onPeriodClick?.(p)}
          className="ml-2 text-xs text-blue-500 hover:text-blue-700 font-medium"
          title="Voir le détail par période"
        >
          ↩{p.periods.length}
        </button>
      </td>
      <td className="px-2 py-2 hidden sm:table-cell text-gray-500 text-center text-xs">{p.teamAbbrev}</td>
      <td className="px-2 py-2 text-center text-gray-500">{p.gamesPlayed || '—'}</td>
      {isGoalie ? (
        <>
          <td className="px-2 py-2 text-center text-gray-500">{p.goals || '—'}</td>
          <td className="px-2 py-2 text-center text-gray-500">{p.assists || '—'}</td>
          <td className="px-2 py-2 text-center text-gray-500 hidden sm:table-cell">{p.goalieWins}</td>
          <td className="px-2 py-2 text-center text-gray-500 hidden sm:table-cell">{p.goalieOtl}</td>
          <td className="px-2 py-2 text-center text-gray-500 hidden sm:table-cell">{p.goalieShutouts || '—'}</td>
        </>
      ) : (
        <>
          <td className="px-2 py-2 text-center text-gray-500">{p.goals}</td>
          <td className="px-2 py-2 text-center text-gray-500">{p.assists}</td>
          <td className="px-2 py-2 text-center text-gray-400 hidden sm:table-cell">—</td>
          <td className="px-2 py-2 text-center text-gray-400 hidden sm:table-cell">—</td>
          <td className="px-2 py-2 text-center text-gray-400 hidden sm:table-cell">—</td>
        </>
      )}
      <td className={`px-2 py-2 text-center font-bold ${isActif ? 'text-blue-600' : 'text-gray-400'}`}>
        {fmtPts(p.poolPoints)}
      </td>
    </tr>
  )
}

export default function PoolerPageTabs({
  masseSalarialeContent,
  recruesContent,
  alignementPlayers,
  streaks,
  changeLog,
}: {
  masseSalarialeContent: React.ReactNode
  recruesContent: React.ReactNode
  alignementPlayers: PlayerContrib[]
  streaks: Record<number, StreakInfo>
  changeLog: ChangeLogEntry[]
}) {
  const [tab, setTab] = useState<Tab>('alignement')
  const [periodPopup, setPeriodPopup] = useState<PlayerContrib | null>(null)

  const btnClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`

  const sorted = groupAndSort(alignementPlayers)
  // poolPoints ne compte déjà que les matchs joués pendant les segments réellement actifs
  // (voir buildStandings) — pas besoin de refiltrer par statut actuel ici.
  const totalPts = alignementPlayers.reduce((s, p) => s + p.poolPoints, 0)

  const signaturesLibres = changeLog.filter(e => e.change_type === 'signature_agent_libre' && e.old_type !== 'ltir').length
  const signaturesLtir   = changeLog.filter(e => e.change_type === 'signature_agent_libre' && e.old_type === 'ltir').length

  return (
    <div>
      {periodPopup && (
        <PeriodPopup
          playerName={`${periodPopup.lastName}, ${periodPopup.firstName}`}
          isGoalie={periodPopup.position === 'G'}
          periods={periodPopup.periods}
          totalPoints={periodPopup.poolPoints}
          onClose={() => setPeriodPopup(null)}
        />
      )}
      <div className="flex border-b border-gray-200 mb-6">
        <button className={btnClass('alignement')} onClick={() => setTab('alignement')}>
          Alignement
        </button>
        <button className={btnClass('masse-salariale')} onClick={() => setTab('masse-salariale')}>
          Masse Salariale
        </button>
        <button className={btnClass('recrues')} onClick={() => setTab('recrues')}>
          Recrues
        </button>
        <button className={btnClass('historique')} onClick={() => setTab('historique')}>
          Historique
          {changeLog.length > 0 && (
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 rounded-full px-1.5">{changeLog.length}</span>
          )}
        </button>
      </div>

      {tab === 'masse-salariale' && masseSalarialeContent}

      {tab === 'recrues' && recruesContent}

      {tab === 'alignement' && (
        <div className="space-y-4">
        <StreakLegend />
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {alignementPlayers.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              Aucune donnée disponible pour cette saison.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left">Joueur</th>
                    <th className="px-2 py-2 hidden sm:table-cell">Éq.</th>
                    <th className="px-2 py-2">MJ</th>
                    <th className="px-2 py-2">B</th>
                    <th className="px-2 py-2">A</th>
                    <th className="px-2 py-2 hidden sm:table-cell">V</th>
                    <th className="px-2 py-2 hidden sm:table-cell">DP</th>
                    <th className="px-2 py-2 hidden sm:table-cell">BL</th>
                    <th className="px-2 py-2 text-blue-500">PTS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((p, i) => {
                    const isFirstOfGroup = i === 0 || positionGroup(p.position) !== positionGroup(sorted[i - 1].position)
                    return (
                      <Fragment key={p.nhlId ?? i}>
                        {isFirstOfGroup && (
                          <tr className="bg-gray-100">
                            <td colSpan={9} className="px-4 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              {GROUP_LABEL[positionGroup(p.position)]}
                            </td>
                          </tr>
                        )}
                        <PlayerStatsRow p={p} streaks={streaks} onPeriodClick={setPeriodPopup} />
                      </Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 border-t">
                    <td colSpan={8} className="px-4 py-2 text-sm text-gray-500 font-medium">
                      Total
                    </td>
                    <td className="px-2 py-2 text-center font-bold text-blue-600">{fmtPts(totalPts)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        </div>
      )}

      {tab === 'historique' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-xs text-gray-400 mb-1">Agents libres signés</p>
              <p className="text-2xl font-bold text-gray-800">{signaturesLibres}<span className="text-sm font-normal text-gray-400"> / 2</span></p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-xs text-gray-400 mb-1">Signatures LTIR</p>
              <p className="text-2xl font-bold text-gray-800">{signaturesLtir}<span className="text-sm font-normal text-gray-400"> / 2</span></p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-xs text-gray-400 mb-1">Total changements</p>
              <p className="text-2xl font-bold text-gray-800">{changeLog.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            {changeLog.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                Aucun changement enregistré pour cette saison.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide border-b">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Joueur</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-left hidden sm:table-cell">Détail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {changeLog.map(entry => {
                      const label = CHANGE_LABEL[entry.change_type] ?? entry.change_type
                      const color = CHANGE_COLOR[entry.change_type] ?? 'bg-gray-100 text-gray-600'
                      const player = entry.players
                      return (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">
                            {formatDate(entry.changed_at)}
                          </td>
                          <td className="px-4 py-2 font-medium text-gray-800">
                            {player ? `${player.last_name}, ${player.first_name}` : '—'}
                            {player?.position && (
                              <span className="ml-1 text-xs text-gray-400">{player.position}</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`inline-block text-xs font-medium rounded px-2 py-0.5 ${color}`}>
                              {label}
                            </span>
                            {entry.is_admin_override && (
                              <span className="ml-1.5 inline-block text-xs font-medium bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
                                override
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-400 hidden sm:table-cell">
                            {entry.old_type && entry.new_type
                              ? `${entry.old_type} → ${entry.new_type}`
                              : entry.new_type ?? entry.old_type ?? '—'
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
