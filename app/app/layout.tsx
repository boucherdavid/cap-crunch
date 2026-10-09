import type { Metadata } from 'next'
import { Suspense } from 'react'
import './globals.css'
import Navbar, { SectionEyebrow } from '@/components/Navbar'
import InstallBanner from '@/components/InstallBanner'
import ServiceWorkerProvider from '@/components/ServiceWorkerProvider'
import PushRestore from '@/components/PushRestore'
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

  const [feedbackResult, notifResult] = await Promise.all([
    isAdmin
      ? supabase.from('feedback').select('*', { count: 'exact', head: true }).eq('status', 'nouveau')
      : Promise.resolve({ count: 0 }),
    isAdmin
      ? supabase.from('notification_log').select('*', { count: 'exact', head: true }).is('read_at', null)
      : Promise.resolve({ count: 0 }),
  ])

  unreadCount = feedbackResult.count ?? 0
  unreadNotifCount = notifResult.count ?? 0

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
        <Navbar initialUserName={userName} initialIsAdmin={isAdmin} initialUnreadCount={unreadCount} initialUnreadNotifCount={unreadNotifCount} />
        {/* md:pl-64 compense la sidebar desktop fixe (Navbar.tsx) — pas nécessaire sur mobile,
            où la nav devient un tiroir superposé plutôt qu'une colonne permanente. */}
        <div className="md:pl-64">
          <InstallBanner />
          {user && <PushRestore />}
          {/* 1800 px (ex-1280, David 2026-09-28) : sur grand écran, le contenu était très tassé ;
              chaque page garde sa propre largeur max si elle en a une (texte, formulaires). */}
          <main className="max-w-[1800px] mx-auto px-4 lg:px-6 py-6">
            <SectionEyebrow userId={user?.id ?? null} isAdmin={isAdmin} />
            {children}
          </main>
        </div>
        <Suspense>
          <PlayerSlideOver />
        </Suspense>
      </body>
    </html>
  )
}
