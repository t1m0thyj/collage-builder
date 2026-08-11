import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { migrateDocument } from '../domain/migrations'
import type { CollageDocumentV1 } from '../domain/types'

export const collageMimeType = 'application/vnd.collage-builder+zip'
export const maxProjectBytes = 1024 * 1024 * 1024

export interface ArchiveAssets {
  get(assetId: string): Blob | undefined
}
export interface OpenedArchive {
  document: CollageDocumentV1
  assets: Map<string, Blob>
  missingAssetIds: string[]
}
const maxEntries = 500

function assertSafeEntries(entries: Record<string, Uint8Array>): void {
  const paths = Object.keys(entries)
  if (paths.length > maxEntries) throw new Error('Project archive contains too many entries')
  if (paths.some((path) => path.startsWith('/') || path.includes('..') || path.includes('\\')))
    throw new Error('Project archive contains an unsafe path')
  if (!paths.includes('mimetype') || !paths.includes('document.json'))
    throw new Error('Project archive is missing required files')
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
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
    throw new Error('Project assets exceed the 1 GB safety limit')
  const savedDocument = structuredClone(document)
  for (const asset of Object.values(savedDocument.assets)) {
    asset.storage = { kind: 'embedded', archivePath: `assets/${asset.id}` }
  }
  const files: Zippable = {
    mimetype: [strToU8(collageMimeType), { level: 0 }],
    'document.json': strToU8(JSON.stringify(savedDocument)),
  }
  for (const asset of Object.values(savedDocument.assets)) {
    const blob = assets.get(asset.id)
    if (!blob) throw new Error(`Missing original bytes for ${asset.originalName}`)
    files[`assets/${asset.id}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
  }
  return new Blob([zipSync(files)], { type: collageMimeType })
}

export async function openArchive(file: Blob): Promise<OpenedArchive> {
  if (file.size > maxProjectBytes) throw new Error('Project archive exceeds the 1 GB safety limit')
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  assertSafeEntries(entries)
  if (!entries.mimetype || strFromU8(entries.mimetype) !== collageMimeType)
    throw new Error('Not a Collage Builder project')
  if (!entries['document.json']) throw new Error('Project is missing document.json')
  let document: CollageDocumentV1
  try {
    document = migrateDocument(JSON.parse(strFromU8(entries['document.json'])))
  } catch (error) {
    throw error instanceof Error ? error : new Error('Invalid project document')
  }
  if (Object.values(document.assets).some((asset) => asset.storage.kind !== 'embedded'))
    throw new Error('Embedded project contains linked asset metadata')
  const assets = new Map<string, Blob>()
  const missingAssetIds: string[] = []
  for (const asset of Object.values(document.assets)) {
    if (asset.storage.kind !== 'embedded') continue
    const bytes = entries[asset.storage.archivePath]
    if (!bytes || bytes.byteLength !== asset.byteLength || (await sha256(bytes)) !== asset.sha256) {
      missingAssetIds.push(asset.id)
      continue
    }
    assets.set(asset.id, new Blob([bytes], { type: asset.mediaType }))
  }
  return { document, assets, missingAssetIds }
}
