import type { MetadataRoute } from 'next'
import { getAppEnv, getAppNameSuffix, getIconDir } from '@/lib/appEnv'

export default function manifest(): MetadataRoute.Manifest {
  const env = getAppEnv()
  const iconDir = getIconDir(env)
  const name = `Cap Crunch${getAppNameSuffix(env)}`

  return {
    name,
    short_name: name,
    description: 'Pool de hockey entre amis',
    start_url: '/',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#172437',
    // 'any' (David, 2026-09-28) : 'portrait' bloquait le mode paysage dans l'app installée —
    // précieux sur téléphone pour les tableaux à plusieurs colonnes.
    orientation: 'any',
    icons: [
      {
        src: `${iconDir}/icon-192x192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${iconDir}/icon-192x192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: `${iconDir}/icon-512x512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${iconDir}/icon-512x512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
