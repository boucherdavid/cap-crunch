const CACHE_NAME = 'hockey-pool-v4'

self.addEventListener('install', (event) => {
  // On cache uniquement la page offline — pas '/' qui requiert une auth
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add('/offline'))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
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

self.addEventListener('fetch', (event) => {
  const url = event.request.url

  // Ne pas intercepter : non-GET, Supabase, API, admin
  if (
    event.request.method !== 'GET' ||
    url.includes('supabase') ||
    url.includes('nhle.com') ||
    url.includes('/api/') ||
    url.includes('/admin')
  ) {
    return
  }

  // Pages HTML : network-first (contenu authentifié, jamais mis en cache)
  const isNavigation = event.request.mode === 'navigate'
  if (isNavigation) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline'))
    )
    return
  }

  // Assets statiques : cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).catch(() => caches.match('/offline'))
    })
  )
})
