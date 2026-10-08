'use client'

import { createContext, useContext } from 'react'

// Budgets de signatures d'agents libres de la saison active (pool_seasons.max_signatures_al /
// max_signatures_ltir) — fournis par page.tsx via AideTabs, pour que les Règlements affichent
// toujours les valeurs en vigueur. null : aucune saison active.
export type SigningLimits = { al: number; ltir: number }
export const SigningLimitsContext = createContext<SigningLimits | null>(null)

function signatures(n: number): string {
  return `${n} signature${n > 1 ? 's' : ''}`
}

export default function SigningLimitsContent() {
  const limits = useContext(SigningLimitsContext)
  return (
    <ul className="text-sm text-gray-700 space-y-1.5">
      <li>
        • Une fois la saison démarrée, tu as <strong>deux budgets</strong>{' '}de signatures d&apos;agents libres
        {limits ? <> : <strong>{signatures(limits.al)}</strong> « standard » et <strong>{signatures(limits.ltir)}</strong> « LTIR »</> : null}.
        Les compteurs sont affichés en haut de Gestion d&apos;effectifs.
      </li>
      <li>• <strong>Standard</strong> : à utiliser comme tu veux (action <strong>Signature</strong>) — combler un poste, remplacer un joueur moins productif, ajouter un réserviste.</li>
      <li>• <strong>LTIR</strong> : réservé au remplacement d&apos;un joueur mis sur le LTIR (action <strong>LTIR + signature</strong>, approuvée par l&apos;administrateur).</li>
      <li>
        • Quand le budget LTIR est épuisé, une <strong>LTIR + signature</strong> utilise ton budget standard.
        {limits ? <>{' '}Avec beaucoup de blessures, tu peux donc remplacer jusqu&apos;à <strong>{limits.al + limits.ltir} joueurs</strong> mis sur le LTIR, si tu n&apos;as fait aucune signature standard.</> : null}
        {' '}L&apos;inverse n&apos;est pas permis : une signature standard ne prend jamais dans le budget LTIR.
      </li>
      <li>• Un joueur obtenu au <strong>ballotage</strong> ou par <strong>échange</strong> ne compte dans aucun des deux budgets.</li>
    </ul>
  )
}
