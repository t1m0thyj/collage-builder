import { browserDatabase } from './browserDatabase'
import type { AssetRecordV1 } from '../domain/types'
import type { PreparedAssetImages } from '../render/assetRegistry'

const databaseName = 'collage-builder-preview-cache'
const storeName = 'previews'
const accessStoreName = 'previewAccess'
const metadataStoreName = 'previewMetadata'
const totalBytesKey = 'totalBytes'
const pipelineVersion = 1
const cacheLimitBytes = 192 * 1024 * 1024
let openProjectHashes = new Set<string>()
let openAssets: CollageDocumentAssets | undefined
let openReferenceKey: string | undefined
const openReferenceLifetime = 24 * 60 * 60 * 1000

/** Update synchronously so pruning cannot race an unsaved open project. */
export function setOpenPreviewAssets(assets: CollageDocumentAssets): void {
  if (assets === openAssets) return
  openAssets = assets
  openProjectHashes = new Set(Object.values(assets).map((asset) => asset.sha256))
  if (typeof indexedDB === 'undefined') return
  if (!openReferenceKey) {
    openReferenceKey = `open:${crypto.randomUUID()}`
    globalThis.addEventListener('pagehide', releaseOpenPreviewAssets)
  }
  const key = openReferenceKey
  const references = {
    hashes: [...openProjectHashes],
    expiresAt: Date.now() + openReferenceLifetime,
  }
  void database()
    .then((db) => db.put(metadataStoreName, references, key))
    .catch(() => undefined)
}

export function releaseOpenPreviewAssets(): void {
  const key = openReferenceKey
  openReferenceKey = undefined
  openAssets = undefined
  openProjectHashes.clear()
  globalThis.removeEventListener('pagehide', releaseOpenPreviewAssets)
  if (key)
    void database()
      .then((db) => db.delete(metadataStoreName, key))
      .catch(() => undefined)
}

type CollageDocumentAssets = Record<string, AssetRecordV1>

interface PreviewCacheRecord {
  key: string
  pipelineVersion: number
  width: number
  height: number
  preview: Blob
  thumbnail: Blob
  display?: Blob
  bytes: number
  accessedAt: number
}

interface PreviewAccessRecord {
  key: string
  accessedAt: number
}

const database = browserDatabase(databaseName, 2, (db) => {
  if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'key' })
  if (!db.objectStoreNames.contains(accessStoreName))
    db.createObjectStore(accessStoreName, { keyPath: 'key' })
  if (!db.objectStoreNames.contains(metadataStoreName)) db.createObjectStore(metadataStoreName)
})

function keyFor(hash: string): string {
  return `${pipelineVersion}:${hash}`
}

function isSafeBlob(blob: unknown): blob is Blob {
  return blob instanceof Blob && blob.size > 0 && blob.size <= cacheLimitBytes
}

function valid(record: unknown, asset: AssetRecordV1): record is PreviewCacheRecord {
  if (!record || typeof record !== 'object') return false
  const candidate = record as Partial<PreviewCacheRecord>
  return (
    candidate.key === keyFor(asset.sha256) &&
    candidate.pipelineVersion === pipelineVersion &&
    candidate.width === asset.width &&
    candidate.height === asset.height &&
    isSafeBlob(candidate.preview) &&
    isSafeBlob(candidate.thumbnail) &&
    (candidate.display === undefined || isSafeBlob(candidate.display)) &&
    candidate.bytes ===
      candidate.preview.size + candidate.thumbnail.size + (candidate.display?.size ?? 0) &&
    candidate.bytes <= cacheLimitBytes
  )
}

export async function loadPreviewCache(
  asset: AssetRecordV1,
): Promise<PreparedAssetImages | undefined> {
  const db = await database()
  const record = await db.get(storeName, keyFor(asset.sha256))
  if (!valid(record, asset)) return undefined
  // Keep last-access information out of the image record so opening a project
  // never rewrites its preview blobs.
  void db
    .put(accessStoreName, { key: record.key, accessedAt: Date.now() } satisfies PreviewAccessRecord)
    .catch(() => undefined)
  return {
    preview: record.preview,
    thumbnail: record.thumbnail,
    displayBlob: record.display,
  }
}

