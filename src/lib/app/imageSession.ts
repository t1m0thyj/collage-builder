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
  onImageReady: () => void = () => undefined,
): Promise<boolean> {
  const assetIds = pageAssetIds(page).filter((assetId) => registry.getBlob(assetId))
  const previewChanged = await registry.ensureThumbnailImages(assetIds)
  if (!isCurrent()) return false
  if (previewChanged) onPreviewReady()
  const changed = await registry.ensureImages(assetIds, isCurrent, onImageReady)
  // A newer page request may have completed while this page was decoding.
  // Only the current page request may evict older decoded images.
  if (!isCurrent()) return false
  registry.retainDecodedForPage(assetIds)
  return changed
}

async function stagedRegistry(
  document: CollageDocumentV1,
  blobs: Map<string, Blob>,
  onProgress: (completed: number, total: number, readyPages: PageV1[]) => void,
): Promise<AssetRegistry> {
  assertDocumentInvariants(document)
  const staged = new AssetRegistry()
  for (const assetId of blobs.keys())
    if (!document.assets[assetId])
      throw new Error(`Project contains bytes for an unknown asset: ${assetId}`)
  const pagePending = document.pages.map(
    (page) => new Set(pageAssetIds(page).filter((assetId) => blobs.has(assetId))),
  )
  const pagesByAsset = new Map<string, number[]>()
  pagePending.forEach((assetIds, index) => {
    for (const assetId of assetIds) {
      const pages = pagesByAsset.get(assetId) ?? []
      pages.push(index)
      pagesByAsset.set(assetId, pages)
    }
  })
  const orderedIds = new Set([...document.pages.flatMap(pageAssetIds), ...blobs.keys()])
  const entries = [...orderedIds]
    .filter((assetId) => blobs.has(assetId))
    .map((assetId) => [assetId, blobs.get(assetId)!] as const)
  let next = 0
  let completedPages = pagePending.filter((assetIds) => assetIds.size === 0).length
  let failed = false
  const reportProgress = () =>
    onProgress(
      completedPages,
      pagePending.length,
      document.pages.filter((_, index) => pagePending[index].size === 0),
    )
  reportProgress()
  const workers = Array.from({ length: Math.min(3, entries.length) }, async () => {
    while (!failed && next < entries.length) {
      const [assetId, blob] = entries[next++]
      const asset = document.assets[assetId]
      try {
        await staged.register(assetId, blob, asset.sha256, asset)
        const previousPages = completedPages
        for (const index of pagesByAsset.get(assetId) ?? []) {
          const pending = pagePending[index]
          pending.delete(assetId)
          if (pending.size === 0) completedPages += 1
        }
        if (completedPages !== previousPages) reportProgress()
      } catch (error) {
        failed = true
        throw error
      }
    }
  })
  try {
    await Promise.all(workers)
    return staged
  } catch (error) {
    await Promise.allSettled(workers)
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
  onProgress: (completed: number, total: number, readyPages: PageV1[]) => void = () => undefined,
): Promise<boolean> {
  const nextRegistry = await stagedRegistry(document, blobs, onProgress)
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
