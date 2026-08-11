import type { AssetRecordV1, CollageDocumentV1 } from '../domain/types'

type DirectoryFile = File & { webkitRelativePath?: string }

export function relativePathFor(file: DirectoryFile): string {
  const path = file.webkitRelativePath?.replaceAll('\\', '/') || file.name
  const parts = path.split('/').filter(Boolean)
  return parts.length > 1 ? parts.slice(1).join('/') : parts[0]
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
): Promise<Map<string, { file: File; relativePath: string }>> {
  const candidates = [...files].map((file) => ({ file, relativePath: relativePathFor(file) }))
  const matches = new Map<string, { file: File; relativePath: string }>()
  for (const asset of Object.values(assets)) {
    const wanted = asset.storage.kind === 'linked' ? asset.storage.relativePath : undefined
    const possible = candidates.filter(
      (candidate) =>
        candidate.file.size === asset.byteLength &&
        (!wanted || candidate.relativePath === wanted || candidate.file.name === wanted.split('/').at(-1)),
    )
    for (const candidate of possible) {
      if ((await digest(candidate.file)) === asset.sha256) {
        matches.set(asset.id, candidate)
        break
      }
    }
  }
  return matches
}

export function linkedDocument(
  document: CollageDocumentV1,
  matches: Map<string, { file: File; relativePath: string }>,
): CollageDocumentV1 {
  const copy = structuredClone(document)
  for (const asset of Object.values(copy.assets)) {
    const match = matches.get(asset.id)
    if (!match) throw new Error(`The selected folder does not contain ${asset.originalName}`)
    asset.storage = {
      kind: 'linked',
      displayHint: match.relativePath,
      relativePath: match.relativePath,
      lastModified: match.file.lastModified,
    }
  }
  return copy
}
