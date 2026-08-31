export type Bucket = 'forward' | 'defense' | 'goalie'

export const ACTIVE_LIMITS: Record<Bucket, number> = { forward: 12, defense: 6, goalie: 2 }

export const BUCKET_LABELS: Record<Bucket, string> = {
  forward: 'attaquants actifs',
  defense: 'défenseurs actifs',
  goalie:  'gardiens actifs',
}

export function getPlayerBucket(position: string | null): Bucket {
  const pos = (position ?? '').toUpperCase()
  if (pos.includes('G')) return 'goalie'
  if (pos.includes('D')) return 'defense'
  return 'forward'
}

const fmtCap = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export type RosterLimitEntry = { player_type: string; position: string | null; capNumber: number }

// Validateur partagé de l'état final d'un alignement (12/6/2 actifs max, 2 réservistes min,
// cap respecté) — utilisé par submitTransactionAction, submitRosterAction et submitBatchAction
// pour que les poolers et les admins (hors contextes "override" délibérés : Mode init, Banque
// de recrues, pré-saison, /admin/historique) soient soumis exactement aux mêmes règles.
// capNumber doit déjà être résolu par l'appelant via getEffectiveCap() (app/lib/capUtils.ts) —
// jamais un cap_number brut, pour ne pas compter un joueur non signé comme 0$.
export function validateRosterLimits(entries: RosterLimitEntry[], poolCap: number): string | null {
  const actifs = entries.filter(e => e.player_type === 'actif')
  const reservistes = entries.filter(e => e.player_type === 'reserviste')

  const counts = actifs.reduce((acc, e) => {
    acc[getPlayerBucket(e.position)] += 1
    return acc
  }, { forward: 0, defense: 0, goalie: 0 } as Record<Bucket, number>)

  for (const bucket of (['forward', 'defense', 'goalie'] as Bucket[])) {
    if (counts[bucket] > ACTIVE_LIMITS[bucket]) {
      return `Trop de ${BUCKET_LABELS[bucket]} (${counts[bucket]} / ${ACTIVE_LIMITS[bucket]})`
    }
  }

  if (reservistes.length < 2) return `Minimum 2 réservistes requis (${reservistes.length})`

  const cap = [...actifs, ...reservistes].reduce((sum, e) => sum + e.capNumber, 0)
  if (cap > poolCap) return `Cap dépassé (${fmtCap(cap)} / ${fmtCap(poolCap)})`

  return null
}
