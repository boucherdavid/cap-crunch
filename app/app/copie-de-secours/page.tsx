import { createClient } from '@/lib/supabase/server'
import { canTriggerBackup, fetchBackupUpdatedAt, fetchLastBackupRun } from '@/lib/backupTool'
import BackupAdminPanel from './BackupAdminPanel'

export const metadata = { title: 'Copie de secours — Cap Crunch' }
export const dynamic = 'force-dynamic'

export default async function CopieDeSecoursPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: me } = user
    ? await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
    : { data: null }
  const isAdmin = !!me?.is_admin

  const [updatedAt, lastRun] = await Promise.all([
    fetchBackupUpdatedAt(),
    isAdmin ? fetchLastBackupRun() : Promise.resolve(null),
  ])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Copie de secours</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tout le pool dans un seul fichier, utilisable même si l&apos;app est hors service.
        </p>
      </div>

      <section className="bg-white rounded-lg shadow p-5">
        <p className="text-sm text-gray-700 mb-3">
          Le fichier contient les alignements de tous les poolers, les contrats des joueurs de la LNH, les
          choix de repêchage et le journal des mouvements de la saison. Ouvre-le dans ton navigateur
          (double-clic) : il fonctionne sans connexion Internet, et tu peux y faire des ajustements
          à la main, qui restent enregistrés dans ton navigateur seulement.
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Mis à jour automatiquement chaque dimanche.{' '}
          {updatedAt
            ? <>Dernière mise à jour : <strong>{new Date(updatedAt).toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Toronto' })}</strong>.</>
            : 'Date de la dernière mise à jour indisponible pour le moment.'}
        </p>
        <a
          href="/copie-de-secours/telecharger"
          download
          className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Télécharger la copie de secours
        </a>
      </section>

      {isAdmin && lastRun && <BackupAdminPanel initialRun={lastRun} canTrigger={canTriggerBackup()} />}
    </div>
  )
}