export async function savePreviewCache(
  asset: AssetRecordV1,
  images: PreparedAssetImages,
): Promise<void> {
  await savePreviewCaches([{ asset, images }])
}

export async function removePreviewCache(asset: AssetRecordV1): Promise<void> {
  const db = await database()
  const tx = db.transaction([storeName, accessStoreName, metadataStoreName], 'readwrite')
  const previews = tx.objectStore(storeName)
  const key = keyFor(asset.sha256)
  const existing = await previews.get(key)
  await previews.delete(key)
  await tx.objectStore(accessStoreName).delete(key)
  const metadata = tx.objectStore(metadataStoreName)
  const total = await metadata.get(totalBytesKey)
  if (typeof total === 'number' && validCacheRecord(existing))
    await metadata.put(Math.max(0, total - existing.bytes), totalBytesKey)
  else await metadata.delete(totalBytesKey)
  await tx.done
}

/** Disposable previews yield to authoritative recovery data under quota pressure. */
export async function evictPreviewCache(): Promise<void> {
  const db = await database()
  const tx = db.transaction([storeName, accessStoreName, metadataStoreName], 'readwrite')
  await tx.objectStore(storeName).clear()
  await tx.objectStore(accessStoreName).clear()
  await tx.objectStore(metadataStoreName).put(0, totalBytesKey)
  await tx.done
}

/** Called after recovery retention/deletion, using all surviving draft hashes. */
export async function prunePreviewCache(recoveryHashes: Iterable<string>): Promise<void> {
  const keys = new Set([...recoveryHashes, ...openProjectHashes].map(keyFor))
  const db = await database()
  const tx = db.transaction([storeName, accessStoreName, metadataStoreName], 'readwrite')
  const previews = tx.objectStore(storeName)
  const access = tx.objectStore(accessStoreName)
  const metadata = tx.objectStore(metadataStoreName)
  // Other editing tabs may have unsaved photos. Their leases survive a crashed
  // tab briefly; normal page close releases them immediately.
  for (const key of await metadata.getAllKeys()) {
    if (typeof key !== 'string' || !key.startsWith('open:')) continue
    const references = await metadata.get(key)
    if (references?.expiresAt > Date.now() && Array.isArray(references.hashes)) {
      for (const hash of references.hashes) if (typeof hash === 'string') keys.add(keyFor(hash))
    } else await metadata.delete(key)
  }
  let removedBytes = 0
  let knownRemovedBytes = true
  for (const key of await previews.getAllKeys()) {
    if (typeof key === 'string' && keys.has(key)) continue
    const record = await previews.get(key)
    if (validCacheRecord(record)) removedBytes += record.bytes
    else knownRemovedBytes = false
    await previews.delete(key)
    await access.delete(key)
  }
  const total = await metadata.get(totalBytesKey)
  let remainingBytes: number
  if (typeof total === 'number' && knownRemovedBytes)
    remainingBytes = Math.max(0, total - removedBytes)
  else {
    const remaining = (await previews.getAll()).filter(validCacheRecord)
    remainingBytes = remaining.reduce((sum, record) => sum + record.bytes, 0)
    for (const record of remaining)
      if (!(await access.get(record.key)))
        await access.put({
          key: record.key,
          accessedAt: record.accessedAt,
        } satisfies PreviewAccessRecord)
  }
  // Also repair an oversized cache left by an older writer, even when this
  // save has no eligible new entries. References protect against orphan
  // cleanup, but derived previews remain evictable to enforce the hard limit.
  if (remainingBytes > cacheLimitBytes) {
    const oldest = (await access.getAll())
      .filter(isPreviewAccessRecord)
      .sort((left, right) => left.accessedAt - right.accessedAt)
    for (const item of oldest) {
      if (remainingBytes <= cacheLimitBytes) break
      const record = await previews.get(item.key)
      await previews.delete(item.key)
      await access.delete(item.key)
      if (validCacheRecord(record)) remainingBytes -= record.bytes
    }
  }
  await metadata.put(Math.max(0, remainingBytes), totalBytesKey)
  await tx.done
}

