import { validateImportedImage } from '../domain/importImage'
import type { AssetRecordV1, CollageDocumentV1 } from '../domain/types'
import { maxProjectBytes } from '../persistence/limits'
import type { AssetRegistry } from '../render/assetRegistry'
import type { ProjectStore } from '../state/projectStore'
import type { ProjectPersistenceController } from './projectPersistence'

export type AssetFilter = 'all' | 'used' | 'unused' | 'missing'
export type AssetSort = 'import' | 'name' | 'size' | 'usage'

export function assetUsage(document: CollageDocumentV1, assetId: string): number {
  return document.pages
    .flatMap((page) => Object.values(page.slots))
    .filter((content) => content?.assetId === assetId).length
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = Math.max(0, bytes)
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

export function filterAssets(
  document: CollageDocumentV1,
  assets: AssetRecordV1[],
  query: string,
  filter: AssetFilter,
  sort: AssetSort,
  missingAssetIds: Set<string>,
): AssetRecordV1[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return assets
    .filter((asset) => {
      const usage = assetUsage(document, asset.id)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'missing' && missingAssetIds.has(asset.id)) ||
        (filter === 'used' && usage > 0) ||
        (filter === 'unused' && usage === 0)
      return matchesFilter && asset.originalName.toLocaleLowerCase().includes(normalizedQuery)
    })
    .sort((left, right) =>
      sort === 'name'
        ? left.originalName.localeCompare(right.originalName)
        : sort === 'size'
          ? right.byteLength - left.byteLength
          : sort === 'usage'
            ? assetUsage(document, right.id) - assetUsage(document, left.id)
            : 0,
    )
}

export async function importProjectAssets(
  files: FileList | null,
  document: CollageDocumentV1,
  registry: AssetRegistry,
  project: ProjectStore,
  onerror: (message: string) => void,
): Promise<number> {
  if (!files?.length) return 0
  const existingBytes = Object.values(document.assets).reduce(
    (total, asset) => total + asset.byteLength,
    0,
  )
  if (existingBytes + [...files].reduce((total, file) => total + file.size, 0) > maxProjectBytes)
    throw new Error('This import would exceed the 256 MB project asset limit.')

  let added = 0
  for (const file of files) {
    try {
      const { asset, file: normalizedFile, displayBlob } = await validateImportedImage(file)
      await registry.register(asset.id, normalizedFile, asset.sha256, asset, displayBlob)
      try {
        project.addAsset(asset)
      } catch (error) {
        registry.release(asset.id)
        throw error
      }
      added += 1
    } catch (error) {
      onerror(error instanceof Error ? error.message : 'Unable to import image')
    }
  }
  return added
}

export async function replaceProjectAsset(
  file: File,
  target: string,
  document: CollageDocumentV1,
  registry: AssetRegistry,
  project: ProjectStore,
): Promise<void> {
  const { asset, file: normalizedFile, displayBlob } = await validateImportedImage(file)
  registry.retain(target, document.assets[target].sha256)
  await registry.register(target, normalizedFile, asset.sha256, asset, displayBlob)
  project.replaceAsset(target, {
    ...asset,
    id: target,
    storage: {
      kind: 'embedded',
      archivePath:
        asset.storage.kind === 'embedded'
          ? asset.storage.archivePath.replace(asset.id, target)
          : asset.storage.displayHint,
    },
  })
}

export async function relinkProjectAsset(
  file: File,
  target: string,
  document: CollageDocumentV1,
  registry: AssetRegistry,
  project: ProjectStore,
  confirmMismatch: () => boolean,
): Promise<boolean> {
  const { asset, file: normalizedFile, displayBlob } = await validateImportedImage(file)
  const original = document.assets[target]
  if (original.sha256 !== asset.sha256 && !confirmMismatch()) return false
  await registry.register(target, normalizedFile, asset.sha256, asset, displayBlob)
  project.replaceAsset(target, {
    ...asset,
    id: target,
    storage: {
      kind: 'embedded',
      archivePath:
        asset.storage.kind === 'embedded'
          ? asset.storage.archivePath.replace(asset.id, target)
          : asset.storage.displayHint,
    },
  })
  return true
}

interface AssetWorkflowHost {
  project: ProjectStore
  persistence: ProjectPersistenceController
  document: () => CollageDocumentV1
  pageId: () => string
  selectedSlotId: () => string | null
  selectedContentAssetId: () => string | null
  libraryTargetSlotId: () => string | null
  selectedAssetId: () => string | null
  selectedAssetIds: () => string[]
  missingAssetIds: () => Set<string>
  registry: () => AssetRegistry
  setSelectedSlotId: (slotId: string | null) => void
  setLibraryTargetSlotId: (slotId: string | null) => void
  setSelectedAssetId: (assetId: string | null) => void
  setSelectedAssetIds: (assetIds: string[]) => void
  setMissingAssetIds: (assetIds: Set<string>) => void
  setPendingRemovalAssetIds: (assetIds: string[] | null) => void
  chooseReplacement: () => void
  chooseRelink: () => void
  announce: (message: string) => void
}

