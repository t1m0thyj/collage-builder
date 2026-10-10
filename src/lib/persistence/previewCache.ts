import { openDB } from 'idb'
import type { AssetRecordV1 } from '../domain/types'
import type { PreparedAssetImages } from '../render/assetRegistry'

const databaseName = 'collage-builder-preview-cache'
const storeName = 'previews'
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

const database = () =>
  openDB(databaseName, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(storeName))
        db.createObjectStore(storeName, { keyPath: 'key' })
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
  const updated: PreviewCacheRecord = { ...record, accessedAt: Date.now() }
  // Last-access information is useful for eviction, but must never make opening a project fail.
  void db.put(storeName, updated).catch(() => undefined)
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
  if (!isSafeBlob(images.preview) || !isSafeBlob(images.thumbnail)) return
  const db = await database()
  const record: PreviewCacheRecord = {
    key: keyFor(asset.sha256),
    pipelineVersion,
    width: asset.width,
    height: asset.height,
    preview: images.preview,
    thumbnail: images.thumbnail,
    display: images.displayBlob,
    bytes: images.preview.size + images.thumbnail.size + (images.displayBlob?.size ?? 0),
    accessedAt: Date.now(),
  }
  if (record.bytes > cacheLimitBytes) return
  await db.put(storeName, record)
  const all = (await db.getAll(storeName)).filter(validCacheRecord)
  let bytes = all.reduce((total, item) => total + item.bytes, 0)
  for (const item of all.sort((left, right) => left.accessedAt - right.accessedAt)) {
    if (bytes <= cacheLimitBytes) break
    if (item.key === record.key) continue
    await db.delete(storeName, item.key)
    bytes -= item.bytes
  }
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
