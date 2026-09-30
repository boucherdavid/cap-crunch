import { fetchBackupHtml } from '@/lib/backupTool'

export const dynamic = 'force-dynamic'

// Réservé aux utilisateurs connectés, comme toutes les routes (proxy.ts).
export async function GET() {
  const html = await fetchBackupHtml()
  if (!html) {
    return new Response('Copie de secours indisponible pour le moment — réessaie plus tard.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="cap-crunch-copie-de-secours-${today}.html"`,
      'Cache-Control': 'no-store',
    },
  })
}
