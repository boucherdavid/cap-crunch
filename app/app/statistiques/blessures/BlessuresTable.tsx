'use client'

import { useMemo, useState } from 'react'
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

export default function BlessuresTable({ rows }: { rows: InjuryRow[] }) {
  const [search, setSearch] = useState('')
  const [availOnly, setAvailOnly] = useState(false)
  const [eligibleOnly, setEligibleOnly] = useState(false)

  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim())
    return rows
      .filter(r => {
        if (availOnly && r.owner) return false
        if (eligibleOnly && !r.eligible) return false
        if (q) {
          const name = normalizeSearch(`${r.firstName} ${r.lastName}`)
          const rev = normalizeSearch(`${r.lastName} ${r.firstName}`)
          if (!name.includes(q) && !rev.includes(q) && !normalizeSearch(r.teamCode ?? '').includes(q)) return false
        }
        return true
      })
      .sort((a, b) => (a.teamCode ?? '').localeCompare(b.teamCode ?? '') || a.lastName.localeCompare(b.lastName))
  }, [rows, search, availOnly, eligibleOnly])

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Blessures LNH</h1>
          <p className="text-xs text-gray-400 mt-1">Source : CBS Sports (recoupé avec ESPN) — mise à jour quotidienne</p>
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
          onClick={() => setAvailOnly(v => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
            availOnly
              ? 'border-green-500 bg-green-50 text-green-700 font-medium'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Disponibles seulement
        </button>
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
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto max-h-[75vh]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left sticky top-0 z-10">
                <th className="px-4 py-2.5 font-medium text-gray-600">Joueur</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 w-16">Équipe</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 w-14">Pos</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 w-32">Blessure</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Statut</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 w-28">LTIR</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 w-32">Dans le pool</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.playerId} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    <PlayerLink nhlId={r.nhlId}>{r.lastName}, {r.firstName}</PlayerLink>
                  </td>
                  <td className="px-4 py-2.5"><TeamBadge code={r.teamCode} size="sm" /></td>
                  <td className="px-4 py-2.5 text-gray-500">{r.position ?? '—'}</td>
                  <td className="px-4 py-2.5 text-red-600">{r.injuryType}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">
                    {r.status}
                    {r.datesDisagree && (
                      <span
                        className="ml-1.5 inline-block text-[10px] font-bold bg-amber-100 text-amber-700 rounded px-1 py-0.5 cursor-help"
                        title="CBS et ESPN annoncent des dates de retour à 5 jours d'écart ou plus — l'admissibilité LTIR se base sur CBS."
                      >
                        ⚠ ESPN : {fmtDate(r.espnEstReturnDate)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.eligible
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
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-400 text-sm">
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
