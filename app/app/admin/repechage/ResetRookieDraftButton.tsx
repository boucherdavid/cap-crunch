'use client'

import { useState } from 'react'
import { resetRookieDraftAction } from './actions'

/**
 * Zone de test du repêchage des recrues (David, 2026-10-02) — annule tous les choix déjà faits
 * de la saison pour pouvoir refaire le repêchage (ex : tester le bandeau du tour). Refusé côté
 * serveur dès que la saison est démarrée ; grisé ici dans ce cas.
 */
export default function ResetRookieDraftButton({
  saisonId, season, seasonStarted, usedCount,
}: {
  saisonId: number
  season: string
  seasonStarted: boolean
  usedCount: number
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const handleReset = async () => {
    if (!window.confirm(
      `Réinitialiser le repêchage des recrues ${season} ?\n\n` +
      `Les ${usedCount} choix déjà faits seront annulés : chaque recrue repêchée est retirée de l'alignement où elle se trouve (banque ou autre), et tous les choix redeviennent disponibles. ` +
      "L'ordre du repêchage et les propriétaires des choix ne changent pas.",
    )) return
    setBusy(true); setMessage(null)
    const result = await resetRookieDraftAction(saisonId)
    if (result.error) { setBusy(false); setMessage({ text: result.error, error: true }); return }
    window.location.reload()
  }

  return (
    <div className="mt-8 border-t border-red-200 pt-4">
      <h2 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1.5">Zone de test</h2>
      <p className="text-xs text-gray-500 mb-2 max-w-2xl">
        Annule tous les choix déjà faits pour {season}{' '}et retire les recrues repêchées des alignements, pour refaire le repêchage depuis le début. Possible seulement tant que la saison n&apos;est pas démarrée.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={busy || seasonStarted}
          onClick={handleReset}
          className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? '...' : 'Réinitialiser le repêchage des recrues'}
        </button>
        {seasonStarted && <span className="text-xs text-gray-500">La saison est démarrée</span>}
        {message && <span className={`text-xs ${message.error ? 'text-red-700' : 'text-green-700'}`}>{message.text}</span>}
      </div>
    </div>
  )
}
