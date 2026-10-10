import { browserDatabase } from './browserDatabase'
import type { CollageDocumentV1 } from '../domain/types'
import { migrateDocument } from '../domain/migrations'
import type { AssetRegistry } from '../render/assetRegistry'
import { createRecoveryPreview } from '../render/recoveryPreview'
import { evictPreviewCache, prunePreviewCache, savePreviewCaches } from './previewCache'

const recoveryLimit = 5
const recoveryPreviewStore = 'recoveryPreviews'

export interface RecoverySummary {
  projectId: string
  title: string
  updatedAt?: string
  bytes: number
  assetCount: number
  corrupt: boolean
  preview?: Blob
}

export interface RecoveryStorageEstimate {
  usage?: number
  quota?: number
  persisted?: boolean
  persistenceSupported: boolean
}

export interface RecoveryManagementSnapshot {
  recoveries: RecoverySummary[]
  storage: RecoveryStorageEstimate
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// Version 2 already exists in older installations without recoveryPreviews.
// Adding that store requires a new version so IndexedDB runs the upgrade.
const database = browserDatabase('collage-builder', 3, (db) => {
  if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects')
  if (!db.objectStoreNames.contains('assetBlobs')) db.createObjectStore('assetBlobs')
  if (!db.objectStoreNames.contains(recoveryPreviewStore))
    db.createObjectStore(recoveryPreviewStore)
})

export async function saveRecovery(
  document: CollageDocumentV1,
  registry: AssetRegistry,
): Promise<void> {
  const savedDocument = migrateDocument(document)
  const previewAssets = new Map<string, Blob>()
  for (const asset of Object.values(document.assets)) {
    const prepared = registry.getPreparedImages(asset.id)
    const source = prepared?.preview ?? registry.getBlob(asset.id)
    if (source) previewAssets.set(asset.id, source)
  }
  const recoveryPreview = await createRecoveryPreview(savedDocument, previewAssets).catch(
    () => undefined,
  )
  let retainedProjects: CollageDocumentV1[]
  try {
    retainedProjects = await commitRecovery(savedDocument, registry, recoveryPreview)
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') throw error
    // The aborted transaction preserves the previous recovery. Reclaim only
    // reproducible previews, then try the authoritative write once more.
    await evictPreviewCache().catch(() => undefined)
    retainedProjects = await commitRecovery(savedDocument, registry, recoveryPreview)
  }

  // Original recovery data has committed at this point. Derived previews are a
  // best-effort acceleration layer, so quota pressure must not fail autosave.
  await savePreviewCaches(
    Object.values(document.assets).flatMap((asset) => {
      const prepared = registry.getPreparedImages(asset.id)
      return prepared ? [{ asset, images: prepared }] : []
    }),
  ).catch(() => undefined)
  await prunePreviewCache(
    retainedProjects.flatMap((project) =>
      Object.values(project.assets).map((asset) => asset.sha256),
    ),
  ).catch(() => undefined)
}

async function commitRecovery(
  document: CollageDocumentV1,
  registry: AssetRegistry,
  recoveryPreview?: Blob,
): Promise<CollageDocumentV1[]> {
  const db = await database()
  const tx = db.transaction(['projects', 'assetBlobs', recoveryPreviewStore], 'readwrite')
  // Individual requests can fail before tx.done is awaited.
  void tx.done.catch(() => undefined)
  const projects = tx.objectStore('projects')
  const assetBlobs = tx.objectStore('assetBlobs')
  const previews = tx.objectStore(recoveryPreviewStore)
  try {
    await projects.put(document, document.projectId)
    if (recoveryPreview) await previews.put(recoveryPreview, document.projectId)
    for (const asset of Object.values(document.assets)) {
      const blob = registry.getBlob(asset.id)
      if (blob) {
        const key = `${document.projectId}:${asset.id}:${asset.sha256}`
        if ((await assetBlobs.getKey(key)) === undefined) await assetBlobs.put(blob, key)
      }
    }

    const savedProjects: CollageDocumentV1[] = []
    for (const key of await projects.getAllKeys()) {
      try {
        savedProjects.push(migrateDocument(await projects.get(key)))
      } catch {
        await projects.delete(key)
      }
    }
    const retainedProjects = savedProjects
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, recoveryLimit)
    const retainedProjectIds = new Set(retainedProjects.map((project) => project.projectId))
    const retainedBlobKeys = new Set(
      retainedProjects.flatMap((project) =>
        Object.values(project.assets).map(
          (asset) => `${project.projectId}:${asset.id}:${asset.sha256}`,
        ),
      ),
    )
    for (const project of savedProjects)
      if (!retainedProjectIds.has(project.projectId)) {
        await projects.delete(project.projectId)
        await previews.delete(project.projectId)
      }
    for (const key of await assetBlobs.getAllKeys())
      if (typeof key === 'string' && !retainedBlobKeys.has(key)) await assetBlobs.delete(key)
    await tx.done
    return retainedProjects
  } catch (error) {
    try {
      tx.abort()
    } catch {
      /* The database may already have aborted it. */
    }
    await tx.done.catch(() => undefined)
    throw error
  }
}

