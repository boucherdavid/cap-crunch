import type { Metadata } from 'next'
import { Suspense } from 'react'
import './globals.css'
import Navbar from '@/components/Navbar'
import InstallBanner from '@/components/InstallBanner'
import ServiceWorkerProvider from '@/components/ServiceWorkerProvider'
import PlayerSlideOver from '@/components/PlayerSlideOver'
import { createClient } from '@/lib/supabase/server'
import { getAppEnv, getAppNameSuffix, getIconDir } from '@/lib/appEnv'

const appEnv = getAppEnv()
const iconDir = getIconDir(appEnv)
const appName = `Cap Crunch${getAppNameSuffix(appEnv)}`

export const metadata: Metadata = {
  title: appName,
  description: 'Pool de hockey entre amis',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: `${iconDir}/favicon-16x16.png`, sizes: '16x16', type: 'image/png' },
      { url: `${iconDir}/favicon-32x32.png`, sizes: '32x32', type: 'image/png' },
    ],
    apple: `${iconDir}/apple-touch-icon.png`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: appName,
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let userName: string | null = null
  let isAdmin = false

  if (user) {
    const { data: pooler } = await supabase
      .from('poolers')
      .select('name, is_admin')
      .eq('id', user.id)
      .single()
    if (pooler) {
      userName = pooler.name
      isAdmin = pooler.is_admin
    }
  }

  let unreadCount = 0
  let unreadNotifCount = 0

  const [feedbackResult, notifResult, settingsResult] = await Promise.all([
    isAdmin
      ? supabase.from('feedback').select('*', { count: 'exact', head: true }).eq('status', 'nouveau')
      : Promise.resolve({ count: 0 }),
    isAdmin
      ? supabase.from('notification_log').select('*', { count: 'exact', head: true }).is('read_at', null)
      : Promise.resolve({ count: 0 }),
    supabase.from('app_settings').select('nav_planification_only').eq('id', 1).maybeSingle(),
  ])

  unreadCount = feedbackResult.count ?? 0
  unreadNotifCount = notifResult.count ?? 0
  const navPlanificationOnly = settingsResult.data?.nav_planification_only ?? false

  return (
    <html lang="fr">
      <head>
        {/* Capture beforeinstallprompt avant l'hydratation React */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window.__pwaPrompt = e;
          });
        `}} />
      </head>
      <body className="bg-gray-50 min-h-screen">
        <ServiceWorkerProvider />
        <Navbar initialUserName={userName} initialIsAdmin={isAdmin} initialUnreadCount={unreadCount} initialUnreadNotifCount={unreadNotifCount} navPlanificationOnly={navPlanificationOnly} />
        <InstallBanner />
        <main className="max-w-7xl mx-auto px-4 py-6">
          {children}
        </main>
        <Suspense>
          <PlayerSlideOver />
        </Suspense>
      </body>
    </html>
  )
}
