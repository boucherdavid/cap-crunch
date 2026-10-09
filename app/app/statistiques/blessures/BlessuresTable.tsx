'use client'

import { Fragment, useMemo, useState } from 'react'
import TeamBadge from '@/components/TeamBadge'
import PlayerLink from '@/components/PlayerLink'
import { normalizeSearch } from '@/lib/normalizeSearch'
import type { InjuryRow } from './page'

const OWNER_LABEL: Record<'actif' | 'reserviste' | 'recrue' | 'ltir', string> = {
  actif: 'Actif', reserviste: 'Réserviste', recrue: 'Recrue', ltir: 'LTIR',
}
const OWNER_CLS: Record<'actif' | 'reserviste' | 'recrue' | 'ltir', string> = {
  actif: 'bg-slate-100 text-slate-700',
  reserviste: 'bg-slate-100 text-slate-600',
  recrue: 'bg-amber-50 text-amber-700',
  ltir: 'bg-red-50 text-red-600',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
}

function fmtTs(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
}

/** Statuts officiels MoneyPuck (liste des blessés de l'équipe LNH). */
const MP_STATUS_LABEL: Record<string, string> = {
  'IR-LT': 'LTIR (liste des blessés à long terme)',
  'IR': 'Liste des blessés',
  'IR-NR': 'Liste des blessés (hors effectif)',
  'DTD': 'Au jour le jour',
  'O': 'Absent',
  'DD': 'Décision le jour du match',
}

/** Statut affiché : texte CBS, sinon celui d'ESPN, sinon le statut MoneyPuck. */
function displayStatus(r: InjuryRow): string {
  return r.status || r.espnStatusDesc || (r.mp?.status ? (MP_STATUS_LABEL[r.mp.status] ?? r.mp.status) : '') || '—'
}

/** Dates de retour annoncées par chaque source, côte à côte (David, 2026-10-01) — par
 * transparence : la date retenue pour le calcul reste CBS, sinon ESPN, sinon MoneyPuck, mais
 * l'admin approuve de toute façon chaque mise sur LTIR. */
function ReturnDates({ r }: { r: InjuryRow }) {
  const dates = [
    { label: 'CBS', date: r.cbsReturnDate, cls: 'text-blue-700' },
    { label: 'ESPN', date: r.espnEstReturnDate, cls: 'text-rose-700' },
    { label: 'MoneyPuck', date: r.mp?.returnDate ?? null, cls: 'text-teal-700' },
  ].filter(d => d.date)
  if (dates.length === 0) return <span className="text-gray-300">—</span>
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
      {dates.map(d => (
        <span key={d.label} className="whitespace-nowrap">
          <span className={`text-[10px] font-semibold ${d.cls}`}>{d.label}</span> {fmtDate(d.date)}
        </span>
      ))}
    </span>
  )
}

function UnconfirmedBadge() {
  return (
    <span
      className="ml-1.5 inline-block text-[10px] font-bold bg-gray-100 text-gray-500 rounded px-1 py-0.5 cursor-help"
      title="Une seule source rapporte cette blessure : le joueur n'est pas encore considéré blessé (ni badge ni admissibilité LTIR) tant qu'une deuxième source ne le confirme pas."
    >
      À confirmer
    </span>
  )
}

/** Pastilles des sources qui rapportent la blessure — cliquables pour déplier le détail ; une
 * source grisée ne liste pas le joueur. Il faut au moins 2 sources sur 3 pour que la blessure
 * soit considérée confirmée. */
function SourceToggle({ r, open, onToggle }: { r: InjuryRow; open: boolean; onToggle: () => void }) {
  const hasEspn = !!(r.espnStatusDesc || r.espnEstReturnDate || r.espnNote)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title="Voir le détail par source"
      className="inline-flex items-center gap-1 text-[10px] font-semibold align-middle"
    >
      <span className={`rounded px-1 py-0.5 ${r.inCbs ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400 line-through'}`}>CBS</span>
      <span className={`rounded px-1 py-0.5 ${hasEspn ? 'bg-rose-50 text-rose-700' : 'bg-gray-100 text-gray-400 line-through'}`}>ESPN</span>
      <span className={`rounded px-1 py-0.5 ${r.mp ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-400 line-through'}`}>MoneyPuck</span>
      <span className="text-gray-400">{open ? '▴' : '▾'}</span>
    </button>
  )
}

