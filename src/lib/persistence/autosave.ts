import { openDB } from 'idb'
import type { CollageDocumentV1 } from '../domain/types'
import { migrateDocument } from '../domain/migrations'
import type { AssetRegistry } from '../render/assetRegistry'
import { createRecoveryPreview } from '../render/recoveryPreview'

const recoveryLimit = 5

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

// Open the browser's current recovery database version, including older local upgrades.
const database = () =>
  openDB('collage-builder', undefined, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects')
      if (!db.objectStoreNames.contains('assetBlobs')) db.createObjectStore('assetBlobs')
    },
  })

export async function saveRecovery(
  document: CollageDocumentV1,
  registry: AssetRegistry,
): Promise<void> {
  const savedDocument = migrateDocument(document)
  const db = await database()
  const tx = db.transaction(['projects', 'assetBlobs'], 'readwrite')
  const projects = tx.objectStore('projects')
  const assetBlobs = tx.objectStore('assetBlobs')
  await projects.put(savedDocument, savedDocument.projectId)
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
    if (!retainedProjectIds.has(project.projectId)) await projects.delete(project.projectId)
  for (const key of await assetBlobs.getAllKeys())
    if (typeof key === 'string' && !retainedBlobKeys.has(key)) await assetBlobs.delete(key)
  await tx.done
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

export async function loadRecoveryAssets(document: CollageDocumentV1): Promise<Map<string, Blob>> {
  const db = await database()
  const assets = new Map<string, Blob>()
  for (const asset of Object.values(document.assets)) {
    const blob = ((await db.get(
      'assetBlobs',
      `${document.projectId}:${asset.id}:${asset.sha256}`,
    )) ?? (await db.get('assetBlobs', `${document.projectId}:${asset.id}`))) as Blob | undefined
    if (blob && blob.size === asset.byteLength && (await sha256(blob)) === asset.sha256)
      assets.set(asset.id, blob.slice(0, blob.size, asset.mediaType))
  }
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
  const tx = db.transaction(['projects', 'assetBlobs'], 'readwrite')
  await tx.objectStore('projects').delete(projectId)
  const assetBlobs = tx.objectStore('assetBlobs')
  const prefix = projectBlobPrefix(projectId)
  for (const key of await assetBlobs.getAllKeys())
    if (typeof key === 'string' && key.startsWith(prefix)) await assetBlobs.delete(key)
  await tx.done
}

export async function clearRecoveries(): Promise<void> {
  const db = await database()
  const tx = db.transaction(['projects', 'assetBlobs'], 'readwrite')
  await Promise.all([tx.objectStore('projects').clear(), tx.objectStore('assetBlobs').clear()])
  await tx.done
}
