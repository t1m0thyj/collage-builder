import type { AssetRecordV1, CollageDocumentV1 } from '../domain/types'
import { migrateDocument } from '../domain/migrations'
import { linkedProjectMimeType } from './formats'

export { linkedProjectMimeType } from './formats'
export const maxLinkedProjectBytes = 32 * 1024 * 1024

type DirectoryFile = File & { webkitRelativePath?: string }

export interface LinkedAssetMatch {
  file: File
  relativePath: string
  sha256: string
}

export interface LinkedAssetProgress {
  completed: number
  total: number
  checkedFiles: number
  matched: number
}

export interface LinkedAssetMatchOptions {
  onProgress?: (progress: LinkedAssetProgress) => void
  isCurrent?: () => boolean
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
  options: LinkedAssetMatchOptions = {},
): Promise<Map<string, LinkedAssetMatch>> {
  const candidates = [...files].map((file) => ({ file, relativePath: relativePathFor(file) }))
  const bySize = new Map<number, typeof candidates>()
  for (const candidate of candidates) {
    const group = bySize.get(candidate.file.size) ?? []
    group.push(candidate)
    bySize.set(candidate.file.size, group)
  }
  const matches = new Map<string, LinkedAssetMatch>()
  const digests = new Map<File, Promise<string>>()
  const progress: LinkedAssetProgress = {
    completed: 0,
    total: Object.keys(assets).length,
    checkedFiles: 0,
    matched: 0,
  }
  let lastProgressAt = 0
  const report = (force = false) => {
    const now = performance.now()
    if (!force && now - lastProgressAt < 100) return
    lastProgressAt = now
    options.onProgress?.({ ...progress })
  }
  const assertCurrent = () => {
    if (options.isCurrent && !options.isCurrent())
      throw new Error('Photo matching is no longer current')
  }
  report(true)
  for (const asset of Object.values(assets)) {
    assertCurrent()
    const wanted = asset.storage.kind === 'linked' ? asset.storage.relativePath : undefined
    const sameSize = bySize.get(asset.byteLength) ?? []
    const basename = wanted?.split('/').at(-1)
    const possible = wanted
      ? [
          ...sameSize.filter((candidate) => candidate.relativePath === wanted),
          ...sameSize.filter(
            (candidate) => candidate.relativePath !== wanted && candidate.file.name === basename,
          ),
          ...sameSize.filter(
            (candidate) => candidate.relativePath !== wanted && candidate.file.name !== basename,
          ),
        ]
      : sameSize
    for (const candidate of possible) {
      assertCurrent()
      let sha256 = digests.get(candidate.file)
      if (!sha256) {
        sha256 = digest(candidate.file)
        digests.set(candidate.file, sha256)
        await sha256
        assertCurrent()
        progress.checkedFiles += 1
        report()
      }
      const resolvedHash = await sha256
      if (resolvedHash === asset.sha256) {
        matches.set(asset.id, { ...candidate, sha256: resolvedHash })
        break
      }
    }
    progress.completed += 1
    progress.matched = matches.size
    report(progress.completed === progress.total)
  }
  return matches
}

export function linkedAssetRecord(asset: AssetRecordV1, match: LinkedAssetMatch): AssetRecordV1 {
  if (match.file.size !== asset.byteLength || match.sha256 !== asset.sha256)
    throw new Error(`The selected file for ${asset.originalName} no longer matches this project`)
  assertSafeRelativePath(match.relativePath)
  return {
    ...asset,
    originalName: match.file.name,
    storage: {
      kind: 'linked',
      displayHint: match.relativePath,
      relativePath: match.relativePath,
      lastModified: match.file.lastModified,
    },
  }
}

export function linkedDocument(
  document: CollageDocumentV1,
  matches: Map<string, LinkedAssetMatch>,
): CollageDocumentV1 {
  const copy = structuredClone(document)
  for (const asset of Object.values(copy.assets)) {
    const match = matches.get(asset.id)
    if (!match) throw new Error(`The selected folder does not contain ${asset.originalName}`)
    copy.assets[asset.id] = linkedAssetRecord(asset, match)
  }
  return copy
}

export function createLinkedProject(
  document: CollageDocumentV1,
  matches: Map<string, LinkedAssetMatch>,
): Blob {
  const savedDocument = migrateDocument(linkedDocument(document, matches))
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
