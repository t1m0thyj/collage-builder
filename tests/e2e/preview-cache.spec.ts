import { test, expect } from './test-fixtures'
import { importImage, redPng, bluePng } from './test-helpers'

test('ordinary edits skip retained-history scans after replacing a photo', async ({ page }) => {
  await page.goto('/')
  await importImage(page, 'original.png', redPng)
  await page.getByRole('button', { name: 'Actions for original.png' }).click()
  await page.getByRole('menuitem', { name: 'Replace original' }).click()
  await page.getByTestId('photo-replacement-input').setInputFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: bluePng,
  })
  await expect(
    page.locator('.sidebar-asset-card').getByText('replacement.png', { exact: true }),
  ).toBeVisible()
  await page.evaluate(async () => {
    const modulePath = '/src/lib/render/assetRegistry.ts'
    const { AssetRegistry } = await import(modulePath)
    const original = AssetRegistry.prototype.reconcileRetainedHistory
    let scans = 0
    AssetRegistry.prototype.reconcileRetainedHistory = function (...args: unknown[]) {
      scans++
      return original.apply(this, args)
    }
    Reflect.set(globalThis, 'readRetentionScans', () => scans)
  })
  for (let index = 0; index < 5; index++) {
    await page.getByRole('textbox', { name: 'Project title' }).fill(`Edit ${index}`)
    await page.getByRole('textbox', { name: 'Project title' }).press('Tab')
  }
  expect(await page.evaluate(() => Reflect.get(globalThis, 'readRetentionScans')())).toBe(0)
})

test('preview cache bounds an oversized batch and preserves only referenced entries', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'Windows WebKit cannot clone Blob values into IndexedDB')
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/persistence/previewCache.ts'
    const cache = await import(modulePath)
    const idbPath = '/node_modules/.vite/deps/idb.js'
    const { openDB } = await import(idbPath)
    const megabyte = new Uint8Array(1024 * 1024)
    const preview = new Blob(Array(26).fill(megabyte), { type: 'image/webp' })
    const thumbnail = new Blob(['thumbnail'])
    const assets = Array.from({ length: 8 }, (_, index) => ({
      id: `photo-${index}`,
      sha256: `hash-${index}`,
      width: 100,
      height: 100,
      byteLength: 1,
      originalName: `${index}.png`,
      mediaType: 'image/png',
      storage: { kind: 'embedded', archivePath: `assets/${index}` },
    }))
    await cache.savePreviewCaches(
      assets.map((asset) => ({ asset, images: { preview, thumbnail } })),
    )
    const db = await openDB('collage-builder-preview-cache')
    const before = await db.getAll('previews')
    const bytes = before.reduce((sum: number, record: { bytes: number }) => sum + record.bytes, 0)
    // Reproduce a cache that an older writer allowed to exceed the budget.
    await db.put('previews', { ...before[0], key: '1:hash-0', accessedAt: 0 })
    await db.put('previewAccess', { key: '1:hash-0', accessedAt: 0 })
    await db.put('previewMetadata', bytes + before[0].bytes, 'totalBytes')
    await cache.prunePreviewCache(assets.map((asset) => asset.sha256))
    const repairedBytes = await db.get('previewMetadata', 'totalBytes')
    const writes: string[] = []
    const originalPut = IDBObjectStore.prototype.put
    const originalDelete = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'previews') writes.push('put')
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key)
    }
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === 'previews') writes.push('delete')
      return originalDelete.call(this, key)
    }
    try {
      await cache.savePreviewCache(
        { ...assets[0], sha256: 'large' },
        {
          preview: new Blob(Array(96).fill(megabyte)),
          thumbnail,
        },
      )
    } finally {
      IDBObjectStore.prototype.put = originalPut
      IDBObjectStore.prototype.delete = originalDelete
    }
    const updatedBytes = (await db.getAll('previews')).reduce(
      (sum: number, record: { bytes: number }) => sum + record.bytes,
      0,
    )
    const protectedAsset = assets[7]
    cache.setOpenPreviewAssets({ [protectedAsset.id]: protectedAsset })
    await cache.prunePreviewCache([assets[6].sha256])
    const retained = (await db.getAllKeys('previews')).sort()
    cache.releaseOpenPreviewAssets()
    await cache.prunePreviewCache([])
    const remaining = await db.count('previews')
    const total = await db.get('previewMetadata', 'totalBytes')
    db.close()
    return {
      count: before.length,
      bytes,
      repairedBytes,
      updatedBytes,
      firstWrite: writes[0],
      retained,
      remaining,
      total,
    }
  })
  expect(result.count).toBe(7)
  expect(result.bytes).toBeLessThanOrEqual(200 * 1024 * 1024)
  expect(result.repairedBytes).toBeLessThanOrEqual(200 * 1024 * 1024)
  expect(result.updatedBytes).toBeLessThanOrEqual(200 * 1024 * 1024)
  expect(result.firstWrite).toBe('delete')
  expect(result.retained).toEqual(['1:hash-6', '1:hash-7'])
  expect(result.remaining).toBe(0)
  expect(result.total).toBe(0)
})

