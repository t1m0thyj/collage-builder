const CACHE_PREFIX = `collage-builder-shell:${self.registration.scope}:`
const CACHE_NAME = CACHE_PREFIX + "4b815a593458bf02"
const PRECACHE_FILES = ["","assets/archive-BvkXtfaG.js","assets/autosave-Nic-Dxt6.js","assets/canvas-vendor-Bl7Cu_oJ.js","assets/export.worker-D9TimHIy.js","assets/exportPng-D4gyRDxX.js","assets/heic-to-CuP2Qlsw.js","assets/index-D3xs7ShD.css","assets/index-D5e0JZ2C.js","assets/linkedAssets-BDE3fuBW.js","assets/migrations-LlGbHd0v.js","assets/optional-COeV9fyn.js","assets/zipStreams-BkNyu-8U.js","favicon.svg","icons.svg","index.html"]

const scopedUrl = (file) => new URL(file, self.registration.scope).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_FILES.map(scopedUrl))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  const scopeUrl = new URL(self.registration.scope)
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request, { ignoreSearch: true, ignoreVary: true }).then(async (cached) => {
        if (cached) return cached
        try {
          return await fetch(request)
        } catch {
          const cachedShell = await caches.match(scopedUrl('index.html'))
          return cachedShell ?? Response.error()
        }
      }),
    )
    return
  }

  event.respondWith(
    caches
      .match(request, { ignoreSearch: true, ignoreVary: true })
      .then((cached) => cached ?? fetch(request)),
  )
})
