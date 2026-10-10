import { migrateDocument } from '../domain/migrations'
import type { CollageDocumentV1 } from '../domain/types'
import {
  unzipBlobBounded,
  writeZip,
  zipBlobs,
  type WriteZipOptions,
  type ZipBlobEntry,
  type ZipSink,
} from './zipStreams'
import { maxArchiveEntryCount, maxProjectAssetCount, maxProjectBytes } from './limits'
import { collageMimeType } from './formats'

export { collageMimeType } from './formats'
export { maxProjectBytes } from './limits'

export interface ArchiveAssets {
  get(assetId: string): Blob | undefined
  hasActive?(assetId: string, sha256: string): boolean
}
export interface PreparedArchive {
  entries: ZipBlobEntry[]
  payloadBytes: number
}
export interface OpenedArchive {
  document: CollageDocumentV1
  assets: Map<string, Blob>
  missingAssetIds: string[]
}
export interface OpenArchiveOptions {
  onProgress?: (
    phase: 'Reading project' | 'Checking photos',
    completed: number,
    total: number,
  ) => void
}
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

/** Validates and snapshots the entries shared by Blob and native stream saves. */
export function prepareArchive(
  document: CollageDocumentV1,
  assets: ArchiveAssets,
): PreparedArchive {
  if (Object.keys(document.assets).length > maxProjectAssetCount)
    throw new Error(`Project contains more than ${maxProjectAssetCount} photos`)
  if (
    Object.values(document.assets).reduce((total, asset) => total + asset.byteLength, 0) >
    maxProjectBytes
  )
    throw new Error('Project assets exceed the 1 GB safety limit')
  const savedDocument = structuredClone(document)
  for (const asset of Object.values(savedDocument.assets)) {
    asset.storage = { kind: 'embedded', archivePath: `assets/${asset.id}` }
  }
  const validDocument = migrateDocument(savedDocument)
  const documentJson = JSON.stringify(validDocument)
  if (new TextEncoder().encode(documentJson).byteLength > maxDocumentBytes)
    throw new Error('Project document exceeds the 16 MB safety limit')
  const files: ZipBlobEntry[] = [
    { name: 'mimetype', blob: new Blob([collageMimeType]), trackProgress: false },
    { name: 'document.json', blob: new Blob([documentJson]), trackProgress: false },
  ]
  let payloadBytes = 0
  for (const asset of Object.values(savedDocument.assets)) {
    const blob = assets.get(asset.id)
    if (!blob) throw new Error(`Missing original bytes for ${asset.originalName}`)
    if (blob.size !== asset.byteLength)
      throw new Error(`Original bytes changed for ${asset.originalName}`)
    if (assets.hasActive && !assets.hasActive(asset.id, asset.sha256))
      throw new Error(`Original bytes changed for ${asset.originalName}`)
    files.push({ name: `assets/${asset.id}`, blob })
    payloadBytes += blob.size
  }
  return { entries: files, payloadBytes }
}

export async function writeArchive(
  archive: PreparedArchive,
  sink: ZipSink,
  options: WriteZipOptions = {},
): Promise<void> {
  await writeZip(archive.entries, sink, options)
}

export async function archiveBlob(
  archive: PreparedArchive,
  options: WriteZipOptions = {},
): Promise<Blob> {
  return zipBlobs(archive.entries, collageMimeType, options)
}

export async function createArchive(
  document: CollageDocumentV1,
  assets: ArchiveAssets,
  options: { onProgress?: (completed: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<Blob> {
  const archive = prepareArchive(document, assets)
  return archiveBlob(archive, {
    onProgress: ({ completed, total }) => options.onProgress?.(completed, total ?? 0),
    signal: options.signal,
  })
}

export async function openArchive(
  file: Blob,
  options: OpenArchiveOptions = {},
): Promise<OpenedArchive> {
  if (file.size > maxArchiveFileBytes)
    throw new Error('Project archive exceeds the 1 GB safety limit')
  const entries = await unzipBlobBounded(file, {
    maxEntries: maxArchiveEntryCount,
    maxEntryBytes,
    maxExpandedBytes,
    validateName: assertSafeEntryName,
    onInputProgress: (completed, total) =>
      options.onProgress?.('Reading project', completed, total),
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
    throw new Error('Project assets exceed the 1 GB safety limit')
  const assets = new Map<string, Blob>()
  const missingAssetIds: string[] = []
  const embeddedAssets = Object.values(document.assets).filter(
    (asset) => asset.storage.kind === 'embedded',
  )
  const totalAssetBytes = embeddedAssets.reduce((total, asset) => total + asset.byteLength, 0)
  let checkedBytes = 0
  options.onProgress?.('Checking photos', checkedBytes, totalAssetBytes)
  for (const asset of Object.values(document.assets)) {
    if (asset.storage.kind !== 'embedded') continue
    const blob = entries[asset.storage.archivePath]
    if (!blob || blob.size !== asset.byteLength || (await sha256(blob)) !== asset.sha256) {
      missingAssetIds.push(asset.id)
    } else assets.set(asset.id, blob.slice(0, blob.size, asset.mediaType))
    checkedBytes += asset.byteLength
    options.onProgress?.('Checking photos', checkedBytes, totalAssetBytes)
  }
  return { document, assets, missingAssetIds }
}
