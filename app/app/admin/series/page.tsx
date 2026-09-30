import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getPlayoffPoolSaisonAction,
  getEliminatedTeamsForPoolAction,
  getAllPlayoffPoolRostersAction,
  getParticipatingTeamsAction,
} from './series-admin-actions'
import {
  getPlayoffChangeLogAction,
} from '@/app/gestion-series/playoff-pool-actions'
import SeriesAdminManager from './SeriesAdminManager'
import ChangeLogPanel from './ChangeLogPanel'

export const metadata = { title: 'Pool des séries — Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminSeriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('poolers').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) redirect('/admin')

  const saison = await getPlayoffPoolSaisonAction()
  if (!saison) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">Pool des séries</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5 text-sm text-yellow-800">
          Aucune saison de séries active. Créez une saison dans{' '}
          <a href="/admin/pool?tab=config" className="underline">Configuration</a>{' '}
          avec l&apos;option « Saison de type séries ».
        </div>
      </div>
    )
  }

  const [eliminations, allRosters, { data: allTeams }, participatingTeamIds, changeLog] = await Promise.all([
    getEliminatedTeamsForPoolAction(saison.id),
    getAllPlayoffPoolRostersAction(saison.id, saison.season),
    supabase.from('teams').select('id, code, name').order('code'),
    getParticipatingTeamsAction(saison.id),
    getPlayoffChangeLogAction(saison.id),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Pool des séries — {saison.season}</h1>
      <ChangeLogPanel log={changeLog} />
      <SeriesAdminManager
        saison={saison}
        participatingTeamIds={participatingTeamIds}
        eliminations={eliminations}
        allTeams={allTeams ?? []}
        allRosters={allRosters}
      />
    </div>
  )
}
