import { NextResponse } from 'next/server'
import { getLiveNight } from '@/lib/liveNight'

export const dynamic = 'force-dynamic'

/** Pointage en direct (JSON) — sondé chaque minute par LiveNightProvider pendant les matchs.
 * Le calcul lui-même est en cache 45 s (lib/liveNight.ts) : la base n'est presque pas sollicitée. */
export async function GET() {
  const night = await getLiveNight()
  return NextResponse.json(night, { headers: { 'Cache-Control': 'no-store' } })
}
