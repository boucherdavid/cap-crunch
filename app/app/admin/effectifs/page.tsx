import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { AdminTabBar } from '@/components/AdminTabBar'
import GestionEffectifsManager from '@/app/gestion-effectifs/GestionEffectifsManager'
import TransactionBuilder from '../transactions/TransactionBuilder'
import HistoriqueManager from '../historique/HistoriqueManager'
import { getHistLogAction } from '../historique/historique-actions'
import CapWatchManager from './CapWatchManager'
import { loadCapWatchDataAction } from './cap-watch-actions'

export const dynamic = 'force-dynamic'

const TABS = [
  { id: 'mouvements',   label: 'Mouvements' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'historique',   label: 'Historique' },
  { id: 'conformite',   label: 'Conformité cap' },
]

export default async function AdminEffectifsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) redirect('/')

  const { tab = 'mouvements' } = await searchParams
  const activeTab = TABS.some(t => t.id === tab) ? tab : 'mouvements'

  // ── Conformité cap ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saisonConformite: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let capWatchData: any = { entries: [], unsignedMultiplier: 1.20, capDeadlineDays: 7 }
  if (activeTab === 'conformite') {
    const { data: sr } = await supabase.from('pool_seasons').select('id, season').eq('is_active', true).eq('is_playoff', false).single()
    saisonConformite = sr
    if (saisonConformite) {
      capWatchData = await loadCapWatchDataAction(saisonConformite.id)
    }
  }

  // ── Mouvements ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let poolersMouvements: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saisonMouvements: any = null
  if (activeTab === 'mouvements') {
    const [pr, sr] = await Promise.all([
      supabase.from('poolers').select('id, name').order('name'),
      supabase.from('pool_seasons').select('id, season, pool_cap, delai_reactivation_jours, max_signatures_al, max_signatures_ltir, gestion_effectifs_ouvert, is_playoff').eq('is_active', true).eq('is_playoff', false).single(),
    ])
    poolersMouvements = pr.data ?? []
    saisonMouvements = sr.data
  }

  // ── Transactions ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let poolersTx: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saisonTx: any = null
  if (activeTab === 'transactions') {
    const [pr, sr] = await Promise.all([
      supabase.from('poolers').select('id, name').order('name'),
      supabase.from('pool_seasons').select('id, season, pool_cap').eq('is_active', true).eq('is_playoff', false).single(),
    ])
    poolersTx = pr.data ?? []
    saisonTx = sr.data
  }

  // ── Historique ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let poolersHist: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saisonHist: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let initialLog: any = []
  if (activeTab === 'historique') {
    const db = createAdminClient()
    const [sr, pr] = await Promise.all([
      db.from('pool_seasons').select('id, season').eq('is_active', true).eq('is_playoff', false).single(),
      db.from('poolers').select('id, name').order('name'),
    ])
    saisonHist = sr.data
    poolersHist = pr.data ?? []
    if (saisonHist) {
      initialLog = await getHistLogAction(saisonHist.id)
    }
  }

  return (
    <div>
      <AdminTabBar tabs={TABS} activeTab={activeTab} basePath="/admin/effectifs" />

      {/* ── Mouvements ── */}
      {activeTab === 'mouvements' && (
        <div className="max-w-6xl">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">{'Gestion d\'effectifs'}</h1>
          <p className="text-sm text-gray-500 mb-6">
            Plusieurs actions peuvent être combinées en une seule soumission.
            La date effective est celle de la soumission, sauf si forcée manuellement.
          </p>
          {!saisonMouvements
            ? <p className="text-gray-500">Aucune saison active.</p>
            : <GestionEffectifsManager
                isAdmin
                poolers={poolersMouvements}
                saisonId={saisonMouvements.id}
                season={saisonMouvements.season}
                poolCap={Number(saisonMouvements.pool_cap)}
                delaiReactivationJours={saisonMouvements.delai_reactivation_jours ?? 7}
                maxSignaturesAl={saisonMouvements.max_signatures_al ?? 10}
                maxSignaturesLtir={saisonMouvements.max_signatures_ltir ?? 2}
              />
          }
        </div>
      )}

      {/* ── Transactions ── */}
      {activeTab === 'transactions' && (
        <div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">Transactions</h1>
          {saisonTx && <p className="text-gray-500 text-sm mb-6">Saison {saisonTx.season}</p>}
          {!saisonTx
            ? <p className="text-gray-400">Aucune saison active.</p>
            : <TransactionBuilder poolers={poolersTx} saison={saisonTx} />
          }
        </div>
      )}

      {/* ── Historique ── */}
      {activeTab === 'historique' && (
        <div className="max-w-6xl space-y-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Historique des transactions</h1>
            {saisonHist && (
              <p className="text-sm text-gray-500 mt-1">
                Saison active : <span className="font-medium">{saisonHist.season}</span> — Saisie des données historiques pour validation.
              </p>
            )}
          </div>
          {!saisonHist
            ? <p className="text-gray-500">Aucune saison régulière active.</p>
            : <HistoriqueManager
                poolers={poolersHist}
                poolSeasonId={saisonHist.id}
                initialLog={initialLog}
              />
          }
        </div>
      )}

      {/* ── Conformité cap ── */}
      {activeTab === 'conformite' && (
        <div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">Conformité cap</h1>
          <p className="text-sm text-gray-500 mb-6 max-w-2xl">
            Un joueur actif sans contrat pour la saison compte un cap simulé (estimé à partir
            de son salaire précédent) plutôt que 0$. « Vérifier les signatures » détecte les
            vrais contrats fraîchement importés et notifie le pooler concerné s&apos;il dépasse
            alors le plafond — passé le délai, seul un clic ici peut libérer le joueur.
          </p>
          {!saisonConformite
            ? <p className="text-gray-500">Aucune saison active.</p>
            : <CapWatchManager
                saisonId={saisonConformite.id}
                initialEntries={capWatchData.entries ?? []}
                initialMultiplier={capWatchData.unsignedMultiplier ?? 1.20}
                initialDeadlineDays={capWatchData.capDeadlineDays ?? 7}
              />
          }
        </div>
      )}
    </div>
  )
}
