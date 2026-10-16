import { getStartingGoalies } from '@/lib/startingGoalies'
import GardiensPartantsView from './GardiensPartantsView'

export const metadata = { title: 'Gardiens partants' }
export const dynamic = 'force-dynamic'

export default async function GardiensPartantsPage() {
  return <GardiensPartantsView initial={await getStartingGoalies()} />
}
