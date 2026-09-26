import { assertDocumentInvariants } from '../domain/invariants'
import type { CollageDocumentV1, PageV1 } from '../domain/types'
import { AssetRegistry } from '../render/assetRegistry'
import type { ProjectStore } from '../state/projectStore'

export function pageAssetIds(page: PageV1): string[] {
  return Object.values(page.slots).flatMap((content) => (content ? [content.assetId] : []))
}

export async function preparePageImages(
  page: PageV1,
  registry: AssetRegistry,
  isCurrent: () => boolean = () => true,
  onPreviewReady: () => void = () => undefined,
): Promise<boolean> {
  const assetIds = pageAssetIds(page).filter((assetId) => registry.getBlob(assetId))
  const previewChanged = await registry.ensureThumbnailImages(assetIds)
  if (!isCurrent()) return false
  if (previewChanged) onPreviewReady()
  const changed = await registry.ensureImages(assetIds, isCurrent)
  // A newer page request may have completed while this page was decoding.
  // Only the current page request may evict older decoded images.
  if (!isCurrent()) return false
  registry.retainDecodedForPage(assetIds)
  return changed
}

async function stagedRegistry(
  document: CollageDocumentV1,
  blobs: Map<string, Blob>,
): Promise<AssetRegistry> {
  assertDocumentInvariants(document)
  const staged = new AssetRegistry()
  try {
    for (const [assetId, blob] of blobs) {
      const asset = document.assets[assetId]
      if (!asset) throw new Error(`Project contains bytes for an unknown asset: ${assetId}`)
      await staged.register(assetId, blob, asset.sha256, asset)
    }
    return staged
  } catch (error) {
    staged.clear()
    throw error
  }
}

export async function replaceProjectDocument(
  project: ProjectStore,
  currentRegistry: AssetRegistry,
  document: CollageDocumentV1,
  blobs: Map<string, Blob>,
  setRegistry: (registry: AssetRegistry) => void,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  const nextRegistry = await stagedRegistry(document, blobs)
  if (!isCurrent()) {
    nextRegistry.clear()
    return false
  }
  setRegistry(nextRegistry)
  try {
    project.replaceDocument(document)
  } catch (error) {
    setRegistry(currentRegistry)
    nextRegistry.clear()
    throw error
  }
  currentRegistry.clear()
  return true
}
