'use client'

import { useState } from 'react'
import type { LtirSettings } from '@/lib/ltirEligibility'
import { updateLtirSettingsAction } from './cap-watch-actions'

// Réglages d'admissibilité LTIR (David, 2026-09-25) — sujets à changement après discussion avec
// les poolers. /aide (Règlements → Blessures et LTIR) affiche toujours les valeurs courantes.
const FIELDS: { key: keyof LtirSettings; label: string; help: string }[] = [
  { key: 'returnMinDays', label: 'Retour annoncé dans au moins', help: 'jours → admissible' },
  { key: 'injuredMinDays', label: 'Blessé depuis au moins', help: 'jours (sans date de retour proche) → admissible' },
  { key: 'graceDays', label: 'Période tampon après la date de retour', help: 'jours avant de considérer la blessure prolongée' },
  { key: 'disagreementDays', label: 'Écart CBS/ESPN signalé à partir de', help: 'jours (marqueur ⚠, informatif)' },
  { key: 'removalAbsenceDays', label: 'Retrait après absence de CBS pendant', help: 'jours consécutifs (compteur remis à zéro)' },
]

export default function LtirSettingsForm({ initialSettings }: { initialSettings: LtirSettings }) {
  const [values, setValues] = useState<Record<keyof LtirSettings, string>>(
    () => Object.fromEntries(FIELDS.map(f => [f.key, String(initialSettings[f.key])])) as Record<keyof LtirSettings, string>,
  )
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setMsg(null)
    const settings = Object.fromEntries(FIELDS.map(f => [f.key, Number(values[f.key])])) as LtirSettings
    const result = await updateLtirSettingsAction(settings)
    setSaving(false)
    setMsg(result.error ? `Erreur : ${result.error}` : 'Réglages enregistrés.')
    setTimeout(() => setMsg(null), 4000)
  }

  return (
    <div className="bg-white rounded-lg shadow p-5 space-y-3">
      <p className="text-xs text-gray-500">
        Un joueur placé sur IR par son équipe LNH est toujours admissible, peu importe ces réglages.
        Les changements s&apos;appliquent immédiatement aux badges et à la page Aide ; le délai de
        retrait s&apos;applique au prochain passage quotidien du scraper.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        {FIELDS.map(f => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={90} step={1}
                value={values[f.key]}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                className="w-20 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">{f.help}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-40">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {msg && <span className={`text-sm ${msg.startsWith('Erreur') ? 'text-red-600' : 'text-emerald-600'}`}>{msg}</span>}
      </div>
    </div>
  )
}