export async function savePreviewCaches(
  entries: ReadonlyArray<{ asset: AssetRecordV1; images: PreparedAssetImages }>,
): Promise<void> {
  const prepared = entries
    .map(({ asset, images }) => ({ asset, images, key: keyFor(asset.sha256) }))
    .filter(({ images }) => isSafeBlob(images.preview) && isSafeBlob(images.thumbnail))
  if (!prepared.length) return
  // A single large autosave must not protect more data than the entire cache
  // budget. Prefer the later entries in this batch and deduplicate shared hashes.
  const records = new Map<string, { asset: AssetRecordV1; record: PreviewCacheRecord }>()
  let batchBytes = 0
  const now = Date.now()
  for (const { asset, images, key } of [...prepared].reverse()) {
    const bytes = images.preview.size + images.thumbnail.size + (images.displayBlob?.size ?? 0)
    if (
      records.has(key) ||
      batchBytes + bytes > cacheLimitBytes ||
      (images.displayBlob && !isSafeBlob(images.displayBlob))
    )
      continue
    records.set(key, {
      asset,
      record: {
        key,
        pipelineVersion,
        width: asset.width,
        height: asset.height,
        preview: images.preview,
        thumbnail: images.thumbnail,
        display: images.displayBlob,
        bytes,
        accessedAt: now,
      },
    })
    batchBytes += bytes
  }
  if (!records.size) return
  const db = await database()
  const tx = db.transaction([storeName, accessStoreName, metadataStoreName], 'readwrite')
  const previews = tx.objectStore(storeName)
  const access = tx.objectStore(accessStoreName)
  const metadata = tx.objectStore(metadataStoreName)
  const storedTotal = await metadata.get(totalBytesKey)
  let total: number
  if (typeof storedTotal === 'number') total = storedTotal
  else {
    const existingRecords = (await previews.getAll()).filter(validCacheRecord)
    total = existingRecords.reduce((bytes, record) => bytes + record.bytes, 0)
    // Version 1 stored access time beside the blobs. Seed its lightweight
    // replacement once so those previews remain eligible for LRU eviction.
    for (const record of existingRecords)
      await access.put({
        key: record.key,
        accessedAt: record.accessedAt,
      } satisfies PreviewAccessRecord)
  }
  const writes: PreviewCacheRecord[] = []
  let addedBytes = 0
  for (const { asset, record } of records.values()) {
    const existing = await previews.get(record.key)
    // Derived images are deterministic for a source hash and pipeline version.
    // Skip the blob write when autosave sees an already cached preview.
    if (!valid(existing, asset) || existing.bytes !== record.bytes) {
      addedBytes += record.bytes - (validCacheRecord(existing) ? existing.bytes : 0)
      writes.push(record)
    }
  }
  if (total + addedBytes > cacheLimitBytes) {
    const accessRecords = (await access.getAll())
      .filter(isPreviewAccessRecord)
      .sort((left, right) => left.accessedAt - right.accessedAt)
    for (const item of accessRecords) {
      if (total + addedBytes <= cacheLimitBytes) break
      if (records.has(item.key)) continue
      const record = await previews.get(item.key)
      await previews.delete(item.key)
      await access.delete(item.key)
      if (validCacheRecord(record)) total -= record.bytes
    }
  }
  // Eviction requests precede the new Blob writes, limiting quota pressure as
  // well as the final committed size.
  for (const record of writes) await previews.put(record)
  total += addedBytes
  for (const key of records.keys())
    await access.put({ key, accessedAt: now } satisfies PreviewAccessRecord)
  await metadata.put(Math.max(0, total), totalBytesKey)
  await tx.done
}

function validCacheRecord(record: unknown): record is PreviewCacheRecord {
  const candidate = record as Partial<PreviewCacheRecord>
  return (
    !!candidate &&
    typeof candidate.key === 'string' &&
    typeof candidate.bytes === 'number' &&
    Number.isFinite(candidate.bytes) &&
    candidate.bytes >= 0 &&
    typeof candidate.accessedAt === 'number'
  )
}

function isPreviewAccessRecord(record: unknown): record is PreviewAccessRecord {
  const candidate = record as Partial<PreviewAccessRecord>
  return (
    !!candidate && typeof candidate.key === 'string' && typeof candidate.accessedAt === 'number'
  )
}
