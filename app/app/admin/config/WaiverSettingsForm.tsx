'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_WAIVER_CLAIM_DAYS, MAX_WAIVER_CLAIM_DAYS, MIN_WAIVER_CLAIM_DAYS, ordinalFr } from '@/lib/waiverSettings'
import { getWaiverClaimDaysAction, updateWaiverClaimDaysAction } from './waiver-settings-actions'

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

/** Jour de la semaine, N jours après un lundi (« mercredi », « lundi suivant »…). */
function weekday(offset: number): string {
  const name = WEEKDAYS[offset % 7]
  return offset >= 7 ? `${name} suivant` : name
}

// Délai de réclamation au ballotage (David, 2026-10-19) — déplacé de l'onglet Conformité cap de
// Gestion des effectifs, où il était difficile à trouver.
export default function WaiverSettingsForm() {
  const [value, setValue] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    getWaiverClaimDaysAction().then(v => { if (!cancelled) setValue(String(v)) })
    return () => { cancelled = true }
  }, [])

  const days = Number(value)
  const valid = Number.isInteger(days) && days >= MIN_WAIVER_CLAIM_DAYS && days <= MAX_WAIVER_CLAIM_DAYS

  const handleSave = async () => {
    if (value === null) return
    setSaving(true); setMsg(null)
    const result = await updateWaiverClaimDaysAction(days)
    setSaving(false)
    setMsg(result.error ? { text: result.error, error: true } : { text: 'Délai enregistré', error: false })
  }

  return (
    <div className="bg-white rounded-lg shadow p-5 space-y-3 mt-6">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Ballotage</h2>
        <p className="text-xs text-gray-500 mt-1">
          Nombre de jours pendant lesquels un joueur libéré en cours de saison reste réclamable ({DEFAULT_WAIVER_CLAIM_DAYS}{' '}par défaut).
          Un changement s&apos;applique aux prochaines libérations seulement : un ballotage déjà ouvert garde son délai.
        </p>
      </div>
      {value === null ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div>
          <label htmlFor="waiver-days" className="block text-xs font-medium text-gray-600 mb-1">Délai de réclamation</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="waiver-days"
              type="number" min={MIN_WAIVER_CLAIM_DAYS} max={MAX_WAIVER_CLAIM_DAYS} step={1}
              value={value}
              onChange={e => setValue(e.target.value)}
              className="w-20 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400">jours</span>
          </div>
          {valid && (
            <p className="text-xs text-gray-500 mt-2">
              Réclamable jusqu&apos;à 23 h 59 (heure de l&apos;Est) du {ordinalFr(days)}{' '}jour suivant la libération.
              Exemple : libéré un lundi, réclamable jusqu&apos;au {weekday(days)}{' '}23 h 59, attribué le {weekday(days + 1)}.
            </p>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving || value === null || !valid}
          className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-40">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {msg && <span className={`text-xs ${msg.error ? 'text-red-700' : 'text-green-700'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
