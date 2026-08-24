export type AppEnv = 'local' | 'staging' | 'production'

/**
 * Distingue les 3 déploiements (local, staging, prod) pour permettre de différencier
 * visuellement leurs icônes/raccourcis PWA. `VERCEL_GIT_COMMIT_REF` (nom de la branche
 * déployée) est fiable pour ça car les deux projets Vercel (cap-crunch / cap-crunch-staging)
 * ont chacun leur propre branche de production — contrairement à VERCEL_ENV, qui vaut
 * "production" dans les deux cas.
 */
export function getAppEnv(): AppEnv {
  if (!process.env.VERCEL) return 'local'
  if (process.env.VERCEL_GIT_COMMIT_REF === 'staging') return 'staging'
  return 'production'
}

export function getIconDir(env: AppEnv): string {
  return env === 'production' ? '/icons' : `/icons/${env}`
}

export function getAppNameSuffix(env: AppEnv): string {
  if (env === 'local') return ' (Local)'
  if (env === 'staging') return ' (Staging)'
  return ''
}
