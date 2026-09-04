import { migrateDocument } from '../domain/migrations'
import type { CollageDocumentV1 } from '../domain/types'
import { unzipBlobBounded, zipBlobs, type ZipBlobEntry } from './zipStreams'
import { maxProjectBytes } from './limits'
import { collageMimeType } from './formats'

export { collageMimeType } from './formats'
export { maxProjectBytes } from './limits'

export interface ArchiveAssets {
  get(assetId: string): Blob | undefined
}
export interface OpenedArchive {
  document: CollageDocumentV1
  assets: Map<string, Blob>
  missingAssetIds: string[]
}
const maxEntries = 500
const maxEntryBytes = 64 * 1024 * 1024
const maxDocumentBytes = 16 * 1024 * 1024
const maxExpandedBytes = maxProjectBytes + maxDocumentBytes
const maxArchiveFileBytes = maxExpandedBytes + 1024 * 1024

function assertSafeEntryName(path: string): void {
  if (path.startsWith('/') || path.includes('..') || path.includes('\\'))
    throw new Error('Project archive contains an unsafe path')
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createArchive(
  document: CollageDocumentV1,
  assets: ArchiveAssets,
): Promise<Blob> {
  if (
    Object.values(document.assets).reduce((total, asset) => total + asset.byteLength, 0) >
    maxProjectBytes
  )
    throw new Error('Project assets exceed the 256 MB safety limit')
  const savedDocument = structuredClone(document)
  for (const asset of Object.values(savedDocument.assets)) {
    asset.storage = { kind: 'embedded', archivePath: `assets/${asset.id}` }
  }
  const files: ZipBlobEntry[] = [
    { name: 'mimetype', blob: new Blob([collageMimeType]) },
    { name: 'document.json', blob: new Blob([JSON.stringify(savedDocument)]) },
  ]
  for (const asset of Object.values(savedDocument.assets)) {
    const blob = assets.get(asset.id)
    if (!blob) throw new Error(`Missing original bytes for ${asset.originalName}`)
    files.push({ name: `assets/${asset.id}`, blob })
  }
  return zipBlobs(files, collageMimeType)
}

export async function openArchive(file: Blob): Promise<OpenedArchive> {
  if (file.size > maxArchiveFileBytes)
    throw new Error('Project archive exceeds the 273 MB safety limit')
  const entries = await unzipBlobBounded(file, {
    maxEntries,
    maxEntryBytes,
    maxExpandedBytes,
    validateName: assertSafeEntryName,
  })
  if (!entries.mimetype || !entries['document.json'])
    throw new Error('Project archive is missing required files')
  if ((await entries.mimetype.text()) !== collageMimeType)
    throw new Error('Not a Collage Builder project')
  if (entries['document.json'].size > maxDocumentBytes)
    throw new Error('Project document exceeds the 16 MB safety limit')
  let document: CollageDocumentV1
  try {
    document = migrateDocument(JSON.parse(await entries['document.json'].text()))
  } catch (error) {
    throw error instanceof Error ? error : new Error('Invalid project document')
  }
  if (Object.values(document.assets).some((asset) => asset.storage.kind !== 'embedded'))
    throw new Error('Embedded project contains linked asset metadata')
  if (
    Object.values(document.assets).reduce((total, asset) => total + asset.byteLength, 0) >
    maxProjectBytes
  )
    throw new Error('Project assets exceed the 256 MB safety limit')
  const assets = new Map<string, Blob>()
  const missingAssetIds: string[] = []
  for (const asset of Object.values(document.assets)) {
    if (asset.storage.kind !== 'embedded') continue
    const blob = entries[asset.storage.archivePath]
    if (!blob || blob.size !== asset.byteLength || (await sha256(blob)) !== asset.sha256) {
      missingAssetIds.push(asset.id)
      continue
    }
    assets.set(asset.id, blob.slice(0, blob.size, asset.mediaType))
  }
  return { document, assets, missingAssetIds }
}
