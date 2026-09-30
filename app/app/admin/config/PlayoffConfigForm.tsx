'use client'

import { useState } from 'react'
import { updateCapAction } from './actions'

type Saison = {
  id: number
  season: string
  nhl_cap: number
  gestion_effectifs_ouvert?: boolean | null
  playoff_submission_deadline?: string | null
  playoff_max_changes?: number | null
  playoff_max_elim_changes?: number | null
  playoff_max_f?: number | null
  playoff_max_d?: number | null
  playoff_max_g?: number | null
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function PlayoffConfigForm({ saison }: { saison: Saison }) {
  const [cap, setCap] = useState(String(saison.nhl_cap))
  const [toolOuvert, setToolOuvert] = useState(saison.gestion_effectifs_ouvert ?? true)
  const [deadline, setDeadline] = useState(toDatetimeLocal(saison.playoff_submission_deadline))
  const [maxChanges, setMaxChanges] = useState(String(saison.playoff_max_changes ?? 5))
  const [maxElim, setMaxElim] = useState(String(saison.playoff_max_elim_changes ?? 5))
  const [maxF, setMaxF] = useState(String(saison.playoff_max_f ?? 5))
  const [maxD, setMaxD] = useState(String(saison.playoff_max_d ?? 3))
  const [maxG, setMaxG] = useState(String(saison.playoff_max_g ?? 1))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const capNum = parseFloat(cap) || 0

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const result = await updateCapAction(saison.id, capNum, 1, null, {
      gestionEffectifsOuvert: toolOuvert,
      playoffSubmissionDeadline: deadline ? new Date(deadline).toISOString() : null,
      playoffMaxChanges: Math.max(0, parseInt(maxChanges) || 5),
      playoffMaxElimChanges: Math.max(0, parseInt(maxElim) || 5),
      playoffMaxF: Math.max(1, parseInt(maxF) || 5),
      playoffMaxD: Math.max(1, parseInt(maxD) || 3),
      playoffMaxG: Math.max(1, parseInt(maxG) || 1),
    })
    setSaving(false)
    if (result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: 'Configuration mise à jour.' })
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">

      {/* Cap et deadline */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-orange-500 px-4 py-3 flex items-center gap-2">
          <span className="text-white text-sm font-bold">{saison.season}</span>
          <span className="text-xs bg-white text-orange-600 px-1.5 py-0.5 rounded font-bold leading-none">Séries · Active</span>
        </div>
        <div className="divide-y divide-gray-100">
          <div className="px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">Cap du pool des séries ($)</p>
            <input type="number" min={1_000_000} step={1_000_000} value={cap}
              onChange={e => setCap(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Masse salariale maximale par sélection.</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">Date limite de soumission</p>
            <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} />
            <p className="text-xs text-gray-400 mt-1">Avant cette date : modifications libres. Après : changements limités.</p>
          </div>
        </div>
      </div>

      {/* Composition requise */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-slate-100 px-4 py-3 border-b">
          <span className="text-sm font-semibold text-gray-700">Composition requise</span>
        </div>
        <div className="px-4 py-4 grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Attaquants requis</p>
            <input type="number" min={1} value={maxF} onChange={e => setMaxF(e.target.value)} className={inputCls} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Défenseurs requis</p>
            <input type="number" min={1} value={maxD} onChange={e => setMaxD(e.target.value)} className={inputCls} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Gardiens requis</p>
            <input type="number" min={1} value={maxG} onChange={e => setMaxG(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Changements et accès */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-slate-100 px-4 py-3 border-b">
          <span className="text-sm font-semibold text-gray-700">Changements et accès</span>
        </div>
        <div className="divide-y divide-gray-100">
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Outil de sélection des séries ouvert</p>
              <p className="text-xs text-gray-400 mt-0.5">Si désactivé, seul l&apos;admin y a accès.</p>
            </div>
            <button type="button" onClick={() => setToolOuvert(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${toolOuvert ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${toolOuvert ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Changements volontaires max</p>
              <input type="number" min={0} value={maxChanges} onChange={e => setMaxChanges(e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Changements élimination max</p>
              <input type="number" min={0} value={maxElim} onChange={e => setMaxElim(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>
      </div>

      <button type="submit" disabled={saving || capNum < 1_000_000}
        className="w-full max-w-2xl bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>

      {message && (
        <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>
      )}
    </form>
  )
}
