import { openDB } from 'idb'
import type { AssetRecordV1 } from '../domain/types'
import type { PreparedAssetImages } from '../render/assetRegistry'

const databaseName = 'collage-builder-preview-cache'
const storeName = 'previews'
const accessStoreName = 'previewAccess'
const metadataStoreName = 'previewMetadata'
const totalBytesKey = 'totalBytes'
const pipelineVersion = 1
const cacheLimitBytes = 192 * 1024 * 1024

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

const database = () =>
  openDB(databaseName, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(storeName))
        db.createObjectStore(storeName, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(accessStoreName))
        db.createObjectStore(accessStoreName, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(metadataStoreName)) db.createObjectStore(metadataStoreName)
    },
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
    (candidate.display === undefined || isSafeBlob(candidate.display))
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

export async function savePreviewCaches(
  entries: ReadonlyArray<{ asset: AssetRecordV1; images: PreparedAssetImages }>,
): Promise<void> {
  const prepared = entries
    .map(({ asset, images }) => ({ asset, images, key: keyFor(asset.sha256) }))
    .filter(({ images }) => isSafeBlob(images.preview) && isSafeBlob(images.thumbnail))
  if (!prepared.length) return
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
  const retainedKeys = new Set<string>()
  const now = Date.now()
  for (const { asset, images, key } of prepared) {
    const record: PreviewCacheRecord = {
      key,
      pipelineVersion,
      width: asset.width,
      height: asset.height,
      preview: images.preview,
      thumbnail: images.thumbnail,
      display: images.displayBlob,
      bytes: images.preview.size + images.thumbnail.size + (images.displayBlob?.size ?? 0),
      accessedAt: now,
    }
    if (record.bytes > cacheLimitBytes) continue
    const existing = await previews.get(key)
    retainedKeys.add(key)
    // Derived images are deterministic for a source hash and pipeline version.
    // Skip the blob write when autosave sees an already cached preview.
    if (!valid(existing, asset) || existing.bytes !== record.bytes) {
      if (validCacheRecord(existing)) total -= existing.bytes
      await previews.put(record)
      total += record.bytes
    }
    await access.put({ key, accessedAt: now } satisfies PreviewAccessRecord)
  }
  if (total > cacheLimitBytes) {
    const accessRecords = (await access.getAll())
      .filter(isPreviewAccessRecord)
      .sort((left, right) => left.accessedAt - right.accessedAt)
    for (const item of accessRecords) {
      if (total <= cacheLimitBytes) break
      if (retainedKeys.has(item.key)) continue
      const record = await previews.get(item.key)
      await previews.delete(item.key)
      await access.delete(item.key)
      if (validCacheRecord(record)) total -= record.bytes
    }
  }
  await metadata.put(Math.max(0, total), totalBytesKey)
  await tx.done
}

function validCacheRecord(record: unknown): record is PreviewCacheRecord {
  const candidate = record as Partial<PreviewCacheRecord>
  return (
    !!candidate &&
    typeof candidate.key === 'string' &&
    typeof candidate.bytes === 'number' &&
    typeof candidate.accessedAt === 'number'
  )
}

function isPreviewAccessRecord(record: unknown): record is PreviewAccessRecord {
  const candidate = record as Partial<PreviewAccessRecord>
  return (
    !!candidate && typeof candidate.key === 'string' && typeof candidate.accessedAt === 'number'
  )
}
