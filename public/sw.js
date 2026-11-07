// Cache delle risorse pubblicate. I dati personali NON entrano nella cache.
const CACHE_NAME = 'parsmea-iphone-shell-v6-parsmeai-auto'
const BASE = self.registration.scope

function sameAppUrl(value) {
  try {
    const parsed = new URL(value, BASE)
    return parsed.origin === self.location.origin && parsed.href.startsWith(BASE)
      ? parsed.href : null
  } catch {
    return null
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const shell = new URL('./', BASE).href
    try {
      const response = await fetch(shell, { cache: 'reload' })
      if (!response.ok) return
      const html = await response.clone().text()
      await cache.put(shell, response)
      const files = [
        './manifest.webmanifest', './icon-192.png', './icon-512.png',
        './apple-touch-icon.png', './app-icon.svg'
      ]
      for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        const url = sameAppUrl(match[1])
        if (url) files.push(url)
      }
      await Promise.allSettled(files.map(async (file) => {
        const url = sameAppUrl(file)
        if (url) await cache.add(url)
      }))
    } catch (error) {
      console.warn('Precaricamento offline parziale:', error)
    }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('parsmea-iphone-shell-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = sameAppUrl(request.url)
  if (!url || request.method !== 'GET') return

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)

    if (request.mode === 'navigate') {
      try {
        const online = await fetch(request)
        if (online.ok) await cache.put(request, online.clone())
        return online
      } catch {
        return (await cache.match(request)) ||
          (await cache.match(new URL('./', BASE).href)) ||
          Response.error()
      }
    }

    const saved = await cache.match(request)
    if (saved) return saved
    try {
      const online = await fetch(request)
      if (online.ok) await cache.put(request, online.clone())
      return online
    } catch {
      return Response.error()
    }
  })())
})