function SourcesDetail({ r }: { r: InjuryRow }) {
  const hasEspn = !!(r.espnStatusDesc || r.espnEstReturnDate || r.espnNote)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
      <div className="rounded border border-blue-100 bg-blue-50/40 p-2">
        <p className="font-semibold text-blue-700 mb-1">CBS Sports</p>
        {r.inCbs ? (
          <>
            <p className="text-gray-700">{r.status || '—'}</p>
            <p className="text-gray-500 mt-1">Retour estimé : {fmtDate(r.cbsReturnDate)}{r.updatedLabel && <> · Mis à jour : {r.updatedLabel}</>}</p>
          </>
        ) : (
          <p className="text-gray-400">Joueur absent de la liste CBS.</p>
        )}
      </div>
      <div className="rounded border border-rose-100 bg-rose-50/40 p-2">
        <p className="font-semibold text-rose-700 mb-1">ESPN</p>
        {hasEspn ? (
          <>
            <p className="text-gray-700">{r.espnStatusDesc || '—'}{r.espnNote && r.espnNote.toLowerCase() !== (r.espnStatusDesc ?? '').toLowerCase() && <> — {r.espnNote}</>}</p>
            <p className="text-gray-500 mt-1">Retour estimé : {fmtDate(r.espnEstReturnDate)}</p>
          </>
        ) : (
          <p className="text-gray-400">Joueur absent de la liste ESPN.</p>
        )}
      </div>
      <div className="rounded border border-teal-100 bg-teal-50/40 p-2">
        <p className="font-semibold text-teal-700 mb-1">MoneyPuck</p>
        {r.mp ? (
          <>
            <p className="text-gray-700">
              {r.mp.status ? (MP_STATUS_LABEL[r.mp.status] ?? r.mp.status) : '—'}
              {r.mp.description && <> — {r.mp.description}</>}
            </p>
            <p className="text-gray-500 mt-1">
              Retour estimé : {fmtDate(r.mp.returnDate)}
              {r.mp.gamesToMiss != null && <> · Matchs à manquer : {r.mp.gamesToMiss}</>}
              {r.mp.gamesMissed != null && <> · Manqués : {r.mp.gamesMissed}</>}
            </p>
          </>
        ) : (
          <p className="text-gray-400">Joueur absent de la liste MoneyPuck.</p>
        )}
      </div>
      <p className="sm:col-span-3 text-[11px] text-gray-400">Suivi depuis le {fmtTs(r.firstSeenAt)} — une blessure est confirmée quand au moins 2 sources sur 3 la rapportent. Le calcul d&apos;admissibilité LTIR retient la date CBS (sinon ESPN, sinon MoneyPuck), et l&apos;admin approuve chaque mise sur LTIR ; un joueur confirmé sur la liste des blessés de son équipe est toujours admissible.</p>
    </div>
  )
}

