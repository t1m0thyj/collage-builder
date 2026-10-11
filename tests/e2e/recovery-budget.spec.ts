import { test, expect } from './test-fixtures'
import { createProject, redPng, createHash } from './test-helpers'

test('the recovery byte cap evicts oldest drafts atomically and rolls back failed saves', async ({
  page,
}) => {
  // Exercise the production retention path with a small cap and real stored originals.
  await page.route('**/src/lib/persistence/limits.ts*', async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    const modified = source.replace(
      /const maxRecoveryBytes = 2 \* 1024 \* 1024 \* 1024/,
      'const maxRecoveryBytes = 256 * 1024',
    )
    expect(modified).not.toBe(source)
    await route.fulfill({ response, body: modified })
  })
  await page.goto('/')
  const drafts = Array.from({ length: 4 }, (_, index) => {
    const document = createProject(`Budget draft ${index}`)
    document.updatedAt =
      ['2026-01-01', '2026-02-01', '2025-01-01', '2026-03-01'][index] + 'T00:00:00.000Z'
    const id = crypto.randomUUID()
    const bytes = Buffer.concat([redPng, Buffer.alloc(96 * 1024, index)])
    document.assets[id] = {
      id,
      originalName: 'photo.png',
      mediaType: 'image/png',
      byteLength: bytes.length,
      width: 96,
      height: 64,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      storage: { kind: 'embedded', archivePath: `assets/${id}` },
    }
    return { document, id, bytes: [...bytes] }
  })
  const result = await page.evaluate(async (drafts) => {
    const { saveRecovery, loadRecovery, loadRecoveryAssets } =
      await import('/src/lib/persistence/autosave.ts')
    const { AssetRegistry } = await import('/src/lib/render/assetRegistry.ts')
    const { retainRecoveries } = await import('/src/lib/persistence/recoveryRetention.ts')
    const save = async (draft: (typeof drafts)[number]) => {
      const registry = new AssetRegistry()
      const asset = draft.document.assets[draft.id]
      registry.bindOriginal(
        draft.id,
        new Blob([new Uint8Array(draft.bytes)], { type: 'image/png' }),
        asset.sha256,
      )
      try {
        await saveRecovery(draft.document, registry)
      } finally {
        registry.clear()
      }
    }
    await save(drafts[0])
    await save(drafts[1])
    await save(drafts[2])
    const before = await Promise.all(
      drafts.slice(0, 3).map((draft) => loadRecovery(draft.document.projectId)),
    )
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (
        this.name === 'assetBlobs' &&
        typeof key === 'string' &&
        key.startsWith(drafts[3].document.projectId)
      )
        throw new DOMException('Controlled write failure', 'UnknownError')
      return put.call(this, value, key)
    }
    let failed = false
    try {
      await save(drafts[3])
    } catch {
      failed = true
    } finally {
      IDBObjectStore.prototype.put = put
    }
    const after = await Promise.all(drafts.map((draft) => loadRecovery(draft.document.projectId)))
    const restored = await loadRecoveryAssets(drafts[2].document)
    return {
      before: before.map((document) => document?.projectId ?? null),
      after: after.map((document) => document?.projectId ?? null),
      failed,
      restoredSize: restored.get(drafts[2].id)?.size,
      retainedBytes: retainRecoveries(
        after.filter((document) => document !== undefined),
        drafts[2].document.projectId,
        new Map(),
      ).bytes,
    }
  }, drafts)
  expect(result.before).toEqual([null, drafts[1].document.projectId, drafts[2].document.projectId])
  expect(result.after).toEqual([...result.before, null])
  expect(result.failed).toBe(true)
  expect(result.restoredSize).toBe(drafts[2].bytes.length)
  expect(result.retainedBytes).toBeLessThanOrEqual(256 * 1024)
})
