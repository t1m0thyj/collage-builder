import { describe, expect, it } from 'vitest'
import { createOfflineWorkerSource } from '../../build/offlineServiceWorker'

describe('offline service worker generation', () => {
  it('precache files are stable, unique, and exclude the worker itself', () => {
    const source = createOfflineWorkerSource(
      ['index.html', 'assets/app-123.js', 'index.html', 'service-worker.js'],
      'revision-1',
    )

    expect(source).toContain('const PRECACHE_FILES = ["assets/app-123.js","index.html"]')
    expect(source).toContain('const CACHE_NAME = CACHE_PREFIX + "revision-1"')
    expect(source).toContain("caches.match(scopedUrl('index.html'))")
    expect(source).not.toContain('"service-worker.js"')
  })
})