export default function BlessuresTable({ rows, myPoolerId }: { rows: InjuryRow[]; myPoolerId: string | null }) {
  const [search, setSearch] = useState('')
  const [availOnly, setAvailOnly] = useState(false)
  const [mineOnly, setMineOnly] = useState(false)
  const [eligibleOnly, setEligibleOnly] = useState(false)
  const [confirmedOnly, setConfirmedOnly] = useState(false)
  const [openIds, setOpenIds] = useState<Set<number>>(new Set())
  const toggle = (id: number) => setOpenIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim())
    return rows
      .filter(r => {
        if (availOnly && r.owner) return false
        if (mineOnly && r.owner?.poolerId !== myPoolerId) return false
        if (eligibleOnly && !r.eligible) return false
        if (confirmedOnly && !r.confirmed) return false
        if (q) {
          const name = normalizeSearch(`${r.firstName} ${r.lastName}`)
          const rev = normalizeSearch(`${r.lastName} ${r.firstName}`)
          if (!name.includes(q) && !rev.includes(q) && !normalizeSearch(r.teamCode ?? '').includes(q)) return false
        }
        return true
      })
      .sort((a, b) => (a.teamCode ?? '').localeCompare(b.teamCode ?? '') || a.lastName.localeCompare(b.lastName))
  }, [rows, search, availOnly, mineOnly, myPoolerId, eligibleOnly, confirmedOnly])

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          {/* Titre : bandeau de section du layout (SectionEyebrow). */}
          <p className="text-xs text-gray-400">Sources : CBS Sports, ESPN et MoneyPuck.com (blessure confirmée par au moins 2 sources sur 3) — mise à jour quotidienne</p>
        </div>
        <span className="text-sm text-gray-500">{filtered.length} joueur{filtered.length > 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Nom ou équipe"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        <button
          type="button"
          onClick={() => { setAvailOnly(v => !v); setMineOnly(false) }}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
            availOnly
              ? 'border-green-500 bg-green-50 text-green-700 font-medium'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Disponibles seulement
        </button>
        {/* « Mes joueurs » et « Disponibles » s'excluent : ensemble, la liste serait toujours vide. */}
        {myPoolerId && (
          <button
            type="button"
            onClick={() => { setMineOnly(v => !v); setAvailOnly(false) }}
            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
              mineOnly
                ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Mes joueurs seulement
          </button>
        )}
        <button
          type="button"
          onClick={() => setEligibleOnly(v => !v)}
          className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
            eligibleOnly
              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-medium'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Admissibles LTIR seulement
        </button>
        <button
          type="button"
          onClick={() => setConfirmedOnly(v => !v)}
          className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
            confirmedOnly
              ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Confirmées seulement
        </button>
      </div>

      {/* Portrait : une fiche par joueur plutôt qu'un tableau de 7 colonnes au statut en texte
          long (David, 2026-09-28) ; le tableau reprend à partir de sm (paysage/desktop). */}
      <ul className="sm:hidden bg-white rounded-lg shadow divide-y divide-gray-100">
        {filtered.map(r => (
          <li key={r.playerId} className="px-3 py-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-gray-800 min-w-0">
                <PlayerLink nhlId={r.nhlId}>{r.lastName}, {r.firstName}</PlayerLink>
                <span className="ml-1 text-[11px] font-normal text-gray-400">{[r.teamCode, r.position].filter(Boolean).join(' · ')}</span>
              </span>
              {r.backInAction && <span className="shrink-0 text-[10px] font-bold bg-sky-100 text-sky-700 rounded px-1.5 py-0.5">De retour au jeu</span>}
              {r.eligible && <span className="shrink-0 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">LTIR</span>}
            </div>
            <p className="text-red-600 text-xs mt-0.5">{r.injuryType}</p>
            <p className="text-gray-600 text-xs mt-0.5">
              {displayStatus(r)}
              {!r.confirmed && <UnconfirmedBadge />}
              {r.datesDisagree && <span className="ml-1 text-[10px] font-bold text-amber-700">⚠ ESPN : {fmtDate(r.espnEstReturnDate)}</span>}
            </p>
            <p className="text-gray-600 text-xs mt-0.5">Retour : <ReturnDates r={r} /></p>
            <div className="mt-1"><SourceToggle r={r} open={openIds.has(r.playerId)} onToggle={() => toggle(r.playerId)} /></div>
            {openIds.has(r.playerId) && <div className="mt-1.5"><SourcesDetail r={r} /></div>}
            <p className="mt-1 text-xs">
              {r.owner
                ? <><span className={`rounded px-1.5 py-0.5 font-medium ${OWNER_CLS[r.owner.playerType]}`}>{OWNER_LABEL[r.owner.playerType]}</span> <span className="text-gray-500">{r.owner.poolerName}</span></>
                : <span className="text-green-600 font-medium">● Disponible</span>}
            </p>
          </li>
        ))}
        {filtered.length === 0 && <li className="text-center py-10 text-gray-400 text-sm">Aucun joueur ne correspond aux filtres.</li>}
      </ul>

      <div className="hidden sm:block bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto max-h-[75vh]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left sticky top-0 z-10">
                <th className="px-4 py-2.5 font-medium text-gray-600">Joueur</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 w-16">Équipe</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 w-14">Pos</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 w-32">Blessure</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Statut</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 w-44">Retour estimé</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 w-28">LTIR</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 w-32">Dans le pool</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <Fragment key={r.playerId}>
                <tr className={`${openIds.has(r.playerId) ? '' : 'border-b last:border-0'} hover:bg-gray-50`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    <PlayerLink nhlId={r.nhlId}>{r.lastName}, {r.firstName}</PlayerLink>
                  </td>
                  <td className="px-4 py-2.5"><TeamBadge code={r.teamCode} size="sm" /></td>
                  <td className="px-4 py-2.5 text-gray-500">{r.position ?? '—'}</td>
                  <td className="px-4 py-2.5 text-red-600">{r.injuryType}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">
                    {displayStatus(r)}
                    {!r.confirmed && <UnconfirmedBadge />}
                    {r.datesDisagree && (
                      <span
                        className="ml-1.5 inline-block text-[10px] font-bold bg-amber-100 text-amber-700 rounded px-1 py-0.5 cursor-help"
                        title="CBS et ESPN annoncent des dates de retour à plusieurs jours d'écart — l'admissibilité LTIR se base sur CBS."
                      >
                        ⚠ ESPN : {fmtDate(r.espnEstReturnDate)}
                      </span>
                    )}
                    <div className="mt-1"><SourceToggle r={r} open={openIds.has(r.playerId)} onToggle={() => toggle(r.playerId)} /></div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs"><ReturnDates r={r} /></td>
                  <td className="px-4 py-2.5">
                    {r.backInAction
                      ? <span className="text-xs font-bold bg-sky-100 text-sky-700 rounded px-1.5 py-0.5" title="Encore listé blessé, mais il a rejoué récemment — pas admissible au LTIR">De retour au jeu</span>
                      : r.eligible
                        ? <span className="text-xs font-bold bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">Admissible</span>
                        : <span className="text-xs text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    {r.owner
                      ? <span className="inline-flex items-center gap-1">
                          <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${OWNER_CLS[r.owner.playerType]}`}>
                            {OWNER_LABEL[r.owner.playerType]}
                          </span>
                          <span className="text-xs text-gray-500">{r.owner.poolerName}</span>
                        </span>
                      : <span className="inline-flex items-center gap-1.5 text-xs text-green-600 font-medium">
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                          Disponible
                        </span>
                    }
                  </td>
                </tr>
                {openIds.has(r.playerId) && (
                  <tr className="border-b last:border-0 bg-gray-50/60">
                    <td colSpan={8} className="px-4 pb-3 pt-1"><SourcesDetail r={r} /></td>
                  </tr>
                )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400 text-sm">
                    Aucun joueur ne correspond aux filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
