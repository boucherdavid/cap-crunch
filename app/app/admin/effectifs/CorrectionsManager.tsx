'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  changeLotDateAction, changeMoveStatusAction, getCorrectionLotsAction, undoLotAction,
  type CorrectionLot, type CorrectionMove, type CorrectionStatus,
} from './correction-actions'

const STATUS_LABEL: Record<string, string> = { actif: 'Actif', reserviste: 'Réserviste', recrue: 'Banque de recrues', ltir: 'LTIR' }

function fmt(iso: string, withTime = true) {
  return new Date(iso).toLocaleString('fr-CA', {
    day: 'numeric', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'America/Toronto',
  })
}

function moveText(m: CorrectionMove) {
  const from = m.oldType ? STATUS_LABEL[m.oldType] ?? m.oldType : 'hors alignement'
  const to = m.newType ? STATUS_LABEL[m.newType] ?? m.newType : 'libéré'
  return `${from} → ${to}`
}

// Corrections de mouvements déjà faits par les poolers (David, 2026-11-05) — voir correction-actions.ts.
export default function CorrectionsManager({ poolers, saisonId }: { poolers: { id: string; name: string }[]; saisonId: number }) {
  const [poolerId, setPoolerId] = useState('')
  const [lots, setLots] = useState<CorrectionLot[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ lotId: number; text: string; kind: 'error' | 'warning' | 'ok' } | null>(null)

  const load = useCallback(async (id: string) => {
    if (!id) { setLots(null); return }
    setLoading(true)
    const res = await getCorrectionLotsAction(id, saisonId)
    setLoading(false)
    setLots(res.lots ?? [])
    if (res.error) setMsg({ lotId: 0, text: res.error, kind: 'error' })
  }, [saisonId])

  useEffect(() => { setMsg(null); load(poolerId) }, [poolerId, load])

  async function run(lotId: number, fn: () => Promise<{ error?: string; warning?: string }>, okText: string) {
    setBusy(lotId); setMsg(null)
    const res = await fn()
    setBusy(null)
    if (res.error) { setMsg({ lotId, text: res.error, kind: 'error' }); return }
    await load(poolerId)
    setMsg({ lotId, text: res.warning ?? okText, kind: res.warning ? 'warning' : 'ok' })
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-5 space-y-3">
        <p className="text-sm text-gray-600">
          Corrige un mouvement déjà enregistré par un pooler dans Gestion d&apos;effectifs (ou au ballotage) : changer sa date
          effective, changer le statut de destination d&apos;un joueur, ou annuler tout le lot. Le classement est recalculé et le
          pooler reçoit une notification. Les échanges entre poolers ne se corrigent pas ici.
        </p>
        <select
          value={poolerId}
          onChange={e => setPoolerId(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Choisis un pooler</option>
          {poolers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {msg && msg.lotId === 0 && <p className="text-sm text-red-700">{msg.text}</p>}
      </div>

      {loading && <p className="text-sm text-gray-400">Chargement…</p>}
      {!loading && lots && lots.length === 0 && (
        <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-5">Aucun mouvement de Gestion d&apos;effectifs pour ce pooler cette saison.</p>
      )}

      {!loading && lots?.map(lot => (
        <LotCard
          key={lot.transactionId}
          lot={lot}
          busy={busy === lot.transactionId}
          msg={msg && msg.lotId === lot.transactionId ? msg : null}
          onDate={date => run(lot.transactionId, () => changeLotDateAction(lot.transactionId, poolerId, date), 'Date corrigée')}
          onStatus={(logId, s) => run(lot.transactionId, () => changeMoveStatusAction(lot.transactionId, poolerId, logId, s), 'Statut corrigé')}
          onUndo={() => run(lot.transactionId, () => undoLotAction(lot.transactionId, poolerId), 'Lot annulé')}
        />
      ))}
    </div>
  )
}

function LotCard({ lot, busy, msg, onDate, onStatus, onUndo }: {
  lot: CorrectionLot
  busy: boolean
  msg: { text: string; kind: 'error' | 'warning' | 'ok' } | null
  onDate: (date: string) => void
  onStatus: (logId: number, s: CorrectionStatus) => void
  onUndo: () => void
}) {
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<Record<number, CorrectionStatus | ''>>({})
  const blocked = lot.blockedReason !== null

  return (
    <div className="bg-white rounded-lg shadow p-5 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold text-gray-800">En vigueur le {fmt(lot.effectiveAt)}</span>
          {lot.notes !== "Gestion d'effectifs" && <span className="ml-2 text-xs text-gray-500">({lot.notes})</span>}
        </div>
        <span className="text-xs text-gray-400">Saisi le {fmt(lot.loggedAt)}</span>
      </div>

      <ul className="divide-y divide-gray-100">
        {lot.moves.map(m => (
          <li key={m.logId} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-xs text-gray-400 w-10">{m.position ?? '—'}</span>
            <span className="font-medium text-gray-800">{m.playerName}</span>
            <span className="text-gray-500">{moveText(m)}</span>
            <span className="text-[11px] text-gray-400">{m.changeLabel}</span>
            {m.statusOptions.length > 0 && (
              <span className="ml-auto flex items-center gap-2">
                <select
                  value={status[m.logId] ?? ''}
                  onChange={e => setStatus(s => ({ ...s, [m.logId]: e.target.value as CorrectionStatus | '' }))}
                  className="border rounded px-2 py-1 text-xs"
                  aria-label={`Nouveau statut de ${m.playerName}`}
                >
                  <option value="">Changer le statut…</option>
                  {m.statusOptions.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <button
                  type="button"
                  disabled={busy || !status[m.logId]}
                  onClick={() => { const s = status[m.logId]; if (s) onStatus(m.logId, s) }}
                  className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                >
                  Appliquer
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {blocked ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">{lot.blockedReason}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            Nouvelle date effective
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          </label>
          <button
            type="button"
            disabled={busy || !date}
            onClick={() => onDate(date)}
            className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
          >
            Changer la date
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Annuler tout ce lot ? Chaque joueur revient à son état d\'avant et les lignes du journal sont retirées.')) onUndo()
            }}
            className="ml-auto text-xs px-3 py-1.5 rounded bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40"
          >
            Annuler le lot
          </button>
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        La nouvelle date prend effet à 8 h (heure de l&apos;Est), avant tous les matchs de la journée.
      </p>
      {busy && <p className="text-xs text-gray-400">En cours…</p>}
      {msg && (
        <p className={`text-xs ${msg.kind === 'error' ? 'text-red-700' : msg.kind === 'warning' ? 'text-amber-700' : 'text-green-700'}`}>{msg.text}</p>
      )}
    </div>
  )
}
