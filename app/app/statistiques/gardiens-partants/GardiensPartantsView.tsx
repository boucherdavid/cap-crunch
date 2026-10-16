'use client'

import { useEffect, useState } from 'react'
import TeamBadge from '@/components/TeamBadge'
import PlayerLink from '@/components/PlayerLink'
import type { GoalieSide, Verdict, GoalieOwner, StartingGoalies } from '@/lib/startingGoalies'

const POLL_MS = 5 * 60_000

/** Resonder tant qu'un match de la soirée n'est pas commencé : après le début, le partant est connu. */
function needsPolling(data: StartingGoalies): boolean {
  return data.games.some(g => g.state === 'FUT' || g.state === 'PRE')
}

/**
 * Rafraîchissement automatique (David, 2026-10-16) : aux 5 minutes, onglet visible seulement,
 * par `/statistiques/gardiens-partants/donnees` (JSON) — jamais un rechargement de la page.
 * Côté serveur, les deux sites sont en cache 10 minutes ; la base n'est lue que pour la version
 * des alignements (une ligne de `data_versions`).
 */
function useStartingGoalies(initial: StartingGoalies): StartingGoalies {
  const [data, setData] = useState(initial)
  useEffect(() => {
    let cancelled = false
    let current = initial
    const refresh = async () => {
      if (document.hidden || !needsPolling(current)) return
      try {
        const res = await fetch('/statistiques/gardiens-partants/donnees', { cache: 'no-store' })
        if (!res.ok) return
        const next = (await res.json()) as StartingGoalies
        if (cancelled) return
        current = next
        setData(next)
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
  return data
}

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  confirme:       { label: 'Confirmé',        className: 'text-emerald-700 bg-emerald-100' },
  probable:       { label: 'Probable',        className: 'text-sky-700 bg-sky-100' },
  incertain:      { label: 'Non confirmé',    className: 'text-gray-600 bg-gray-100' },
  desaccord:      { label: 'Sources en désaccord', className: 'text-amber-700 bg-amber-100' },
  non_disponible: { label: 'Non disponible',  className: 'text-gray-400 bg-gray-50' },
}

const TYPE_LABEL: Record<string, string> = { actif: 'actif', reserviste: 'réserviste', recrue: 'recrue', ltir: 'LTIR' }

function fmtStart(utc: string): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(utc)).replace(':', 'h') + ' ET'
}

function fmtDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

function OwnerTag({ owner }: { owner: GoalieOwner | undefined }) {
  if (!owner) return <span className="text-xs text-gray-400">Disponible</span>
  return (
    <span className="text-xs font-semibold text-violet-700">
      {owner.poolerName} <span className="font-normal text-gray-400">({TYPE_LABEL[owner.playerType] ?? owner.playerType})</span>
    </span>
  )
}

function SourceLine({ source, name, label, extra }: { source: string; name: string | null; label: string | null; extra?: React.ReactNode }) {
  return (
    <p className="text-xs text-gray-500">
      <span className="font-semibold text-gray-600">{source} :</span>{' '}
      {name ? <>{name}{label ? ` · ${label}` : ''}</> : <span className="text-gray-400">non disponible</span>}
      {extra}
    </p>
  )
}

function SideRow({ side, sourcesOk }: { side: GoalieSide; sourcesOk: { dailyFaceoff: boolean; goaliepost: boolean } }) {
  const v = VERDICT[side.verdict]
  const gp = side.goaliepost
  const dfo = side.dfo
  return (
    <div className="px-4 py-3 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <TeamBadge code={side.teamAbbrev} size="sm" />
        {side.goalie ? (
          <span className="font-semibold text-gray-800">
            <PlayerLink nhlId={side.goalie.nhlId}>{side.goalie.name}</PlayerLink>
          </span>
        ) : side.verdict === 'desaccord' ? (
          <span className="font-semibold text-gray-800">{dfo?.name} ou {gp?.name}</span>
        ) : (
          <span className="text-gray-400">Gardien pas encore annoncé</span>
        )}
        <span className={`text-xs font-bold rounded px-1.5 py-0.5 ${v.className}`}>{v.label}</span>
        {gp?.backToBack && (
          <span className="text-xs font-semibold text-orange-700 bg-orange-100 rounded px-1.5 py-0.5" title="Deuxième match en deux soirs">
            Back-to-back
          </span>
        )}
      </div>
      {side.goalie?.nhlId ? (
        <OwnerTag owner={side.owners[side.goalie.nhlId]} />
      ) : side.verdict === 'desaccord' ? (
        <p className="text-xs text-gray-500 space-x-3">
          {[dfo, gp].map(g => g && (
            <span key={g.name}>{g.name} : <OwnerTag owner={g.nhlId ? side.owners[g.nhlId] : undefined} /></span>
          ))}
        </p>
      ) : null}
      <div className="pt-1">
        <SourceLine
          source="Daily Faceoff"
          name={sourcesOk.dailyFaceoff ? dfo?.name ?? null : null}
          label={dfo?.label ?? (dfo ? 'statut pas encore indiqué' : null)}
          extra={dfo?.newsSource && (
            <> · {dfo.newsUrl
              ? <a href={dfo.newsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{dfo.newsSource}</a>
              : dfo.newsSource}</>
          )}
        />
        <SourceLine
          source="Goaliepost"
          name={sourcesOk.goaliepost ? gp?.name ?? null : null}
          label={gp?.label ? gp.label.charAt(0) + gp.label.slice(1).toLowerCase() : null}
          extra={gp?.projectedSaves ? <> · {gp.projectedSaves} arrêts projetés</> : null}
        />
      </div>
    </div>
  )
}

export default function GardiensPartantsView({ initial }: { initial: StartingGoalies }) {
  const data = useStartingGoalies(initial)
  const noSource = !data.sources.dailyFaceoff && !data.sources.goaliepost

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-gray-600 first-letter:uppercase">{fmtDate(data.date)}</p>
        <p className="text-xs text-gray-400">
          Sources :{' '}
          <a href="https://www.dailyfaceoff.com/starting-goalies" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Daily Faceoff</a>
          {' '}et{' '}
          <a href="https://goaliepost.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Goaliepost (DobberHockey)</a>
          {' '}· la page se met à jour toute seule
        </p>
      </div>

      <p className="text-xs text-gray-500">
        Confirmé : au moins une source confirme le partant. Probable : partant prévu, pas encore confirmé.
        Sources en désaccord : les deux sites ne prévoient pas le même gardien.
      </p>

      {(!data.sources.dailyFaceoff || !data.sources.goaliepost) && !noSource && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
          {!data.sources.dailyFaceoff ? 'Daily Faceoff' : 'Goaliepost'}{' '}n&apos;est pas disponible pour l&apos;instant : seule l&apos;autre source est affichée.
        </p>
      )}

      {data.error ? (
        <p className="bg-white rounded-lg shadow p-6 text-sm text-gray-500">
          Le calendrier de la LNH n&apos;est pas disponible pour l&apos;instant. Réessaie dans quelques minutes.
        </p>
      ) : data.games.length === 0 ? (
        <p className="bg-white rounded-lg shadow p-6 text-sm text-gray-500">Aucun match ce soir.</p>
      ) : (
        <>
          {noSource && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
              Les gardiens partants ne sont pas disponibles pour l&apos;instant : aucune des deux sources ne répond.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.games.map(g => (
              <div key={g.gameId} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-slate-700 px-4 py-2 flex items-center justify-between text-white text-sm">
                  <span className="font-bold">{g.away.teamAbbrev} @ {g.home.teamAbbrev}</span>
                  <span className="text-slate-300 text-xs">{fmtStart(g.startUTC)}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  <SideRow side={g.away} sourcesOk={data.sources} />
                  <SideRow side={g.home} sourcesOk={data.sources} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
