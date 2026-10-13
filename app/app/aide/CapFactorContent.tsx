'use client'

import { createContext, useContext } from 'react'

// Facteur de plafond en vigueur (saison active) — fourni par page.tsx via AideTabs, pour que
// l'aide affiche toujours les valeurs réelles. null : aucune saison active. Méthode :
// calcul_salaire/resume_facteur.md ; calcul dans l'app : lib/capFactor.ts (David, 2026-10-13).
export type CapFactorInfo = { season: string; nhlCap: number; factor: number; poolCap: number }
export const CapFactorContext = createContext<CapFactorInfo | null>(null)

const money = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const dec = (n: number) => n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Formula({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs sm:text-sm bg-gray-50 border border-gray-200 rounded px-3 py-2 overflow-x-auto whitespace-nowrap">{children}</p>
}

export default function CapFactorContent() {
  const info = useContext(CapFactorContext)
  return (
    <div className="text-sm text-gray-700 space-y-4">
      <p>
        <strong>Plafond du pool = facteur × plafond LNH</strong>, arrondi au million supérieur.
        {info && <> En {info.season} : {dec(info.factor)} × {money(info.nhlCap)} = <strong>{money(info.poolCap)}</strong>.</>}
      </p>

      <div>
        <p className="font-semibold text-gray-800 mb-1">En bref : le calcul en 3 étapes</p>
        <ol className="space-y-1.5 list-decimal list-inside">
          <li>
            <strong>Coût d&apos;une équipe de rêve</strong> : on prend les meilleurs joueurs de la LNH selon les points
            du pool et on forme 8 alignements complets. En 2026-27, une équipe de rêve coûtait environ{' '}
            <strong>1,63 fois le plafond LNH</strong>.
          </li>
          <li>
            <strong>Niveau de difficulté</strong> : depuis les débuts du pool, chaque pooler peut se payer environ{' '}
            <strong>76 %</strong> d&apos;une équipe de rêve. On garde ce niveau : 76 % × 1,63 ≈ <strong>1,24</strong>.
          </li>
          <li>
            <strong>Coussin pour la hausse des salaires</strong>{' '}: plusieurs vedettes ont encore un contrat signé quand
            le plafond était bas. Leurs renouvellements feront grimper la facture (environ 7 % en 2026-27). On en
            accorde la moitié d&apos;avance : 1,24 × 1,035 ≈ <strong>1,28</strong>.
          </li>
        </ol>
        <p className="mt-2">
          Le calcul est refait chaque été, avant la nouvelle saison. Le facteur ne bouge pas de plus de 0,05 par année.
          En une phrase : le pool reste aussi difficile qu&apos;avant, avec un petit coussin pour les salaires qui montent.
        </p>
      </div>

      <div className="overflow-x-auto">
        <p className="font-semibold text-gray-800 mb-1">Les 3 choix possibles (2026-27, plafond LNH de 104 M$)</p>
        <table className="text-sm min-w-full">
          <thead className="text-xs text-gray-500 uppercase">
            <tr><th className="text-left py-1 pr-4">Choix</th><th className="text-left py-1 pr-4">Facteur</th><th className="text-left py-1">Plafond du pool</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr><td className="py-1 pr-4">On attend les renouvellements</td><td className="py-1 pr-4">1,24</td><td className="py-1">129 M$</td></tr>
            <tr className="font-semibold"><td className="py-1 pr-4">Recommandé (retenu)</td><td className="py-1 pr-4">1,28</td><td className="py-1">134 M$</td></tr>
            <tr><td className="py-1 pr-4">Toute la hausse d&apos;un coup</td><td className="py-1 pr-4">1,32</td><td className="py-1">138 M$</td></tr>
          </tbody>
        </table>
      </div>

      <details className="group border border-gray-200 rounded-lg">
        <summary className="cursor-pointer select-none px-3 py-2 font-semibold text-gray-800 hover:bg-gray-50 rounded-lg">
          Version détaillée : formules et exemple de calcul
        </summary>
        <div className="px-3 pb-3 pt-1 space-y-3">
          <div>
            <p className="font-semibold text-gray-800">1. Facteur naturel N</p>
            <p className="mb-1">
              L&apos;équipe de rêve compte les <strong>96 meilleurs attaquants, 48 défenseurs et 16 gardiens</strong>, plus
              les <strong>16 meilleurs joueurs restants</strong>{' '}comme réservistes, soit 8 alignements de 12 A, 6 D, 2 G et
              2 réservistes. Les joueurs sont classés selon les points du pool, en moyenne sur les deux saisons précédentes.
              Un joueur sans contrat compte à son contrat précédent × 1,20, comme partout dans l&apos;app. Le calcul se fait
              toujours pour 8 équipes, pour comparer les époques.
            </p>
            <Formula>N = masse totale de l&apos;équipe de rêve ÷ (8 × plafond LNH)</Formula>
          </div>
          <div>
            <p className="font-semibold text-gray-800">2. Taux de pression P</p>
            <p className="mb-1">
              La part d&apos;une équipe de rêve qu&apos;un pooler peut se payer : c&apos;est la mesure de difficulté du pool.
              Sa moyenne historique (2013-14 à 2015-16 et 2025-26) est d&apos;environ <strong>0,76</strong>{' '}; c&apos;est la cible P̄.
            </p>
            <Formula>P = facteur ÷ N</Formula>
          </div>
          <div>
            <p className="font-semibold text-gray-800">3. Hausse à venir</p>
            <p className="mb-1">
              On recalcule la même équipe en payant chaque joueur au <strong>prix du marché</strong>{' '}: la médiane, en
              pourcentage du plafond LNH, des contrats qui commencent cette saison pour la même position et le même palier
              de talent. Les contrats d&apos;entrée gardent leur valeur réelle. L&apos;écart mesure la hausse encore à venir,
              à mesure que les contrats signés sous d&apos;anciens plafonds sont renouvelés.
            </p>
            <Formula>hausse = N* ÷ N − 1</Formula>
          </div>
          <div>
            <p className="font-semibold text-gray-800">4. Règle, recalculée chaque été</p>
            <Formula>f = P̄ × N × (1 + λ × hausse)</Formula>
            <p className="mt-1">
              λ est la part de la hausse accordée d&apos;avance : 0 (rien), ½ (la moitié, recommandé) ou 1 (tout). Le facteur
              est arrondi à 2 décimales, et sa variation est limitée à <strong>0,05 par année</strong>.
            </p>
          </div>
          <div>
            <p className="font-semibold text-gray-800">Exemple : le calcul de 2026-27 (fait en septembre 2026)</p>
            <ul className="space-y-1">
              <li>• Plafond LNH : 104 M$. Classement selon les saisons 2024-25 et 2025-26.</li>
              <li>• Équipe de rêve : 169,3 M$ par équipe, donc N = 169,3 ÷ 104 = <strong>1,628</strong>.</li>
              <li>• Prix du marché : la même équipe passerait de 1,634 à 1,743, donc une hausse de <strong>+6,7 %</strong>.</li>
              <li>• Difficulté : 0,76 × 1,628 = <strong>1,237</strong>.</li>
              <li>• Coussin (λ = ½) : 1,237 × (1 + ½ × 0,067) = 1,237 × 1,0335 = 1,279, arrondi à <strong>1,28</strong>.</li>
              <li>• Écart avec 2025-26 (1,24) : +0,04, sous la limite de 0,05.</li>
              <li>• Plafond du pool : 1,28 × 104 M$ = 133,12 M$, arrondi au million supérieur : <strong>134 M$</strong>.</li>
            </ul>
          </div>
        </div>
      </details>
    </div>
  )
}
