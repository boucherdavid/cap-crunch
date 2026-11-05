'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_SCRATCH_GOALIE_GAMES, DEFAULT_SCRATCH_SKATER_GAMES, MAX_SCRATCH_GAMES, MIN_SCRATCH_GAMES } from '@/lib/scratchSettings'
import { getScratchSettingsAction, updateScratchSettingsAction } from './scratch-settings-actions'

// Seuils du badge « laissé de côté » (David, 2026-11-04).
export default function ScratchSettingsForm() {
  const [skater, setSkater] = useState<string | null>(null)
  const [goalie, setGoalie] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    getScratchSettingsAction().then(s => {
      if (cancelled) return
      setSkater(String(s.skaterGames))
      setGoalie(String(s.goalieGames))
    })
    return () => { cancelled = true }
  }, [])

  const ok = (v: string | null) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= MIN_SCRATCH_GAMES && n <= MAX_SCRATCH_GAMES
  }
  const valid = ok(skater) && ok(goalie)

  const handleSave = async () => {
    setSaving(true); setMsg(null)
    const result = await updateScratchSettingsAction({ skaterGames: Number(skater), goalieGames: Number(goalie) })
    setSaving(false)
    setMsg(result.error ? { text: result.error, error: true } : { text: 'Seuils enregistrés', error: false })
  }

  const input = 'w-20 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="bg-white rounded-lg shadow p-5 space-y-3 mt-6">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Joueurs laissés de côté</h2>
        <p className="text-xs text-gray-500 mt-1">
          Un badge « Scratch » (healthy scratch) apparaît sur un joueur de l&apos;alignement d&apos;une équipe de la LNH qui n&apos;a joué aucun
          des derniers matchs de son équipe sans être blessé. Nombre de matchs consécutifs avant le badge
          ({DEFAULT_SCRATCH_SKATER_GAMES}{' '}pour les patineurs et {DEFAULT_SCRATCH_GOALIE_GAMES}{' '}pour les gardiens par défaut).
        </p>
      </div>
      {skater === null || goalie === null ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div className="flex flex-wrap gap-6">
          <div>
            <label htmlFor="scratch-skater" className="block text-xs font-medium text-gray-600 mb-1">Patineurs</label>
            <div className="flex items-center gap-2">
              <input id="scratch-skater" type="number" min={MIN_SCRATCH_GAMES} max={MAX_SCRATCH_GAMES} step={1}
                value={skater} onChange={e => setSkater(e.target.value)} className={input} />
              <span className="text-xs text-gray-400">matchs</span>
            </div>
          </div>
          <div>
            <label htmlFor="scratch-goalie" className="block text-xs font-medium text-gray-600 mb-1">Gardiens</label>
            <div className="flex items-center gap-2">
              <input id="scratch-goalie" type="number" min={MIN_SCRATCH_GAMES} max={MAX_SCRATCH_GAMES} step={1}
                value={goalie} onChange={e => setGoalie(e.target.value)} className={input} />
              <span className="text-xs text-gray-400">matchs</span>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving || skater === null || !valid}
          className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-40">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {msg && <span className={`text-xs ${msg.error ? 'text-red-700' : 'text-green-700'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
