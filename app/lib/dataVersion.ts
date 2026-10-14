/**
 * Numéro de version des données mises en cache (David, 2026-10-14) — table `data_versions`,
 * incrémentée par des triggers Postgres à chaque écriture dans une table source (voir
 * supabase_migrations/data_versions.sql). Sert de clé de cache : tant que la version ne bouge
 * pas, le calcul mis en cache est encore exact ; à la première écriture, il est refait une fois.
 *
 * Lecture d'une seule ligne par clé primaire (~1 ms), dédupliquée par requête (`cache` de React).
 * Table absente (migration pas encore roulée) ou lecture en échec → `null` : l'appelant calcule
 * alors sans cache, jamais avec une valeur périmée.
 */

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

export type DataVersionKey = 'standings' | 'injuries'

const readVersions = cache(async (): Promise<Map<string, number> | null> => {
  const { data, error } = await createAdminClient().from('data_versions').select('key, version')
  if (error || !data) return null
  return new Map(data.map(r => [r.key as string, Number(r.version)]))
})

export async function getDataVersion(key: DataVersionKey): Promise<number | null> {
  const versions = await readVersions()
  return versions?.get(key) ?? null
}
