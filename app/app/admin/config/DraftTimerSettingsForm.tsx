'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_TURN_SECONDS, MAX_TURN_SECONDS, MIN_TURN_SECONDS } from '@/lib/draftTimers'
import { getDraftTurnSecondsAction, updateDraftTurnSecondsAction } from '../repechage/actions'

// Durées des chronos de repêchage (David, 2026-10-02) — à ajuster selon ce qui sera décidé avec
// les poolers. Les chronos sont indicatifs : rien ne se passe automatiquement à 00:00.
const FIELDS = [
  { key: 'rookie', label: 'Repêchage des recrues' },
  { key: 'presaison', label: 'Signatures des agents libres' },
] as const

type Key = typeof FIELDS[number]['key']

export default function DraftTimerSettingsForm() {
  const [values, setValues] = useState<Record<Key, string> | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    getDraftTurnSecondsAction().then(v => {
      if (!cancelled) setValues({ rookie: String(v.rookie), presaison: String(v.presaison) })
    })
    return () => { cancelled = true }
  }, [])

  const handleSave = async () => {
    if (!values) return
    setSaving(true); setMsg(null)
    const result = await updateDraftTurnSecondsAction({ rookie: Number(values.rookie), presaison: Number(values.presaison) })
    setSaving(false)
    setMsg(result.error ? { text: result.error, error: true } : { text: 'Durées enregistrées', error: false })
  }

  return (
    <div className="bg-white rounded-lg shadow p-5 space-y-3 mt-6">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Chronos des repêchages</h2>
        <p className="text-xs text-gray-500 mt-1">
          Durée d&apos;un tour, en secondes ({DEFAULT_TURN_SECONDS}{' '}par défaut). Le chrono est indicatif : à 00:00, rien ne se passe automatiquement. Un changement s&apos;applique à partir du tour suivant.
        </p>
      </div>
      {!values ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          {FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={MIN_TURN_SECONDS} max={MAX_TURN_SECONDS} step={5}
                  value={values[f.key]}
                  onChange={e => setValues(v => (v ? { ...v, [f.key]: e.target.value } : v))}
                  className="w-24 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-400">secondes</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving || !values}
          className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-40">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {msg && <span className={`text-xs ${msg.error ? 'text-red-700' : 'text-green-700'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
