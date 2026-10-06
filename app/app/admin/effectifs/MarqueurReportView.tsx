import Link from 'next/link'
import { fmtPts } from '@/lib/nhl-stats'
import { MARQUEUR_URL } from '@/lib/externalLinks'
import type { MarqueurPointsGap, MarqueurReport } from '@/lib/marqueur'

function fmtDay(day: string): string {
  return new Date(day + 'T12:00:00Z').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Preuve LNH d'un écart de points : total officiel, verdict, détail match par match. */
function NhlProofBlock({ gap, audience }: { gap: MarqueurPointsGap; audience: 'admin' | 'pooler' }) {
  const nhl = gap.nhl
  if (!nhl) return <p className="text-xs text-gray-400">Vérification auprès de la LNH impossible pour le moment.</p>
  const capCrunchRight = nhl.total === gap.capCrunch
  const marqueurRight = nhl.total === gap.marqueur
  return (
    <div className="text-xs">
      <p className={`text-sm font-semibold ${capCrunchRight ? 'text-emerald-700' : marqueurRight ? 'text-red-600' : 'text-amber-700'}`}>
        LNH : {fmtPts(nhl.total)} pt{nhl.total > 1 ? 's' : ''}{' '}—{' '}
        {capCrunchRight
          ? 'Cap Crunch a raison'
          : marqueurRight
            ? (audience === 'admin' ? 'Marqueur a raison : à corriger ici' : 'Marqueur a raison : Cap Crunch est à corriger')
            : 'total de la saison complète (le joueur n’a pas été actif tout ce temps)'}
      </p>
      <p className="text-gray-500 mt-0.5">
        {nhl.games.map(m => `${fmtDay(m.date)} : ${m.detail}`).join(' · ') || 'Aucun match joué'}
      </p>
      <a href={nhl.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Voir le détail de ses matchs sur nhl.com</a>
    </div>
  )
}

/**
 * Écarts entre Cap Crunch et notre pool sur Marqueur.com (voir lib/marqueur.ts) — onglet
 * « Marqueur » de Gestion des effectifs (David, 2026-10-05) et, depuis le 2026-10-06, page
 * /comparaison-marqueur ouverte aux poolers (`audience='pooler'` : mêmes données, textes adaptés).
 * Lecture seule : rien n'est écrit sur Marqueur, la saisie là-bas reste manuelle.
 */
export default function MarqueurReportView({ report, audience = 'admin' }: { report: MarqueurReport; audience?: 'admin' | 'pooler' }) {
  const isAdmin = audience === 'admin'
  const readAt = new Date(report.fetchedAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' })
  const rosterCount = report.poolers.reduce((s, p) => s + p.rosterGaps.length, 0)
  const pointsCount = report.poolers.reduce((s, p) => s + p.pointsGaps.length, 0)
  const marqueurLink = <a href={MARQUEUR_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">notre pool sur Marqueur</a>

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Comparaison avec Marqueur</h1>
        {isAdmin ? (
          <p className="text-sm text-gray-500">
            Alignements (actifs et réservistes) et points par joueur, lus sur les pages publiques de{' '}{marqueurLink}{' '}
            à {readAt}. Rien n&apos;est écrit là-bas : c&apos;est toi qui reportes les changements.{' '}
            <Link href="/admin/effectifs?tab=marqueur" className="text-blue-600 hover:underline">Actualiser</Link>
          </p>
        ) : (
          <p className="text-sm text-gray-500">
            Les alignements sont aussi tenus à la main dans{' '}{marqueurLink}, pour vérifier Cap Crunch. Cette page compare les deux.
            Quand un total de points diffère, ce sont les feuilles de match de la LNH qui tranchent.
            Dernière lecture de Marqueur : {readAt} (au plus aux 5 minutes).
          </p>
        )}
      </div>

      {report.error ? (
        <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{report.error}</p>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <h2 className="px-4 py-3 bg-slate-800 text-white text-sm font-semibold uppercase tracking-wide">Totaux</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left text-gray-600">
                    <th className="px-2 sm:px-4 py-2 font-medium">Pooler</th>
                    <th className="px-2 sm:px-4 py-2 font-medium text-right">Cap Crunch</th>
                    <th className="px-2 sm:px-4 py-2 font-medium text-right">Marqueur</th>
                    <th className="px-2 sm:px-4 py-2 font-medium text-right">Écart</th>
                    <th className="px-2 sm:px-4 py-2 font-medium text-right hidden sm:table-cell">Alignement</th>
                    <th className="px-2 sm:px-4 py-2 font-medium text-right hidden sm:table-cell">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {report.poolers.map(p => {
                    const diff = p.marqueurTotal == null ? null : p.capCrunchTotal - p.marqueurTotal
                    return (
                      <tr key={p.poolerName} className="border-b last:border-0">
                        <td className="px-2 sm:px-4 py-2 font-medium text-gray-800">
                          {p.poolerName}
                          {p.marqueurLabel == null && <span className="ml-2 text-xs text-red-600">introuvable sur Marqueur</span>}
                        </td>
                        <td className="px-2 sm:px-4 py-2 text-right">{fmtPts(p.capCrunchTotal)}</td>
                        <td className="px-2 sm:px-4 py-2 text-right">{p.marqueurTotal == null ? '—' : fmtPts(p.marqueurTotal)}</td>
                        <td className={`px-2 sm:px-4 py-2 text-right font-semibold ${diff ? 'text-red-600' : 'text-emerald-600'}`}>
                          {diff == null ? '—' : diff === 0 ? '✓' : `${diff > 0 ? '+' : ''}${fmtPts(diff)}`}
                        </td>
                        <td className="px-2 sm:px-4 py-2 text-right text-gray-600 hidden sm:table-cell">{p.rosterGaps.length || '—'}</td>
                        <td className="px-2 sm:px-4 py-2 text-right text-gray-600 hidden sm:table-cell">{p.pointsGaps.length || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">
              {isAdmin ? 'À reporter sur Marqueur' : 'Mouvements pas encore reportés sur Marqueur'} ({rosterCount})
            </h2>
            {isAdmin ? (
              <p className="text-xs text-gray-500 mb-3">
                Écarts d&apos;alignement. L&apos;action proposée aligne Marqueur sur Cap Crunch, avec la date à saisir là-bas (celle du mouvement dans Cap Crunch) ; si c&apos;est plutôt Cap Crunch qui se trompe, corrige-le ici. Un élément disparaît de la liste dès que les deux concordent. Marqueur n&apos;a pas de LTIR : un joueur sur LTIR ici doit y être réserviste. Un joueur retiré des actifs sur Marqueur (en rouge là-bas) concorde avec tout statut non actif ici. Les recrues en banque ne sont pas comparées.
              </p>
            ) : (
              <p className="text-xs text-gray-500 mb-3">
                Changements d&apos;alignement faits dans Cap Crunch qui ne sont pas encore saisis sur Marqueur. Ils expliquent souvent un écart de total, et disparaissent d&apos;ici dès que la saisie est faite là-bas. Si tu crois que c&apos;est Cap Crunch qui se trompe, signale-le.
              </p>
            )}
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
              Joueurs dont le total diffère entre Cap Crunch et Marqueur. Pour chacun, le total officiel de la LNH est indiqué avec le détail match par match
              {isAdmin ? <> : c&apos;est la preuve à montrer si un pooler questionne un total.</> : <>, et tu peux le vérifier toi-même sur nhl.com.</>}
            </p>
            {pointsCount === 0 ? (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">Les points concordent pour tous les joueurs.</p>
            ) : (
              <ul className="space-y-3">
                {report.poolers.flatMap(p => p.pointsGaps.map(g => (
                  <li key={`${p.poolerName}-${g.player}`} className="bg-white rounded-lg shadow p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2">
                      <p className="font-semibold text-gray-800">{g.player} <span className="font-normal text-gray-500">— {p.poolerName}</span></p>
                      <p className="text-sm text-gray-600">
                        Cap Crunch : <span className="font-semibold text-gray-900">{fmtPts(g.capCrunch)}</span>{' '}· Marqueur : <span className="font-semibold text-gray-900">{fmtPts(g.marqueur)}</span>
                      </p>
                    </div>
                    <NhlProofBlock gap={g} audience={audience} />
                  </li>
                )))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
