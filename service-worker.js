const CACHE_PREFIX = `collage-builder-shell:${self.registration.scope}:`
const CACHE_NAME = CACHE_PREFIX + "37fb659f9961c7fc"
const PRECACHE_FILES = ["","LICENSE.txt","THIRD_PARTY_NOTICES.md","assets/archive-BnaJbQsq.js","assets/autosave-DOzuU_ZT.js","assets/canvas-vendor-Bl7Cu_oJ.js","assets/export.worker-Bcv2c795.js","assets/exportPng-BUyRye8k.js","assets/heic-to-CuP2Qlsw.js","assets/index-Cz7xRSLR.js","assets/index-DQPdIqza.css","assets/linkedAssets-DDHFP0VP.js","assets/migrations-GAH_Gep8.js","assets/optional-DmAiNl2f.js","assets/zipStreams-Czjkp8kx.js","favicon.svg","index.html","licenses/bits-ui-2.18.1.txt","licenses/clsx-2.1.1.txt","licenses/esm-env-1.2.2.txt","licenses/fflate-0.8.3.txt","licenses/floating-ui-core-1.8.0.txt","licenses/floating-ui-dom-1.8.0.txt","licenses/floating-ui-utils-0.2.12.txt","licenses/heic-to-1.5.2.txt","licenses/idb-8.0.3.txt","licenses/inline-style-parser-0.2.7.txt","licenses/internationalized-date-3.12.3.txt","licenses/konva-10.3.0.txt","licenses/lucide-svelte-1.29.0.txt","licenses/remixicon-svelte-0.0.5.txt","licenses/runed-0.35.1.txt","licenses/style-to-object-1.0.14.txt","licenses/svelte-5.56.8.txt","licenses/svelte-konva-1.0.1.txt","licenses/svelte-toolbelt-0.10.6.txt","licenses/tabbable-6.5.0.txt","licenses/tailwind-merge-3.6.0.txt","licenses/tailwind-variants-3.3.1.txt","licenses/tailwindcss-4.3.3.txt","licenses/tw-animate-css-1.4.0.txt","licenses/zod-4.4.3.txt"]

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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
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
