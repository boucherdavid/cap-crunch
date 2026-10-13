'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { computeCapFactorAction, applyCapFactorAction } from './cap-factor-actions'
import type { CapFactorResult } from '@/lib/capFactor'

const money = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const millions = (n: number) => `${(n / 1_000_000).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} M$`
const dec = (n: number, d = 2) => n.toLocaleString('fr-CA', { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (n: number) => `${(n * 100).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} %`

const SCENARIO_TEXT: Record<number, { title: string; text: string }> = {
  0:   { title: 'On attend les renouvellements', text: 'Aucun coussin : seule la difficulté du pool est maintenue.' },
  0.5: { title: 'Recommandé', text: 'La moitié de la hausse des salaires à venir est accordée d\'avance.' },
  1:   { title: 'Toute la hausse d\'un coup', text: 'Toute la hausse des salaires à venir est accordée dès maintenant.' },
}

// Calcul du facteur de plafond d'une saison (David, 2026-10-13) — méthode : /aide, Règlements →
// Plafond salarial ; calcul : lib/capFactor.ts.
export default function CapFactorPanel({ saisonId, season, onClose }: { saisonId: number; season: string; onClose: () => void }) {
  const router = useRouter()
  const [pressure, setPressure] = useState('0.76')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CapFactorResult | null>(null)
  const [applied, setApplied] = useState<string | null>(null)

  const handleCompute = async () => {
    setBusy(true); setError(null); setApplied(null)
    const res = await computeCapFactorAction(saisonId, Number(pressure.replace(',', '.')))
    setBusy(false)
    if (res.error || !res.result) { setError(res.error ?? 'Calcul impossible.'); return }
    setResult(res.result)
  }

  const handleApply = async (factor: number, poolCap: number) => {
    if (!result) return
    const oldCap = Math.ceil((result.nhlCap * result.currentFactor) / 1_000_000) * 1_000_000
    if (!window.confirm(
      `Utiliser le facteur ${dec(factor)} pour ${season} ?\n\n` +
      `Plafond du pool : ${money(oldCap)} → ${money(poolCap)}`,
    )) return
    setBusy(true); setError(null)
    const res = await applyCapFactorAction(saisonId, factor)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    setResult({ ...result, currentFactor: factor })
    setApplied(`Facteur ${dec(factor)} en vigueur pour ${season} — plafond du pool : ${money(poolCap)}.`)
    router.refresh()
  }

  return (
    <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-800">Calculer le facteur — {season}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Équipe de rêve de 8 alignements classés selon les points du pool des deux saisons précédentes. Explication complète dans l&apos;aide (Règlements → Plafond salarial).
          </p>
        </div>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">Fermer</button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-600">
          Taux de pression visé (P̄)
          <input
            value={pressure}
            onChange={e => setPressure(e.target.value)}
            className="block mt-1 border rounded-lg px-2 py-1.5 text-sm w-24 bg-white focus:outline-none"
          />
        </label>
        <button
          onClick={handleCompute}
          disabled={busy}
          className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy && !result ? 'Calcul en cours…' : result ? 'Recalculer' : 'Calculer'}
        </button>
        <span className="text-xs text-gray-400">0,76 = moyenne historique du pool. Le calcul prend quelques secondes.</span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {applied && <p className="text-sm text-emerald-700 font-medium">{applied}</p>}

      {result && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm text-gray-700 space-y-1.5">
            <p>
              <strong>1. Équipe de rêve :</strong> classement {result.statsSeasons[0]} + {result.statsSeasons[1]}, masse moyenne de{' '}
              {millions(result.natural * result.nhlCap)} par équipe (attaquants {millions(result.perTeam.F)}, défenseurs{' '}
              {millions(result.perTeam.D)}, gardiens {millions(result.perTeam.G)}, réservistes {millions(result.perTeam.R)}),
              soit <strong>N = {dec(result.natural, 3)}</strong> × le plafond LNH ({millions(result.nhlCap)}).
              {result.estimated > 0 && <span className="text-gray-500"> {result.estimated} joueur{result.estimated > 1 ? 's' : ''} sans contrat compté{result.estimated > 1 ? 's' : ''} au contrat précédent × le multiplicateur.</span>}
            </p>
            <p>
              <strong>2. Difficulté :</strong> P̄ × N = {dec(result.pressure)} × {dec(result.natural, 3)} = <strong>{dec(result.base, 3)}</strong>
            </p>
            <p>
              <strong>3. Hausse à venir :</strong> au prix du marché ({result.newContracts} nouveaux contrats de {result.season}), la même équipe
              coûterait {dec(result.market, 3)} au lieu de {dec(result.marketBase, 3)}, soit <strong>+{pct(result.uplift)}</strong>.
            </p>
            <p className="text-gray-500">
              Facteur de {result.previousSeason} : {result.previousFactor != null ? dec(result.previousFactor) : 'inconnu'} · en vigueur pour {result.season} : {dec(result.currentFactor)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {result.scenarios.map(s => {
              const info = SCENARIO_TEXT[s.lambda]
              const isCurrent = Math.abs(s.factor - result.currentFactor) < 0.001
              const recommended = s.lambda === 0.5
              return (
                <div key={s.lambda} className={`bg-white rounded-lg border p-4 flex flex-col gap-2 ${recommended ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">λ = {s.lambda === 0.5 ? '½' : s.lambda}</span>
                    {isCurrent && <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">En vigueur</span>}
                  </div>
                  <p className={`font-semibold ${recommended ? 'text-indigo-700' : 'text-gray-800'}`}>{info.title}</p>
                  <p className="text-xs text-gray-500">{info.text}</p>
                  <p className="text-2xl font-bold text-gray-900">{dec(s.factor)}</p>
                  <p className="text-sm text-gray-600">Plafond du pool : <strong>{money(s.poolCap)}</strong></p>
                  {s.delta != null && (
                    <p className="text-xs text-gray-500">
                      Écart avec {result.previousSeason} : {s.delta > 0 ? '+' : ''}{dec(s.delta)}
                    </p>
                  )}
                  {s.outOfBounds && s.bounded != null && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      Dépasse la variation permise de 0,05 par année. Valeur bornée : <strong>{dec(s.bounded)}</strong> ({money(s.boundedPoolCap!)}).
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => handleApply(s.factor, s.poolCap)}
                      disabled={busy || isCurrent}
                      className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
                    >
                      Utiliser {dec(s.factor)}
                    </button>
                    {s.outOfBounds && s.bounded != null && (
                      <button
                        onClick={() => handleApply(s.bounded!, s.boundedPoolCap!)}
                        disabled={busy || Math.abs(s.bounded - result.currentFactor) < 0.001}
                        className="text-xs px-2.5 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-40"
                      >
                        Utiliser {dec(s.bounded)} (borné)
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
