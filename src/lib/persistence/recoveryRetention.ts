import type { CollageDocumentV1 } from '../domain/types'
import { maxRecoveryBytes, maxRecoveryCount } from './limits'

export function recoveryPayloadBytes(document: CollageDocumentV1, previewBytes = 0): number {
  return (
    new TextEncoder().encode(JSON.stringify(document)).byteLength +
    previewBytes +
    Object.values(document.assets).reduce((sum, asset) => sum + asset.byteLength, 0)
  )
}

/** Keep the active save, then newest other drafts; evict oldest until both limits fit. */
export function retainRecoveries(
  documents: CollageDocumentV1[],
  currentProjectId: string,
  previewBytes: ReadonlyMap<string, number>,
) {
  const current = documents.find((document) => document.projectId === currentProjectId)
  if (!current) throw new Error('The project being saved must have a recovery copy')
  let bytes = recoveryPayloadBytes(current, previewBytes.get(currentProjectId))
  if (bytes > maxRecoveryBytes)
    throw new Error('This project exceeds the 2 GB local recovery limit')
  const retained = [current]
  const others = documents
    .filter((document) => document.projectId !== currentProjectId)
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.projectId.localeCompare(right.projectId),
    )
  for (const document of others) {
    const size = recoveryPayloadBytes(document, previewBytes.get(document.projectId))
    // Once the next-newest does not fit, all older drafts are evicted too.
    if (retained.length >= maxRecoveryCount || bytes + size > maxRecoveryBytes) break
    retained.push(document)
    bytes += size
  }
  return { retained, bytes }
}