export async function loadRecovery(projectId: string): Promise<CollageDocumentV1 | undefined> {
  const stored = await (await database()).get('projects', projectId)
  if (!stored) return undefined
  try {
    return migrateDocument(stored)
  } catch {
    return undefined
  }
}

export async function loadLatestRecovery(): Promise<CollageDocumentV1 | undefined> {
  const projects: CollageDocumentV1[] = []
  for (const stored of await (await database()).getAll('projects')) {
    try {
      projects.push(migrateDocument(stored))
    } catch {
      // Ignore a corrupt or obsolete recovery and continue to the next valid snapshot.
    }
  }
  return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

export async function loadLatestRecoverySummary(): Promise<
  { document: CollageDocumentV1; preview?: Blob } | undefined
> {
  const db = await database()
  const projects: CollageDocumentV1[] = []
  for (const stored of await db.getAll('projects')) {
    try {
      projects.push(migrateDocument(stored))
    } catch {
      // A corrupt recovery cannot be offered at startup.
    }
  }
  const document = projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
  if (!document) return undefined
  const preview = (await db.get(recoveryPreviewStore, document.projectId)) as Blob | undefined
  return { document, preview: preview instanceof Blob ? preview : undefined }
}

export async function loadRecoveryAssets(document: CollageDocumentV1): Promise<Map<string, Blob>> {
  const db = await database()
  const entries = Object.values(document.assets)
  const verified = new Array<Blob | undefined>(entries.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(3, entries.length) }, async () => {
      while (next < entries.length) {
        const index = next++
        const asset = entries[index]
        const blob = ((await db.get(
          'assetBlobs',
          `${document.projectId}:${asset.id}:${asset.sha256}`,
        )) ?? (await db.get('assetBlobs', `${document.projectId}:${asset.id}`))) as Blob | undefined
        if (blob && blob.size === asset.byteLength && (await sha256(blob)) === asset.sha256)
          verified[index] = blob.slice(0, blob.size, asset.mediaType)
      }
    }),
  )
  const assets = new Map<string, Blob>()
  entries.forEach((asset, index) => {
    const blob = verified[index]
    if (blob) assets.set(asset.id, blob)
  })
  return assets
}

function projectBlobPrefix(projectId: string): string {
  return `${projectId}:`
}

async function recoveryBytes(
  projectId: string,
  stored: unknown,
  assetBlobs: {
    getAllKeys: () => Promise<IDBValidKey[]>
    get: (key: IDBValidKey) => Promise<unknown>
  },
): Promise<number> {
  let bytes = 0
  try {
    bytes = new TextEncoder().encode(JSON.stringify(stored)).byteLength
  } catch {
    // A malformed record should remain visible and removable in the manager.
  }
  const prefix = projectBlobPrefix(projectId)
  for (const key of await assetBlobs.getAllKeys()) {
    if (typeof key !== 'string' || !key.startsWith(prefix)) continue
    const blob = await assetBlobs.get(key)
    if (blob instanceof Blob) bytes += blob.size
  }
  return bytes
}

