const LEGEND = [
  { emoji: '🔥', label: 'En feu',    desc: '3+ matchs consécutifs avec au moins 1 point' },
  { emoji: '✅', label: 'En forme',  desc: '2 matchs consécutifs avec au moins 1 point'   },
  { emoji: '🧊', label: 'En panne',  desc: '5+ matchs consécutifs sans point'              },
  { emoji: '🚨', label: 'En crise',  desc: '8+ matchs consécutifs sans point'              },
  { emoji: '📈', label: 'En hausse', desc: 'Moyenne en hausse sur les 5 derniers matchs'  },
  { emoji: '📉', label: 'En baisse', desc: 'Moyenne en baisse sur les 5 derniers matchs'  },
]

const GOALIE_LEGEND = [
  { emoji: '🏆', label: 'Victoires',  desc: '3+ victoires consécutives (départs)' },
  { emoji: '🛡️', label: 'Sv% élite',  desc: 'Sv% moyen ≥ 93 % sur les 5 derniers départs' },
  { emoji: '🎯', label: 'GAA basse',  desc: 'GAA ≤ 2,50 sur les 5 derniers départs' },
]

// Sur téléphone, la légende complète prenait tout l'écran avant le tableau — repliée derrière
// un bouton (David, 2026-09-28) ; toujours dépliée à partir de sm (paysage/desktop).
export default function StreakLegend() {
  return (
    <>
      <details className="sm:hidden rounded-lg border border-gray-100 bg-gray-50 px-4 py-2">
        <summary className="text-xs font-semibold text-gray-500 cursor-pointer">Légende des indicateurs 🔥 ✅ 🧊</summary>
        <div className="pt-2"><LegendContent /></div>
      </details>
      <div className="hidden sm:block rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
        <LegendContent />
      </div>
    </>
  )
}

function LegendContent() {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Indicateurs de séquence</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
          {LEGEND.map(({ emoji, label, desc }) => (
            <div key={label} className="flex items-baseline gap-2 text-xs text-gray-500">
              <span className="text-sm shrink-0">{emoji}</span>
              <span className="font-semibold text-gray-600 shrink-0">{label}</span>
              <span className="text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Gardiens — indicateurs additionnels</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
          {GOALIE_LEGEND.map(({ emoji, label, desc }) => (
            <div key={label} className="flex items-baseline gap-2 text-xs text-gray-500">
              <span className="text-sm shrink-0">{emoji}</span>
              <span className="font-semibold text-gray-600 shrink-0">{label}</span>
              <span className="text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
