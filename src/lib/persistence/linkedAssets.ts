import type { AssetRecordV1, CollageDocumentV1 } from '../domain/types'
import { migrateDocument } from '../domain/migrations'

export const linkedProjectMimeType = 'application/json'
export const maxLinkedProjectBytes = 32 * 1024 * 1024

type DirectoryFile = File & { webkitRelativePath?: string }

export interface LinkedAssetMatch {
  file: File
  relativePath: string
  sha256: string
}

export function relativePathFor(file: DirectoryFile): string {
  const path = file.webkitRelativePath?.replaceAll('\\', '/') || file.name
  const parts = path.split('/').filter(Boolean)
  return parts.length > 1 ? parts.slice(1).join('/') : parts[0]
}

function assertSafeRelativePath(path: string): void {
  const normalized = path.replaceAll('\\', '/')
  if (
    normalized !== path ||
    normalized.startsWith('/') ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error(`Linked image has an unsafe relative path: ${path}`)
}

async function digest(file: Blob): Promise<string> {
  const bytes = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Matches project originals by relative path first, then byte size and SHA-256. */
export async function matchLinkedAssets(
  assets: Record<string, AssetRecordV1>,
  files: Iterable<DirectoryFile>,
): Promise<Map<string, LinkedAssetMatch>> {
  const candidates = [...files].map((file) => ({ file, relativePath: relativePathFor(file) }))
  const matches = new Map<string, LinkedAssetMatch>()
  for (const asset of Object.values(assets)) {
    const wanted = asset.storage.kind === 'linked' ? asset.storage.relativePath : undefined
    const possible = candidates.filter(
      (candidate) =>
        candidate.file.size === asset.byteLength &&
        (!wanted || candidate.relativePath === wanted || candidate.file.name === wanted.split('/').at(-1)),
    )
    for (const candidate of possible) {
      const sha256 = await digest(candidate.file)
      if (sha256 === asset.sha256) {
        matches.set(asset.id, { ...candidate, sha256 })
        break
      }
    }
  }
  return matches
}

export function linkedDocument(
  document: CollageDocumentV1,
  matches: Map<string, LinkedAssetMatch>,
): CollageDocumentV1 {
  const copy = structuredClone(document)
  for (const asset of Object.values(copy.assets)) {
    const match = matches.get(asset.id)
    if (!match) throw new Error(`The selected folder does not contain ${asset.originalName}`)
    if (match.file.size !== asset.byteLength || match.sha256 !== asset.sha256)
      throw new Error(`The selected file for ${asset.originalName} no longer matches this project`)
    assertSafeRelativePath(match.relativePath)
    asset.storage = {
      kind: 'linked',
      displayHint: match.relativePath,
      relativePath: match.relativePath,
      lastModified: match.file.lastModified,
    }
  }
  return copy
}

export function createLinkedProject(
  document: CollageDocumentV1,
  matches: Map<string, LinkedAssetMatch>,
): Blob {
  const savedDocument = linkedDocument(document, matches)
  return new Blob([JSON.stringify(savedDocument, null, 2)], { type: linkedProjectMimeType })
}

export async function openLinkedProject(file: Blob): Promise<CollageDocumentV1> {
  if (file.size > maxLinkedProjectBytes)
    throw new Error('Linked project exceeds the 32 MB safety limit')
  let document: CollageDocumentV1
  try {
    document = migrateDocument(JSON.parse(await file.text()))
  } catch (error) {
    throw error instanceof Error ? error : new Error('Invalid linked project document')
  }
  for (const asset of Object.values(document.assets)) {
    if (asset.storage.kind !== 'linked' || !asset.storage.relativePath)
      throw new Error('Linked project contains embedded asset metadata')
    assertSafeRelativePath(asset.storage.relativePath)
  }
  return document
}
