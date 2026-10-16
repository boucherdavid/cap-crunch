import { NextResponse } from 'next/server'
import { getStartingGoalies } from '@/lib/startingGoalies'

export const dynamic = 'force-dynamic'

/** Gardiens partants (JSON) — sondé aux 5 minutes par la page tant qu'un match n'est pas commencé.
 * Les deux sites sont en cache 10 minutes (lib/startingGoalies.ts) : la base n'est presque pas lue. */
export async function GET() {
  const data = await getStartingGoalies()
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
