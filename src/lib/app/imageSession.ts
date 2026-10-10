import { assertDocumentInvariants } from '../domain/invariants'
import type { CollageDocumentV1, PageV1 } from '../domain/types'
import { AssetRegistry } from '../render/assetRegistry'
import type { ProjectStore } from '../state/projectStore'
import { loadPreviewCache, savePreviewCache } from '../persistence/previewCache'

export function pageAssetIds(page: PageV1): string[] {
  return Object.values(page.slots).flatMap((content) => (content ? [content.assetId] : []))
}

export async function preparePageImages(
  page: PageV1,
  registry: AssetRegistry,
  isCurrent: () => boolean = () => true,
  onPreviewReady: () => void = () => undefined,
  onImageReady: () => void = () => undefined,
  assets?: CollageDocumentV1['assets'],
): Promise<boolean> {
  const assetIds = pageAssetIds(page).filter((assetId) => registry.getBlob(assetId))
  if (assets) {
    await Promise.all(
      assetIds.map(async (assetId) => {
        if (registry.getThumbnailUrl(assetId) || !isCurrent()) return
        const asset = assets[assetId]
        const blob = registry.getBlob(assetId)
        if (!asset || !blob) return
        const cached =
          typeof indexedDB === 'undefined'
            ? undefined
            : await loadPreviewCache(asset).catch(() => undefined)
        const registered = cached
          ? await registry.registerPrepared(assetId, blob, asset.sha256, cached, isCurrent)
          : await registry.register(assetId, blob, asset.sha256, asset, undefined, isCurrent)
        if (!registered || cached) return
        const prepared = registry.getPreparedImages(assetId)
        if (prepared) void savePreviewCache(asset, prepared).catch(() => undefined)
      }),
    )
  }
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

interface StagedRegistryResult {
  registry: AssetRegistry
  background?: () => Promise<void>
}

async function stagedRegistry(
  document: CollageDocumentV1,
  blobs: Map<string, Blob>,
  onProgress: (completed: number, total: number, readyPages: PageV1[]) => void,
  firstPageOnly = false,
  priorityPageId?: string,
  isRegistryCurrent: (registry: AssetRegistry) => boolean = () => true,
  onBackgroundPrepared: () => void = () => undefined,
): Promise<StagedRegistryResult> {
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
  for (const [assetId, blob] of entries)
    staged.bindOriginal(assetId, blob, document.assets[assetId]?.sha256)
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
  const prepareEntry = async ([assetId, blob]: (typeof entries)[number], background = false) => {
    const asset = document.assets[assetId]
    try {
      // Keep non-browser callers and tests on the existing synchronous start
      // path; a browser can await IndexedDB before deciding whether to encode.
      const cached =
        typeof indexedDB === 'undefined'
          ? undefined
          : await loadPreviewCache(asset).catch(() => undefined)
      const registered = cached
        ? await staged.registerPrepared(
            assetId,
            blob,
            asset.sha256,
            cached,
            () => !background || isRegistryCurrent(staged),
          )
        : await staged.register(
            assetId,
            blob,
            asset.sha256,
            asset,
            undefined,
            () => !background || isRegistryCurrent(staged),
          )
      if (!registered) return
      // The derived cache is optional. The verified original remains the source of truth.
      if (!cached) {
        const prepared = staged.getPreparedImages(assetId)
        if (prepared) void savePreviewCache(asset, prepared).catch(() => undefined)
      }
      const previousPages = completedPages
      for (const index of pagesByAsset.get(assetId) ?? []) {
        const pending = pagePending[index]
        pending.delete(assetId)
        if (pending.size === 0) completedPages += 1
      }
      // The foreground operation ends once the priority page is editable.
      // Secondary preparation updates the canvas/library through the revision
      // callback instead of reviving the opening progress UI.
      if (!background && completedPages !== previousPages) reportProgress()
      if (background) onBackgroundPrepared()
    } catch (error) {
      if (!background) throw error
      // Background previews are optional. The original is still bound for save,
      // export, relinking, and a later retry when the page becomes active.
    }
  }
  try {
    if (firstPageOnly) {
      const priorityPage =
        document.pages.find((page) => page.id === priorityPageId) ?? document.pages[0]
      const initialAssetIds = new Set(priorityPage ? pageAssetIds(priorityPage) : [])
      const initial = entries.filter(([assetId]) => initialAssetIds.has(assetId))
      const remaining = entries.filter(([assetId]) => !initialAssetIds.has(assetId))
      let initialNext = 0
      await Promise.all(
        Array.from({ length: Math.min(3, initial.length) }, async () => {
          while (initialNext < initial.length) await prepareEntry(initial[initialNext++])
        }),
      )
      return {
        registry: staged,
        background: () => runBackground(remaining, staged, prepareEntry, isRegistryCurrent),
      }
    }
    const workers = Array.from({ length: Math.min(3, entries.length) }, async () => {
      while (!failed && next < entries.length) {
        const entry = entries[next++]
        try {
          await prepareEntry(entry)
        } catch (error) {
          failed = true
          throw error
        }
      }
    })
    await Promise.all(workers)
    return { registry: staged }
  } catch (error) {
    staged.clear()
    throw error
  }
}

async function runBackground(
  entries: ReadonlyArray<readonly [string, Blob]>,
  registry: AssetRegistry,
  prepare: (entry: readonly [string, Blob], background: boolean) => Promise<void>,
  isRegistryCurrent: (registry: AssetRegistry) => boolean,
): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(3, entries.length) }, async () => {
      while (isRegistryCurrent(registry) && next < entries.length)
        await prepare(entries[next++] as readonly [string, Blob], true)
    }),
  )
}

export async function replaceProjectDocument(
  project: ProjectStore,
  currentRegistry: AssetRegistry,
  document: CollageDocumentV1,
  blobs: Map<string, Blob>,
  setRegistry: (registry: AssetRegistry) => void,
  isCurrent: () => boolean = () => true,
  onProgress: (completed: number, total: number, readyPages: PageV1[]) => void = () => undefined,
  firstPageOnly = false,
  priorityPageId?: string,
  isRegistryCurrent: (registry: AssetRegistry) => boolean = () => true,
  onBackgroundPrepared: () => void = () => undefined,
): Promise<boolean> {
  const staged = await stagedRegistry(
    document,
    blobs,
    onProgress,
    firstPageOnly,
    priorityPageId,
    isRegistryCurrent,
    onBackgroundPrepared,
  )
  const nextRegistry = staged.registry
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
  void staged.background?.()
  return true
}
