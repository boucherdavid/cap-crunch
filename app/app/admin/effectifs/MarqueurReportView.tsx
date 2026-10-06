import Link from 'next/link'
import { fmtPts } from '@/lib/nhl-stats'
import { MARQUEUR_URL } from '@/lib/externalLinks'
import type { MarqueurReport } from '@/lib/marqueur'

/**
 * Onglet « Marqueur » de Gestion des effectifs (David, 2026-10-05) — écarts entre Cap Crunch et
 * notre pool sur Marqueur.com (voir lib/marqueur.ts). Lecture seule : rien n'est écrit sur
 * Marqueur, la saisie là-bas reste manuelle.
 */
export default function MarqueurReportView({ report }: { report: MarqueurReport }) {
  const readAt = new Date(report.fetchedAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' })
  const rosterCount = report.poolers.reduce((s, p) => s + p.rosterGaps.length, 0)
  const pointsCount = report.poolers.reduce((s, p) => s + p.pointsGaps.length, 0)

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Comparaison avec Marqueur</h1>
        <p className="text-sm text-gray-500">
          Alignements (actifs et réservistes) et points par joueur, lus sur les pages publiques de{' '}
          <a href={MARQUEUR_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">notre pool sur Marqueur</a>{' '}
          à {readAt}. Rien n&apos;est écrit là-bas : c&apos;est toi qui reportes les changements.{' '}
          <Link href="/admin/effectifs?tab=marqueur" className="text-blue-600 hover:underline">Actualiser</Link>
        </p>
      </div>

      {report.error ? (
        <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{report.error}</p>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <h2 className="px-4 py-3 bg-slate-800 text-white text-sm font-semibold uppercase tracking-wide">Totaux</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left text-gray-600">
                  <th className="px-4 py-2 font-medium">Pooler</th>
                  <th className="px-4 py-2 font-medium text-right">Cap Crunch</th>
                  <th className="px-4 py-2 font-medium text-right">Marqueur</th>
                  <th className="px-4 py-2 font-medium text-right">Écart</th>
                  <th className="px-4 py-2 font-medium text-right">Alignement</th>
                  <th className="px-4 py-2 font-medium text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {report.poolers.map(p => {
                  const diff = p.marqueurTotal == null ? null : p.capCrunchTotal - p.marqueurTotal
                  return (
                    <tr key={p.poolerName} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium text-gray-800">
                        {p.poolerName}
                        {p.marqueurLabel == null && <span className="ml-2 text-xs text-red-600">introuvable sur Marqueur</span>}
                      </td>
                      <td className="px-4 py-2 text-right">{fmtPts(p.capCrunchTotal)}</td>
                      <td className="px-4 py-2 text-right">{p.marqueurTotal == null ? '—' : fmtPts(p.marqueurTotal)}</td>
                      <td className={`px-4 py-2 text-right font-semibold ${diff ? 'text-red-600' : 'text-emerald-600'}`}>
                        {diff == null ? '—' : diff === 0 ? '✓' : `${diff > 0 ? '+' : ''}${fmtPts(diff)}`}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">{p.rosterGaps.length || '—'}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{p.pointsGaps.length || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">À reporter sur Marqueur ({rosterCount})</h2>
            <p className="text-xs text-gray-500 mb-3">
              Écarts d&apos;alignement. L&apos;action proposée aligne Marqueur sur Cap Crunch, avec la date à saisir là-bas (celle du mouvement dans Cap Crunch) ; si c&apos;est plutôt Cap Crunch qui se trompe, corrige-le ici. Un élément disparaît de la liste dès que les deux concordent. Marqueur n&apos;a pas de LTIR : un joueur sur LTIR ici doit y être réserviste. Les recrues en banque ne sont pas comparées.
            </p>
            {rosterCount === 0 ? (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">Les alignements concordent.</p>
            ) : (
              <div className="space-y-3">
                {report.poolers.filter(p => p.rosterGaps.length > 0).map(p => (
                  <div key={p.poolerName} className="bg-white rounded-lg shadow p-4">
                    <p className="font-semibold text-gray-800 mb-2">{p.poolerName}</p>
                    <ul className="space-y-2">
                      {p.rosterGaps.map(g => (
                        <li key={`${g.player}-${g.action}`} className="text-sm">
                          <span className="font-medium text-gray-800">{g.player}</span>{' '}
                          <span className="text-amber-700">— {g.action}</span>
                          <p className="text-xs text-gray-500">{g.context}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Écarts de points ({pointsCount})</h2>
            <p className="text-xs text-gray-500 mb-3">
              Joueurs actifs des deux côtés dont le total diffère. Cap Crunch suit les feuilles de match de la LNH ; vérifie le joueur sur le site de la LNH pour savoir lequel a raison.
            </p>
            {pointsCount === 0 ? (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">Les points concordent pour tous les joueurs actifs.</p>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left text-gray-600">
                      <th className="px-4 py-2 font-medium">Pooler</th>
                      <th className="px-4 py-2 font-medium">Joueur</th>
                      <th className="px-4 py-2 font-medium text-right">Cap Crunch</th>
                      <th className="px-4 py-2 font-medium text-right">Marqueur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.poolers.flatMap(p => p.pointsGaps.map(g => (
                      <tr key={`${p.poolerName}-${g.player}`} className="border-b last:border-0">
                        <td className="px-4 py-2 text-gray-600">{p.poolerName}</td>
                        <td className="px-4 py-2 font-medium text-gray-800">{g.player}</td>
                        <td className="px-4 py-2 text-right">{fmtPts(g.capCrunch)}</td>
                        <td className="px-4 py-2 text-right">{fmtPts(g.marqueur)}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
