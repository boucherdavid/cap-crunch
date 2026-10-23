import { unstable_cache } from 'next/cache'
import { syncLtirReturns } from '@/lib/ltirReturns'
import { syncNhlTransactions } from '@/lib/nhlTransactions'
import { syncDeadlines } from '@/lib/deadlineSync'

// Vérifications lancées depuis l'accueil (David, 2026-10-23) : au plus une fois par heure pour
// tout le site. Le minuteur en mémoire de chaque sync ne vaut que pour un serveur, et Vercel en
// démarre et en recycle plusieurs : chaque nouveau serveur relançait tout dès sa première visite.
// Le cache de données de Vercel, lui, est partagé — le premier visiteur de l'heure déclenche les
// vérifications, les autres ne font rien. Base Nano en manque de mémoire (swap) : chaque réveil
// inutile coûte des I/O. Les onglets concernés (ballotage, échanges, LTIR) règlent toujours
// leurs délais eux-mêmes à l'ouverture.
const runHomeSyncs = unstable_cache(async (): Promise<number> => {
  await Promise.allSettled([syncLtirReturns(true), syncNhlTransactions(true), syncDeadlines(true)])
  return Date.now()
}, ['home-syncs-v1'], { revalidate: 3600 })

export async function runHomeSyncsHourly(): Promise<void> {
  try {
    await runHomeSyncs()
  } catch {
    // Prochaine visite.
  }
}
