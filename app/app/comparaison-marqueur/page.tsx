import MarqueurReportView from '@/app/admin/effectifs/MarqueurReportView'
import { getMarqueurReportCached } from '@/lib/marqueur'

export const metadata = { title: 'Comparaison avec Marqueur' }
export const dynamic = 'force-dynamic'

/**
 * Comparaison Cap Crunch / Marqueur.com ouverte aux poolers (David, 2026-10-06), menu Le pool —
 * mêmes données que l'onglet admin (/admin/effectifs?tab=marqueur), en cache 5 minutes pour ne
 * pas solliciter Marqueur à chaque visite. La connexion est exigée par proxy.ts, comme partout.
 */
export default async function ComparaisonMarqueurPage() {
  const report = await getMarqueurReportCached()
  return (
    <div className="mx-auto px-4 py-8 max-w-5xl">
      <MarqueurReportView report={report} audience="pooler" />
    </div>
  )
}