test('undecodable cached previews regenerate from the original photo', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'Windows WebKit cannot clone Blob values into IndexedDB')
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const cachePath = '/src/lib/persistence/previewCache.ts'
    const registryPath = '/src/lib/render/assetRegistry.ts'
    const sessionPath = '/src/lib/app/imageSession.ts'
    const factoriesPath = '/src/lib/domain/factories.ts'
    const cache = await import(cachePath)
    const { AssetRegistry } = await import(registryPath)
    const { preparePageImages } = await import(sessionPath)
    const { createProject, defaultPlacement } = await import(factoriesPath)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 8
    canvas.getContext('2d')!.fillRect(0, 0, 8, 8)
    const original = await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob!), 'image/png'),
    )
    const digest = await crypto.subtle.digest('SHA-256', await original.arrayBuffer())
    const sha256 = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
    const asset = {
      id: crypto.randomUUID(),
      sha256,
      width: 8,
      height: 8,
      originalName: 'photo.png',
      mediaType: 'image/png',
      byteLength: original.size,
      storage: { kind: 'embedded', archivePath: 'assets/photo.png' },
    }
    const project = createProject()
    project.assets[asset.id] = asset
    const page = project.pages[0]
    page.slots[Object.keys(page.slots)[0]] = { assetId: asset.id, placement: defaultPlacement() }
    await cache.savePreviewCache(asset, {
      preview: new Blob(['broken']),
      thumbnail: new Blob(['broken']),
    })
    const registry = new AssetRegistry()
    registry.bindOriginal(asset.id, original, sha256)
    await preparePageImages(page, registry, () => true, undefined, undefined, project.assets)
    const images = registry.getPreparedImages(asset.id)
    await cache.savePreviewCache(asset, images)
    const cached = await cache.loadPreviewCache(asset)
    const bitmap = await createImageBitmap(cached.thumbnail)
    const dimensions = [bitmap.width, bitmap.height]
    bitmap.close()
    const preservedOriginal = registry.getBlob(asset.id) === original
    registry.clear()
    return { dimensions, preservedOriginal }
  })
  expect(result.dimensions).toEqual([8, 8])
  expect(result.preservedOriginal).toBe(true)
})

test('cache and recovery connections release schema upgrades from another tab', async ({
  page,
}) => {
  await page.goto('/')
  const versions = await page.evaluate(async () => {
    const cachePath = '/src/lib/persistence/previewCache.ts'
    const recoveryPath = '/src/lib/persistence/autosave.ts'
    const cache = await import(cachePath)
    const recovery = await import(recoveryPath)
    await cache.prunePreviewCache([])
    await recovery.loadLatestRecoverySummary()
    const upgrade = (name: string, version: number) =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open(name, version)
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error(`Upgrade blocked: ${name}`))
        request.onsuccess = () => {
          const db = request.result
          resolve(db.version)
          db.close()
        }
      })
    return [await upgrade('collage-builder-preview-cache', 3), await upgrade('collage-builder', 4)]
  })
  expect(versions).toEqual([3, 4])
})
