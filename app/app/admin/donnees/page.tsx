import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminTabBar } from '@/components/AdminTabBar'
import PlayerMerge from '../joueurs/PlayerMerge'
import AddProspectForm from '../draft-center/AddProspectForm'
import DraftProspectActions from '../draft-center/DraftProspectActions'
import AdminDraftYearSelect from '../draft-center/AdminDraftYearSelect'
import { DRAFT_SOURCES_INFOONLY } from '@/lib/draft-sources'

export const dynamic = 'force-dynamic'

const INFO_ONLY_KEYS = new Set(DRAFT_SOURCES_INFOONLY.map(s => s.key))

const TABS = [
  { id: 'pipeline',  label: 'Pipeline (salaires, contrats)' },
  { id: 'prospects', label: 'Classement des prospects' },
]

export default async function AdminDonneesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) redirect('/')

  const { tab = 'pipeline', year } = await searchParams
  const activeTab = TABS.some(t => t.id === tab) ? tab : 'pipeline'

  // ── Prospects (Classement des prospects) ────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prospectRows: any[] = []
  let prospectYears: number[] = []
  let prospectDraftYear = new Date().getFullYear()
  if (activeTab === 'prospects') {
    const { data: yearRows } = await supabase
      .from('draft_prospects').select('draft_year').order('draft_year', { ascending: false })
    const existingYears = Array.from(new Set((yearRows ?? []).map(r => r.draft_year))) as number[]
    const latestYear = existingYears[0] ?? new Date().getFullYear()
    const parsedYear = year ? parseInt(year, 10) : NaN
    prospectDraftYear = !isNaN(parsedYear) ? parsedYear : latestYear
    // Toujours offrir l'année suivante dans le sélecteur pour démarrer la liste du prochain repêchage
    const nextYear = latestYear + 1
    prospectYears = Array.from(new Set([...existingYears, nextYear, prospectDraftYear])).sort((a, b) => b - a)

    const { data: prospects } = await supabase
      .from('draft_prospects')
      .select('id, first_name, last_name, position, team, draft_prospect_rankings(rank)')
      .eq('draft_year', prospectDraftYear)
      .order('last_name')

    prospectRows = (prospects ?? []).map(p => {
      const allRanks = (p.draft_prospect_rankings as { rank: number; source: string }[])
      const ranked = allRanks.filter(r => !INFO_ONLY_KEYS.has(r.source as never))
      const avg = ranked.length > 0 ? ranked.reduce((s, r) => s + r.rank, 0) / ranked.length : null
      return { ...p, avgRank: avg, sourceCount: ranked.length }
    }).sort((a, b) => (a.avgRank ?? 999) - (b.avgRank ?? 999))
  }

  return (
    <div>
      <AdminTabBar tabs={TABS} activeTab={activeTab} basePath="/admin/donnees" />

      {/* ── Pipeline ── */}
      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{'Mise à jour des données'}</h1>
            <p className="text-gray-500 mt-2 max-w-3xl">
              {'La source de vérité des joueurs, contrats et repêchages est le pipeline Python basé sur PuckPedia et la NHL API. '}
              {'Les modifications manuelles dans l’application ne sont plus le flux recommandé, car elles seraient écrasées au prochain import.'}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Flux officiel</h2>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
              <li>{'Lancer le scraping PuckPedia pour générer ou rafraîchir les fichiers CSV (salaires, contrats).'}</li>
              <li>{'Importer ensuite ces données vers Supabase.'}</li>
              <li>{'Importer les repêchages NHL des 5 dernières saisons (recrues, protection).'}</li>
              <li>{'Recharger l’application et valider les changements sur les pages joueurs et alignements.'}</li>
            </ol>
          </div>

          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">{'Commandes à exécuter'}</h2>
            <p className="text-sm text-gray-600">Depuis le dossier <code>python_script</code> :</p>
            <pre className="bg-slate-950 text-slate-100 rounded-lg p-4 overflow-x-auto text-sm"><code>{`cd C:\\Projet_Dev\\Hockey_Pool_App\\python_script
.\\venv\\Scripts\\python.exe .\\scrape_puckpedia.py
.\\venv\\Scripts\\python.exe .\\import_supabase.py
.\\venv\\Scripts\\python.exe .\\import_drafts.py`}</code></pre>
            <p className="text-xs text-gray-500">
              {'Ou en une seule commande depuis la racine : '}<code>./run_pipeline_staging.ps1</code>{' (staging) / '}<code>./run_pipeline_prod.ps1</code>{' (prod, confirmation requise).'}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Ce que fait chaque script</h2>
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                <strong>scrape_puckpedia.py</strong>
                {' télécharge les pages d’équipes PuckPedia, sauvegarde les HTML de diagnostic et produit les CSV consolidés comme '}
                <code>PuckPedia_update.csv</code>
                .
              </p>
              <p>
                <strong>import_supabase.py</strong>
                {' lit le CSV consolidé, fusionne les doublons complexes, puis met à jour les tables '}
                <code>players</code>
                {' et '}
                <code>player_contracts</code>
                {' dans Supabase.'}
              </p>
              <p>
                <strong>import_drafts.py</strong>
                {' importe les repêchages NHL des 5 dernières saisons — alimente les statuts de recrue et la protection recrue des joueurs, indépendamment du classement des prospects ci-dessous (à venir, pas encore repêchés).'}
              </p>
            </div>
          </div>

          <PlayerMerge />

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 space-y-2">
            <h2 className="text-sm font-semibold text-amber-900">Important</h2>
            <p className="text-sm text-amber-800">{'Les routes de création et de modification manuelle des joueurs sont désormais désactivées pour éviter les incohérences avec le pipeline d’import.'}</p>
            <p className="text-sm text-amber-800">{'Si un ajustement exceptionnel est nécessaire, il vaut mieux corriger la source Python ou le script d’import plutôt que modifier un joueur à la main dans l’interface.'}</p>
          </div>
        </div>
      )}

      {/* ── Classement des prospects ── */}
      {activeTab === 'prospects' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-800">{'Classement des prospects'} — {prospectDraftYear}</h1>
            <AdminDraftYearSelect years={prospectYears} selectedYear={prospectDraftYear} />
          </div>

          <AddProspectForm draftYear={prospectDraftYear} />

          <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Joueur</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Pos</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Équipe</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Rang moyen</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Sources</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {prospectRows.map(p => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{p.last_name}, {p.first_name}</td>
                    <td className="px-4 py-3 text-gray-600">{p.position ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{p.team ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{p.avgRank ? p.avgRank.toFixed(1) : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{p.sourceCount}</td>
                    <td className="px-4 py-3 text-center">
                      <DraftProspectActions prospectId={p.id} prospectName={`${p.first_name} ${p.last_name}`} />
                    </td>
                  </tr>
                ))}
                {prospectRows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucun prospect.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
