import { openDB } from 'idb'
import type { CollageDocumentV1 } from '../domain/types'
import type { AssetRegistry } from '../render/assetRegistry'

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
  await tx.objectStore('projects').put(document, document.projectId)
  for (const asset of Object.values(document.assets)) {
    const blob = registry.getBlob(asset.id)
    if (blob) await tx.objectStore('assetBlobs').put(blob, `${document.projectId}:${asset.id}`)
  }
  await tx.done
}

export async function loadRecovery(projectId: string): Promise<CollageDocumentV1 | undefined> {
  return (await database()).get('projects', projectId)
}

export async function loadLatestRecovery(): Promise<CollageDocumentV1 | undefined> {
  const projects = (await (await database()).getAll('projects')) as CollageDocumentV1[]
  return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

export async function loadRecoveryAssets(document: CollageDocumentV1): Promise<Map<string, Blob>> {
  const db = await database()
  const assets = new Map<string, Blob>()
  for (const asset of Object.values(document.assets)) {
    const blob = (await db.get('assetBlobs', `${document.projectId}:${asset.id}`)) as
      Blob | undefined
    if (blob) assets.set(asset.id, blob)
  }
  return assets
}