export class AssetWorkflowController {
  constructor(private readonly host: AssetWorkflowHost) {}

  usage = (assetId: string) => assetUsage(this.host.document(), assetId)

  select = (assetId: string, multi = false) => {
    this.host.setSelectedAssetId(assetId)
    const selected = this.host.selectedAssetIds()
    this.host.setSelectedAssetIds(
      multi
        ? selected.includes(assetId)
          ? selected.filter((id) => id !== assetId)
          : [...selected, assetId]
        : [assetId],
    )
    const targetSlotId = this.host.libraryTargetSlotId()
    if (!multi && targetSlotId) {
      this.host.project.assignAsset(this.host.pageId(), targetSlotId, assetId)
      this.host.setSelectedSlotId(targetSlotId)
      this.host.setLibraryTargetSlotId(null)
      this.host.announce('Image added to frame.')
    }
  }

  addToPage = (assetId: string) => {
    if (this.host.missingAssetIds().has(assetId)) {
      this.host.announce('Locate this image before adding it to a page.')
      return
    }
    const document = this.host.document()
    const page = document.pages.find((candidate) => candidate.id === this.host.pageId())!
    const selectedSlotId = this.host.selectedSlotId()
    const targetSlotId =
      (selectedSlotId && !page.slots[selectedSlotId] ? selectedSlotId : undefined) ??
      Object.entries(page.slots).find(([, content]) => !content)?.[0]
    if (!targetSlotId) {
      this.host.announce(
        'This page has no empty frames. Drag the image onto a frame to replace it.',
      )
      return
    }
    this.host.project.assignAsset(page.id, targetSlotId, assetId)
    this.host.setSelectedSlotId(targetSlotId)
    this.host.setSelectedAssetId(assetId)
    this.host.setSelectedAssetIds([assetId])
    this.host.announce('Image added to page.')
  }

  startDrag = (event: DragEvent, assetId: string) => {
    event.dataTransfer?.setData('application/x-collage-asset', assetId)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  }

  requestRemoval = (assetIds: string[]) => {
    const removable = [...new Set(assetIds)].filter(
      (assetId) => this.host.document().assets[assetId],
    )
    if (!removable.length) return
    if (removable.some((assetId) => this.usage(assetId) > 0)) {
      this.host.setPendingRemovalAssetIds(removable)
      return
    }
    this.remove(removable)
  }

  remove = (assetIds: string[]) => {
    const document = this.host.document()
    assetIds.forEach((assetId) =>
      this.host.registry().retain(assetId, document.assets[assetId].sha256),
    )
    this.host.project.removeAssets(assetIds)
    assetIds.forEach((assetId) => this.host.registry().release(assetId))
    this.host.setSelectedAssetId(null)
    this.host.setSelectedAssetIds([])
    this.host.setPendingRemovalAssetIds(null)
    this.host.announce(`${assetIds.length} image(s) removed from project.`)
  }

  chooseReplacementFor = (assetId: string) => {
    this.host.setSelectedAssetId(assetId)
    this.host.chooseReplacement()
  }

  chooseRelinkFor = (assetId: string) => {
    this.host.setSelectedAssetId(assetId)
    this.host.chooseRelink()
  }

  replaceSelectedImage = () => {
    const assetId = this.host.selectedContentAssetId()
    if (assetId) this.chooseReplacementFor(assetId)
  }

  replace = async (file: File | undefined) => {
    const target = this.host.selectedAssetId()
    if (!file || !target) return
    try {
      await replaceProjectAsset(
        file,
        target,
        this.host.document(),
        this.host.registry(),
        this.host.project,
      )
      this.host.persistence.invalidateLinkedMatch(target)
      this.host.announce('Original image replaced everywhere it is used.')
    } catch (error) {
      this.host.announce(error instanceof Error ? error.message : 'Unable to replace image')
    }
  }

  relink = async (file: File | undefined) => {
    const target = this.host.selectedAssetId()
    if (!file || !target || !this.host.missingAssetIds().has(target)) return
    try {
      const replaced = await relinkProjectAsset(
        file,
        target,
        this.host.document(),
        this.host.registry(),
        this.host.project,
        () =>
          globalThis.confirm(
            'This file differs from the missing original. Use it for this image anyway?',
          ),
      )
      if (!replaced) return
      this.host.persistence.invalidateLinkedMatch(target)
      this.host.setMissingAssetIds(
        new Set([...this.host.missingAssetIds()].filter((id) => id !== target)),
      )
      this.host.announce('Image relinked everywhere it is used.')
    } catch (error) {
      this.host.announce(error instanceof Error ? error.message : 'Unable to relink image')
    }
  }

  import = async (files: FileList | null) => {
    try {
      const added = await importProjectAssets(
        files,
        this.host.document(),
        this.host.registry(),
        this.host.project,
        this.host.announce,
      )
      if (added)
        this.host.announce(`${added} image${added === 1 ? '' : 's'} added to this project.`)
    } catch (error) {
      this.host.announce(error instanceof Error ? error.message : 'Unable to import image')
    }
  }
}
