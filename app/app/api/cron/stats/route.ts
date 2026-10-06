import { NextResponse } from 'next/server'
import { getAppEnv } from '@/lib/appEnv'
import { dispatchWorkflow } from '@/lib/githubDispatch'

export const dynamic = 'force-dynamic'

/**
 * Import des points de la nuit, déclenché par Vercel Cron (David, 2026-10-06) — voir `crons` dans
 * vercel.json. Lance `.github/workflows/regular_stats.yml`, dont l'horaire GitHub partait vers
 * 8 h ET peu importe l'heure demandée ; cet horaire reste en place comme filet de sécurité
 * (l'import est idempotent et retraite les 3 derniers jours).
 *
 * Vercel envoie `Authorization: Bearer <CRON_SECRET>` quand la variable est définie : sans elle,
 * ou avec un autre jeton, la route refuse. Staging déploie le même vercel.json, mais seule la
 * prod lance la tâche. Exclue de l'authentification de proxy.ts (`api/cron`).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }
  if (getAppEnv() !== 'production') return NextResponse.json({ skipped: 'Seule la prod lance cette tâche.' })

  const result = await dispatchWorkflow('regular_stats.yml')
  if (result.error) {
    console.error('[cron stats]', result.error)
    return NextResponse.json(result, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