export async function getRecoveryStorageEstimate(): Promise<RecoveryStorageEstimate> {
  const storage = navigator.storage
  if (!storage) return { persistenceSupported: false }
  const estimate: StorageEstimate = await storage.estimate().catch(() => ({}))
  const persistenceSupported =
    typeof storage.persist === 'function' && typeof storage.persisted === 'function'
  const persisted = persistenceSupported
    ? await storage.persisted().catch(() => undefined)
    : undefined
  return {
    usage: estimate.usage,
    quota: estimate.quota,
    persisted,
    persistenceSupported,
  }
}

export async function requestPersistentStorage(): Promise<boolean | undefined> {
  const storage = navigator.storage
  if (!storage || typeof storage.persist !== 'function') return undefined
  return storage.persist()
}

export async function getRecoveryManagementSnapshot(): Promise<RecoveryManagementSnapshot> {
  const db = await database()
  const tx = db.transaction(['projects', 'assetBlobs'], 'readonly')
  const projects = tx.objectStore('projects')
  const assetBlobs = tx.objectStore('assetBlobs')
  const recoveries: RecoverySummary[] = []
  const previewSources: Array<{
    document: CollageDocumentV1
    summary: RecoverySummary
  }> = []
  for (const key of await projects.getAllKeys()) {
    if (typeof key !== 'string') continue
    const stored = await projects.get(key)
    try {
      const document = migrateDocument(stored)
      const summary: RecoverySummary = {
        projectId: document.projectId,
        title: document.title,
        updatedAt: document.updatedAt,
        bytes: await recoveryBytes(key, stored, assetBlobs),
        assetCount: Object.keys(document.assets).length,
        corrupt: false,
      }
      recoveries.push(summary)
      previewSources.push({ document, summary })
    } catch {
      recoveries.push({
        projectId: key,
        title: 'Unreadable recovery',
        bytes: await recoveryBytes(key, stored, assetBlobs),
        assetCount: 0,
        corrupt: true,
      })
    }
  }
  await tx.done
  for (const { document, summary } of previewSources)
    summary.preview = await createRecoveryPreview(document, async (assetId) => {
      const asset = document.assets[assetId]
      if (!asset) return undefined
      const blob = ((await db.get(
        'assetBlobs',
        `${document.projectId}:${asset.id}:${asset.sha256}`,
      )) ?? (await db.get('assetBlobs', `${document.projectId}:${asset.id}`))) as Blob | undefined
      return blob?.slice(0, blob.size, asset.mediaType)
    }).catch(() => undefined)
  recoveries.sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''))
  return { recoveries, storage: await getRecoveryStorageEstimate() }
}

export async function deleteRecovery(projectId: string): Promise<void> {
  const db = await database()
  const tx = db.transaction(['projects', 'assetBlobs', recoveryPreviewStore], 'readwrite')
  await tx.objectStore('projects').delete(projectId)
  await tx.objectStore(recoveryPreviewStore).delete(projectId)
  const assetBlobs = tx.objectStore('assetBlobs')
  const prefix = projectBlobPrefix(projectId)
  for (const key of await assetBlobs.getAllKeys())
    if (typeof key === 'string' && key.startsWith(prefix)) await assetBlobs.delete(key)
  await tx.done
  await prunePreviewCache(
    (await db.getAll('projects')).flatMap((stored) => {
      try {
        return Object.values(migrateDocument(stored).assets).map((asset) => asset.sha256)
      } catch {
        return []
      }
    }),
  ).catch(() => undefined)
}

export async function clearRecoveries(): Promise<void> {
  const db = await database()
  const tx = db.transaction(['projects', 'assetBlobs', recoveryPreviewStore], 'readwrite')
  await Promise.all([
    tx.objectStore('projects').clear(),
    tx.objectStore('assetBlobs').clear(),
    tx.objectStore(recoveryPreviewStore).clear(),
  ])
  await tx.done
  await prunePreviewCache([]).catch(() => undefined)
}
