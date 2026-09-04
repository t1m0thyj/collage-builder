import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const workerFileName = 'service-worker.js'

function publicFileNames(directory: string): string[] {
  if (!directory || !existsSync(directory)) return []

  const files: string[] = []
  const visit = (currentDirectory: string) => {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      const path = resolve(currentDirectory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(relative(directory, path).split(sep).join('/'))
    }
  }

  visit(directory)
  return files
}

export function createOfflineWorkerSource(files: string[], revision: string): string {
  const precacheFiles = [...new Set(files)].filter((file) => file !== workerFileName).sort()

  return `const CACHE_PREFIX = \`collage-builder-shell:\${self.registration.scope}:\`
const CACHE_NAME = CACHE_PREFIX + ${JSON.stringify(revision)}
const PRECACHE_FILES = ${JSON.stringify(precacheFiles)}

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
`
}

export function offlineServiceWorker(): Plugin {
  let config: ResolvedConfig

  return {
    name: 'collage-builder-offline-service-worker',
    apply: 'build',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    generateBundle(_options, bundle) {
      const publicFiles = publicFileNames(config.publicDir).filter(
        (file) => file !== workerFileName,
      )
      const bundleFiles = Object.keys(bundle).filter((file) => file !== workerFileName)
      const files = [...new Set(['', 'index.html', ...bundleFiles, ...publicFiles])].sort()

      const contentHash = createHash('sha256')
      contentHash.update(readFileSync(resolve(config.root, 'index.html')))
      for (const file of bundleFiles) {
        const output = bundle[file]
        contentHash.update(file)
        contentHash.update(output.type === 'chunk' ? output.code : output.source)
      }
      for (const file of publicFiles) {
        contentHash.update(file)
        contentHash.update(readFileSync(resolve(config.publicDir, file)))
      }

      const revision = contentHash.digest('hex').slice(0, 16)
      this.emitFile({
        type: 'asset',
        fileName: workerFileName,
        source: createOfflineWorkerSource(files, revision),
      })
    },
  }
}
