const CACHE_NAME = 'hockey-pool-v5'

self.addEventListener('install', (event) => {
  // On cache uniquement la page offline — pas '/' qui requiert une auth
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add('/offline'))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      // La requête de page part pendant que le service worker démarre (gain réel sur Android)
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable()
      }
    })()
  )
  self.clients.claim()
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-192x192.png',
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(url))
      if (existing) return existing.focus()
      return clients.openWindow(url)
    })
  )
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function handleNavigation(event) {
  try {
    const preloaded = await event.preloadResponse
    if (preloaded) return preloaded
    return await fetch(event.request)
  } catch {
    // Échec ponctuel (sortie de veille, bascule wifi/cellulaire) : on réessaie avant
    // de conclure qu'on est hors ligne — le navigateur le ferait de lui-même sans nous.
    for (const delay of [1000, 2500]) {
      await sleep(delay)
      try {
        return await fetch(event.request)
      } catch {}
    }
    return (await caches.match('/offline')) ?? Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  // Seules les pages (navigations) sont interceptées, pour la page hors ligne.
  // Le reste (JS, données, images, Supabase, API) passe directement par le navigateur.
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return
  if (event.request.url.includes('/admin')) return

  event.respondWith(handleNavigation(event))
})
