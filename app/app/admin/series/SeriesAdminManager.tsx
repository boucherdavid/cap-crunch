'use client'

import { useState, useTransition } from 'react'
import {
  markTeamEliminatedAction,
  removeEliminationAction,
  setParticipatingTeamsAction,
  sendDeadlineReminderAction,
} from './series-admin-actions'
import {
  getPlayoffPoolStandingsAction,
} from '@/app/gestion-series/playoff-pool-actions'
import type {
  PlayoffPoolSaison,
  PlayoffPoolEntry,
  PlayoffPoolStanding,
} from '@/app/gestion-series/playoff-pool-actions'
import type { EliminatedTeam } from './series-admin-actions'

type Team = { id: number; code: string; name: string }

// ─── Tab: Équipes ─────────────────────────────────────────────────────────────

function TeamsTab({
  saison,
  participatingTeamIds,
  eliminations,
  allTeams,
}: {
  saison: PlayoffPoolSaison
  participatingTeamIds: number[]
  eliminations: EliminatedTeam[]
  allTeams: Team[]
}) {
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editingSetup, setEditingSetup] = useState(participatingTeamIds.length === 0)
  const [selected, setSelected] = useState<Set<number>>(new Set(participatingTeamIds))

  const eliminatedIds = new Set(eliminations.map(e => e.teamId))
  const participatingTeams = allTeams.filter(t => participatingTeamIds.includes(t.id))

  function act(fn: () => Promise<{ error?: string }>) {
    setMsg(null)
    startTransition(async () => {
      const r = await fn()
      if (r.error) setMsg({ type: 'error', text: r.error })
      else setMsg({ type: 'success', text: 'Opération réussie.' })
    })
  }

  function toggleSelected(teamId: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  function handleConfirmSetup() {
    act(async () => {
      const res = await setParticipatingTeamsAction(saison.id, [...selected])
      if (!res.error) setEditingSetup(false)
      return res
    })
  }

  function handleToggleEliminated(team: Team) {
    const elim = eliminations.find(e => e.teamId === team.id)
    if (elim) {
      act(() => removeEliminationAction(elim.id))
    } else {
      act(() => markTeamEliminatedAction(saison.id, team.id))
    }
  }

  // ── Phase 1 : sélection des équipes participantes ──
  if (editingSetup) {
    const divisions: Record<string, Team[]> = {}
    for (const t of allTeams) {
      const div = getDivision(t.code)
      if (!divisions[div]) divisions[div] = []
      divisions[div].push(t)
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">Sélectionner les équipes participantes</p>
            <p className="text-xs text-gray-500 mt-0.5">{selected.size} équipe{selected.size > 1 ? 's' : ''} sélectionnée{selected.size > 1 ? 's' : ''}</p>
          </div>
          {participatingTeamIds.length > 0 && (
            <button onClick={() => { setSelected(new Set(participatingTeamIds)); setEditingSetup(false) }}
              className="text-xs text-gray-400 hover:text-gray-600">
              Annuler
            </button>
          )}
        </div>

        {msg && (
          <p className={`text-sm rounded px-3 py-2 ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {msg.text}
          </p>
        )}

        <div className="space-y-4">
          {Object.entries(divisions).map(([div, teams]) => (
            <div key={div}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{div}</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {teams.map(t => (
                  <button
                    key={t.id}
                    onClick={() => toggleSelected(t.id)}
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg border-2 transition-all text-xs font-bold
                      ${selected.has(t.id)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'}`}
                  >
                    <span className="text-base leading-none">{t.code}</span>
                    {selected.has(t.id) && <span className="text-blue-400 text-xs mt-0.5">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleConfirmSetup}
          disabled={isPending || selected.size === 0}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          {isPending ? 'Enregistrement...' : `Confirmer — ${selected.size} équipe${selected.size > 1 ? 's' : ''}`}
        </button>
      </div>
    )
  }

  // ── Phase 2 : gestion des éliminations ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Équipes participantes</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {eliminatedIds.size} éliminée{eliminatedIds.size > 1 ? 's' : ''} · {participatingTeamIds.length - eliminatedIds.size} encore en lice
          </p>
        </div>
        <button
          onClick={() => { setSelected(new Set(participatingTeamIds)); setEditingSetup(true) }}
          className="text-xs text-blue-500 hover:text-blue-700 font-medium"
        >
          Modifier la sélection
        </button>
      </div>

      {msg && (
        <p className={`text-sm rounded px-3 py-2 ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </p>
      )}

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {participatingTeams.map(t => {
          const isElim = eliminatedIds.has(t.id)
          return (
            <button
              key={t.id}
              onClick={() => handleToggleEliminated(t)}
              disabled={isPending}
              title={isElim ? `${t.name} — cliquer pour retirer l'élimination` : `${t.name} — cliquer pour marquer éliminée`}
              className={`flex flex-col items-center justify-center py-3 px-1 rounded-lg border-2 transition-all text-xs font-bold disabled:opacity-50
                ${isElim
                  ? 'border-red-300 bg-red-50 text-red-400 line-through opacity-70'
                  : 'border-green-300 bg-green-50 text-green-700 hover:border-green-400 hover:bg-green-100'}`}
            >
              <span className="text-base leading-none">{t.code}</span>
              <span className={`text-xs mt-0.5 ${isElim ? 'text-red-400' : 'text-green-500'}`}>
                {isElim ? '✕' : '✓'}
              </span>
            </button>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 text-center">
        Cliquer sur une équipe pour basculer son statut d&apos;élimination
      </p>
    </div>
  )
}

// Division helper (approximatif — pour regrouper visuellement)
function getDivision(code: string): string {
  const atlantic = ['BOS', 'BUF', 'DET', 'FLA', 'MTL', 'OTT', 'TBL', 'TOR']
  const metro = ['CAR', 'CBJ', 'NJD', 'NYI', 'NYR', 'PHI', 'PIT', 'WSH']
  const central = ['ARI', 'CHI', 'COL', 'DAL', 'MIN', 'NSH', 'STL', 'UTA', 'WPG']
  const pacific = ['ANA', 'CGY', 'EDM', 'LAK', 'SJS', 'SEA', 'VAN', 'VGK']
  if (atlantic.includes(code)) return 'Atlantique'
  if (metro.includes(code)) return 'Métropolitaine'
  if (central.includes(code)) return 'Centrale'
  if (pacific.includes(code)) return 'Pacifique'
  return 'Autre'
}

// ─── Tab: Alignements ─────────────────────────────────────────────────────────

function AlignmentsTab({
  allRosters,
  saison,
}: {
  allRosters: { poolerId: string; poolerName: string; entries: PlayoffPoolEntry[] }[]
  saison: PlayoffPoolSaison
}) {
  const slotOrder: Record<string, number> = { F: 0, D: 1, G: 2 }
  const slotColor: Record<string, string> = { F: 'text-blue-600', D: 'text-green-600', G: 'text-purple-600' }

  return (
    <div className="space-y-4">
      {allRosters.map(({ poolerId, poolerName, entries }) => (
        <div key={poolerId} className="border rounded-lg overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{poolerName}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{entries.length} / {saison.maxF + saison.maxD + saison.maxG} joueurs</span>
              {entries.length === saison.maxF + saison.maxD + saison.maxG &&
               entries.filter(e => e.positionSlot === 'F').length === saison.maxF &&
               entries.filter(e => e.positionSlot === 'D').length === saison.maxD &&
               entries.filter(e => e.positionSlot === 'G').length === saison.maxG
                ? <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">✓ Complet</span>
                : <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">⚠ Incomplet</span>
              }
            </div>
          </div>
          {entries.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 italic">Aucun alignement soumis.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {[...entries]
                .sort((a, b) => (slotOrder[a.positionSlot] ?? 3) - (slotOrder[b.positionSlot] ?? 3))
                .map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className={`text-xs font-bold w-5 ${slotColor[e.positionSlot]}`}>{e.positionSlot}</span>
                    <span className="flex-1 text-gray-800">{e.lastName}, {e.firstName}</span>
                    <span className="text-xs text-gray-500">{e.teamCode}</span>
                    {e.teamEliminated && <span className="text-xs text-red-600 font-medium">⚠ ÉL.</span>}
                  </div>
                ))
              }
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Scoring ─────────────────────────────────────────────────────────────

function ScoringTab({ poolSeasonId }: { poolSeasonId: number }) {
  const [standings, setStandings] = useState<PlayoffPoolStanding[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function calculate() {
    setLoading(true)
    setMsg(null)
    try {
      const s = await getPlayoffPoolStandingsAction(poolSeasonId)
      setStandings(s)
      if (s.length === 0) setMsg('Aucune donnée de scoring disponible.')
    } catch {
      setMsg('Erreur lors du calcul.')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Classement en direct</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Points calculés automatiquement à chaque changement (snapshot activation/désactivation).
            </p>
          </div>
          <button
            onClick={calculate}
            disabled={loading}
            className="bg-gray-800 text-white text-sm px-4 py-2 rounded hover:bg-gray-900 disabled:opacity-50"
          >
            {loading ? 'Calcul...' : 'Calculer'}
          </button>
        </div>
        {msg && <p className="text-xs text-gray-500">{msg}</p>}
      </div>

      {standings.length > 0 && (
        <div className="space-y-3">
          {standings.map((s, i) => (
            <div key={s.poolerId} className="border rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                  <span className="text-sm font-semibold text-gray-800">{s.poolerName}</span>
                </div>
                <span className="text-sm font-bold text-blue-700">{s.totalPoints.toFixed(1)} pts</span>
              </div>
              <div className="divide-y divide-gray-50">
                {s.players.map(p => (
                  <div key={p.playerId} className="flex items-center gap-2 px-4 py-1.5 text-xs text-gray-600">
                    <span className={`font-bold w-4 ${p.positionSlot === 'F' ? 'text-blue-500' : p.positionSlot === 'D' ? 'text-green-500' : 'text-purple-500'}`}>
                      {p.positionSlot}
                    </span>
                    <span className="flex-1">{p.lastName}, {p.firstName}</span>
                    <span className="text-gray-400">{p.teamCode}</span>
                    {!p.isActive && <span className="text-gray-300 text-xs">retiré</span>}
                    <span className="text-gray-500 tabular-nums">{p.goals}B {p.assists}A</span>
                    {(p.goalieWins > 0 || p.goalieOtl > 0) && (
                      <span className="text-gray-500 tabular-nums">{p.goalieWins}V {p.goalieOtl}DP</span>
                    )}
                    <span className="font-semibold text-blue-600 tabular-nums w-14 text-right">{p.points.toFixed(1)} pts</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SeriesAdminManager({
  saison, participatingTeamIds, eliminations, allTeams, allRosters,
}: {
  saison: PlayoffPoolSaison
  participatingTeamIds: number[]
  eliminations: EliminatedTeam[]
  allTeams: Team[]
  allRosters: { poolerId: string; poolerName: string; entries: PlayoffPoolEntry[] }[]
}) {
  const [tab, setTab] = useState<'equipes' | 'alignements' | 'scoring'>('equipes')
  const [reminderPending, setReminderPending] = useState(false)
  const [reminderMsg, setReminderMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSendReminder() {
    setReminderPending(true)
    setReminderMsg(null)
    const r = await sendDeadlineReminderAction(saison.id)
    setReminderPending(false)
    if (r.error) setReminderMsg({ type: 'error', text: r.error })
    else setReminderMsg({ type: 'success', text: `Rappel envoyé à ${r.sent} pooler${(r.sent ?? 0) > 1 ? 's' : ''}.` })
    setTimeout(() => setReminderMsg(null), 4000)
  }

  const tabs = [
    { key: 'equipes' as const,     label: 'Équipes' },
    { key: 'alignements' as const, label: 'Alignements' },
    { key: 'scoring' as const,     label: 'Scoring' },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4 text-sm text-gray-600 flex flex-wrap items-center gap-4">
        <span>Composition : <strong>{saison.maxF}F / {saison.maxD}D / {saison.maxG}G</strong></span>
        <span>Changements volontaires max : <strong>{saison.maxChanges}</strong></span>
        <span>Changements élimination max : <strong>{saison.maxElimChanges}</strong></span>
        <span>Date limite : <strong>{saison.submissionDeadline ? new Date(saison.submissionDeadline).toLocaleString('fr-CA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' }) : 'Aucune'}</strong></span>
        {saison.submissionDeadline && new Date() < new Date(saison.submissionDeadline) && (
          <div className="ml-auto flex items-center gap-3">
            {reminderMsg && (
              <span className={`text-xs ${reminderMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {reminderMsg.text}
              </span>
            )}
            <button
              onClick={handleSendReminder}
              disabled={reminderPending}
              className="text-xs bg-amber-50 border border-amber-300 text-amber-700 px-3 py-1.5 rounded hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
            >
              {reminderPending ? 'Envoi...' : '🔔 Rappel de date limite'}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'equipes' && (
        <TeamsTab
          saison={saison}
          participatingTeamIds={participatingTeamIds}
          eliminations={eliminations}
          allTeams={allTeams}
        />
      )}
      {tab === 'alignements' && <AlignmentsTab allRosters={allRosters} saison={saison} />}
      {tab === 'scoring' && <ScoringTab poolSeasonId={saison.id} />}
    </div>
  )
}
