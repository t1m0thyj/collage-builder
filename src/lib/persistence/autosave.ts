import { openDB } from 'idb'
import type { CollageDocumentV1 } from '../domain/types'
import { migrateDocument } from '../domain/migrations'
import type { AssetRegistry } from '../render/assetRegistry'

const recoveryLimit = 5

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const database = () =>
  openDB('collage-builder', 1, {
    upgrade(db) {
      db.createObjectStore('projects')
      db.createObjectStore('assetBlobs')
    },
  })

export async function saveRecovery(
  document: CollageDocumentV1,
  registry: AssetRegistry,
): Promise<void> {
  const db = await database()
  const tx = db.transaction(['projects', 'assetBlobs'], 'readwrite')
  const projects = tx.objectStore('projects')
  const assetBlobs = tx.objectStore('assetBlobs')
  await projects.put(document, document.projectId)
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
