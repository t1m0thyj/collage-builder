import { validateImportedImage } from '../domain/importImage'
import type { AssetRecordV1, CollageDocumentV1 } from '../domain/types'
import { maxProjectAssetCount, maxProjectBytes } from '../persistence/limits'
import type { AssetRegistry } from '../render/assetRegistry'
import type { ProjectStore } from '../state/projectStore'
import type { ProjectPersistenceController } from './projectPersistence'

export type AssetFilter = 'all' | 'used' | 'unused' | 'missing'
export type AssetSort = 'import' | 'name' | 'size' | 'usage'

export interface ImportIssue {
  fileName: string
  message: string
}

export interface ImportBatchStatus {
  phase: 'running' | 'complete'
  total: number
  processed: number
  added: number
  skipped: number
  issues: ImportIssue[]
  importedAssetIds: string[]
}

export interface RelinkBatchResult {
  relinkedAssetIds: string[]
  unmatchedAssetIds: string[]
  issues: ImportIssue[]
}

type ValidatedImage = Awaited<ReturnType<typeof validateImportedImage>>

export type AssetUsageCounts = ReadonlyMap<string, number>

export function assetUsageCounts(document: CollageDocumentV1): Map<string, number> {
  const counts = new Map<string, number>()
  for (const page of document.pages)
    for (const content of Object.values(page.slots))
      if (content) counts.set(content.assetId, (counts.get(content.assetId) ?? 0) + 1)
  return counts
}

export function assetUsage(
  document: CollageDocumentV1,
  assetId: string,
  counts: AssetUsageCounts = assetUsageCounts(document),
): number {
  return counts.get(assetId) ?? 0
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
  usageCounts: AssetUsageCounts = assetUsageCounts(document),
): AssetRecordV1[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return assets
    .filter((asset) => {
      const usage = usageCounts.get(asset.id) ?? 0
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
            ? (usageCounts.get(right.id) ?? 0) - (usageCounts.get(left.id) ?? 0)
            : 0,
    )
}

export async function importProjectAssets(
  files: FileList | readonly File[] | null,
  document: CollageDocumentV1,
  registry: AssetRegistry,
  project: ProjectStore,
  isCurrent: () => boolean = () => true,
  onProgress: (status: ImportBatchStatus) => void = () => undefined,
): Promise<ImportBatchStatus> {
  const selectedFiles = files ? [...files] : []
  const status: ImportBatchStatus = {
    phase: 'running',
    total: selectedFiles.length,
    processed: 0,
    added: 0,
    skipped: 0,
    issues: [],
    importedAssetIds: [],
  }
  const snapshot = (phase: ImportBatchStatus['phase'] = status.phase): ImportBatchStatus => ({
    ...status,
    phase,
    issues: [...status.issues],
    importedAssetIds: [...status.importedAssetIds],
  })
  if (!selectedFiles.length) return snapshot('complete')
  const existingBytes = Object.values(document.assets).reduce(
    (total, asset) => total + asset.byteLength,
    0,
  )
  if (
    existingBytes + selectedFiles.reduce((total, file) => total + file.size, 0) >
    maxProjectBytes
  ) {
    status.processed = status.total
    status.skipped = status.total
    status.issues.push({
      fileName: 'Selected files',
      message: 'This import would exceed the 1 GB project asset limit.',
    })
    const result = snapshot('complete')
    onProgress(result)
    return result
  }

  onProgress(snapshot())
  const staged: ValidatedImage[] = []
  const knownHashes = new Set(Object.values(document.assets).map((asset) => asset.sha256))
  for (const file of selectedFiles) {
    if (!isCurrent()) break
    let validated: ValidatedImage | undefined
    try {
      validated = await validateImportedImage(file, knownHashes)
      const completed = validated
      const { asset, file: normalizedFile, displayBlob, decodedSource } = completed
      if (!isCurrent()) break
      if (knownHashes.has(asset.sha256))
        throw new Error('This exact image is already in the project')
      if (Object.keys(document.assets).length + staged.length >= maxProjectAssetCount)
        throw new Error(`Projects can contain no more than ${maxProjectAssetCount} photos`)
      const registered = await registry.register(
        asset.id,
        normalizedFile,
        asset.sha256,
        asset,
        displayBlob,
        decodedSource,
        isCurrent,
      )
      if (!registered || !isCurrent()) {
        validated = undefined
        break
      }
      staged.push(completed)
      validated = undefined
      knownHashes.add(asset.sha256)
      status.added += 1
      status.importedAssetIds.push(asset.id)
    } catch (error) {
      validated?.decodedSource.close()
      status.skipped += 1
      const message = error instanceof Error ? error.message : 'Unable to import image'
      const filePrefix = `${file.name}: `
      status.issues.push({
        fileName: file.name,
        message: message.startsWith(filePrefix) ? message.slice(filePrefix.length) : message,
      })
    } finally {
      status.processed += 1
      if (isCurrent()) onProgress(snapshot())
    }
  }
  if (!isCurrent()) {
    staged.forEach(({ asset }) => registry.release(asset.id))
    status.added = 0
    status.importedAssetIds = []
    return snapshot('complete')
  }
  try {
    project.addAssets(staged.map(({ asset }) => asset))
  } catch (error) {
    staged.forEach(({ asset }) => registry.release(asset.id))
    throw error
  }
  return snapshot('complete')
}

function embeddedReplacement(asset: AssetRecordV1, target: string): AssetRecordV1 {
  return {
    ...asset,
    id: target,
    storage: {
      kind: 'embedded',
      archivePath:
        asset.storage.kind === 'embedded'
          ? asset.storage.archivePath.replace(asset.id, target)
          : asset.storage.displayHint,
    },
  }
}

export async function replaceProjectAsset(
  file: File,
  target: string,
  document: CollageDocumentV1,
  registry: AssetRegistry,
  project: ProjectStore,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  const {
    asset,
    file: normalizedFile,
    displayBlob,
    decodedSource,
  } = await validateImportedImage(file)
  if (!isCurrent()) {
    decodedSource.close()
    return false
  }
  registry.retain(target, document.assets[target].sha256)
  const registered = await registry.register(
    target,
    normalizedFile,
    asset.sha256,
    asset,
    displayBlob,
    decodedSource,
    isCurrent,
  )
  if (!registered || !isCurrent()) return false
  project.replaceAsset(target, embeddedReplacement(asset, target))
  return true
}

export async function relinkProjectAsset(
  file: File,
  target: string,
  document: CollageDocumentV1,
  registry: AssetRegistry,
  project: ProjectStore,
  confirmMismatch: () => boolean | Promise<boolean>,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  const {
    asset,
    file: normalizedFile,
    displayBlob,
    decodedSource,
  } = await validateImportedImage(file)
  if (!isCurrent()) {
    decodedSource.close()
    return false
  }
  const original = document.assets[target]
  if (original.sha256 !== asset.sha256 && !(await confirmMismatch())) {
    decodedSource.close()
    return false
  }
  if (!isCurrent()) {
    decodedSource.close()
    return false
  }
  const registered = await registry.register(
    target,
    normalizedFile,
    asset.sha256,
    asset,
    displayBlob,
    decodedSource,
    isCurrent,
  )
  if (!registered || !isCurrent()) return false
  project.replaceAsset(target, embeddedReplacement(asset, target))
  return true
}

function candidateScore(original: AssetRecordV1, candidate: ValidatedImage): number {
  let score = 0
  if (candidate.file.name.toLocaleLowerCase() === original.originalName.toLocaleLowerCase())
    score += 4
  if (candidate.asset.width === original.width && candidate.asset.height === original.height)
    score += 2
  if (candidate.asset.byteLength === original.byteLength) score += 1
  return score
}

export async function relinkMissingProjectAssets(
  files: FileList | null,
  missingAssetIds: Iterable<string>,
  document: CollageDocumentV1,
  registry: AssetRegistry,
  project: ProjectStore,
  confirmSuggestion: (original: AssetRecordV1, candidate: File) => boolean | Promise<boolean>,
  isCurrent: () => boolean = () => true,
): Promise<RelinkBatchResult> {
  const targetIds = [...new Set(missingAssetIds)].filter((id) => document.assets[id])
  const candidates: ValidatedImage[] = []
  const issues: ImportIssue[] = []
  for (const file of files ? [...files] : []) {
    if (!isCurrent()) break
    try {
      candidates.push(await validateImportedImage(file))
    } catch (error) {
      issues.push({
        fileName: file.name,
        message: error instanceof Error ? error.message : 'Unable to read image',
      })
    }
  }
  if (!isCurrent()) {
    candidates.forEach((candidate) => candidate.decodedSource.close())
    return { relinkedAssetIds: [], unmatchedAssetIds: targetIds, issues }
  }

  const matches = new Map<string, ValidatedImage>()
  const usedCandidates = new Set<ValidatedImage>()
  for (const targetId of targetIds) {
    const original = document.assets[targetId]
    const exact = candidates.find(
      (candidate) => !usedCandidates.has(candidate) && candidate.asset.sha256 === original.sha256,
    )
    if (exact) {
      matches.set(targetId, exact)
      usedCandidates.add(exact)
    }
  }
  for (const targetId of targetIds) {
    if (matches.has(targetId)) continue
    const original = document.assets[targetId]
    const suggestion = candidates
      .filter((candidate) => !usedCandidates.has(candidate))
      .map((candidate) => ({ candidate, score: candidateScore(original, candidate) }))
      .filter(({ score }) => score >= 3)
      .sort((left, right) => right.score - left.score)[0]?.candidate
    if (suggestion) {
      const accepted = await confirmSuggestion(original, suggestion.file)
      if (!isCurrent()) {
        candidates.forEach((candidate) => candidate.decodedSource.close())
        return { relinkedAssetIds: [], unmatchedAssetIds: targetIds, issues }
      }
      if (accepted) {
        matches.set(targetId, suggestion)
        usedCandidates.add(suggestion)
      }
    }
  }

  const registeredIds: string[] = []
  try {
    for (const [targetId, candidate] of matches) {
      const registered = await registry.register(
        targetId,
        candidate.file,
        candidate.asset.sha256,
        candidate.asset,
        candidate.displayBlob,
        candidate.decodedSource,
        isCurrent,
      )
      if (!registered || !isCurrent()) {
        registeredIds.forEach((id) => registry.release(id))
        candidates.forEach((candidate) => candidate.decodedSource.close())
        return { relinkedAssetIds: [], unmatchedAssetIds: targetIds, issues }
      }
      registeredIds.push(targetId)
    }
    project.replaceAssets(
      [...matches].map(([assetId, candidate]) => ({
        assetId,
        replacement: embeddedReplacement(candidate.asset, assetId),
      })),
    )
  } catch (error) {
    registeredIds.forEach((id) => registry.release(id))
    throw error
  }
  const matchedCandidates = new Set(matches.values())
  candidates
    .filter((candidate) => !matchedCandidates.has(candidate))
    .forEach((candidate) => candidate.decodedSource.close())
  return {
    relinkedAssetIds: [...matches.keys()],
    unmatchedAssetIds: targetIds.filter((id) => !matches.has(id)),
    issues,
  }
}

interface AssetWorkflowHost {
  project: ProjectStore
  persistence: ProjectPersistenceController
  document: () => CollageDocumentV1
  pageId: () => string
  selectedSlotId: () => string | null
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
  showImageLibrary: () => void
  revealImportedAssets: (assetIds: string[]) => void
  setImportStatus: (status: ImportBatchStatus | null) => void
  setOperationProgress: (message: string | null) => void
  confirmRelink: (message: string) => Promise<boolean>
  announce: (message: string) => void
}

export class AssetWorkflowController {
  private importChain: Promise<void> = Promise.resolve()
  private assetMutationSequence = 0

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
    this.host.announce(
      `${assetIds.length} photo${assetIds.length === 1 ? '' : 's'} removed from the project.`,
    )
  }

  chooseReplacementFor = (assetId: string) => {
    this.host.setSelectedAssetId(assetId)
    this.host.chooseReplacement()
  }

  chooseRelinkFor = (assetId: string) => {
    this.host.setSelectedAssetId(assetId)
    this.host.chooseRelink()
  }

  replace = async (file: File | undefined) => {
    const target = this.host.selectedAssetId()
    if (!file || !target) return
    const operation = ++this.assetMutationSequence
    const version = this.host.project.versionedSnapshot()
    const isCurrent = () =>
      operation === this.assetMutationSequence && this.host.project.isCurrentProject(version)
    try {
      this.host.setOperationProgress('Replacing image…')
      const replaced = await replaceProjectAsset(
        file,
        target,
        version.document,
        this.host.registry(),
        this.host.project,
        isCurrent,
      )
      if (!replaced || !isCurrent()) return
      this.host.persistence.invalidateLinkedMatch(target)
      this.host.announce('Original image replaced everywhere it is used.')
    } catch (error) {
      this.host.announce(error instanceof Error ? error.message : 'Unable to replace image')
    } finally {
      if (operation === this.assetMutationSequence) this.host.setOperationProgress(null)
    }
  }

  relink = async (file: File | undefined) => {
    const target = this.host.selectedAssetId()
    if (!file || !target || !this.host.missingAssetIds().has(target)) return
    const operation = ++this.assetMutationSequence
    const version = this.host.project.versionedSnapshot()
    const isCurrent = () =>
      operation === this.assetMutationSequence && this.host.project.isCurrentProject(version)
    try {
      this.host.setOperationProgress('Relinking image…')
      const replaced = await relinkProjectAsset(
        file,
        target,
        version.document,
        this.host.registry(),
        this.host.project,
        () =>
          this.host.confirmRelink(
            'This file differs from the missing original. Use it for this image anyway?',
          ),
        isCurrent,
      )
      if (!replaced || !isCurrent()) return
      this.host.persistence.invalidateLinkedMatch(target)
      this.host.setMissingAssetIds(
        new Set([...this.host.missingAssetIds()].filter((id) => id !== target)),
      )
      this.host.announce('Image relinked everywhere it is used.')
    } catch (error) {
      this.host.announce(error instanceof Error ? error.message : 'Unable to relink image')
    } finally {
      if (operation === this.assetMutationSequence) this.host.setOperationProgress(null)
    }
  }

  relinkMany = async (files: FileList | null) => {
    if (!files?.length || !this.host.missingAssetIds().size) return
    const operation = ++this.assetMutationSequence
    const version = this.host.project.versionedSnapshot()
    const registry = this.host.registry()
    const isCurrent = () =>
      operation === this.assetMutationSequence &&
      registry === this.host.registry() &&
      this.host.project.isCurrentProject(version)
    try {
      this.host.setOperationProgress('Matching missing photos…')
      const result = await relinkMissingProjectAssets(
        files,
        this.host.missingAssetIds(),
        version.document,
        registry,
        this.host.project,
        (original, candidate) =>
          this.host.confirmRelink(
            `${candidate.name} appears to match ${original.originalName} by name, dimensions, or size, but its contents differ. Use it anyway?`,
          ),
        isCurrent,
      )
      if (!isCurrent()) return
      result.relinkedAssetIds.forEach((assetId) =>
        this.host.persistence.invalidateLinkedMatch(assetId),
      )
      this.host.setMissingAssetIds(new Set(result.unmatchedAssetIds))
      const invalid = result.issues.length
        ? ` ${result.issues.length} selected file${result.issues.length === 1 ? '' : 's'} could not be read.`
        : ''
      this.host.announce(
        `${result.relinkedAssetIds.length} missing photo${result.relinkedAssetIds.length === 1 ? '' : 's'} relinked; ${result.unmatchedAssetIds.length} still missing.${invalid}`,
      )
    } catch (error) {
      if (isCurrent())
        this.host.announce(error instanceof Error ? error.message : 'Unable to relink photos')
    } finally {
      if (operation === this.assetMutationSequence) this.host.setOperationProgress(null)
    }
  }

  import = (files: FileList | null, target?: { pageId: string; slotId: string }): Promise<void> => {
    const selectedFiles = files ? [...files] : []
    if (!selectedFiles.length) return Promise.resolve()
    this.host.showImageLibrary()
    const version = this.host.project.versionedSnapshot()
    const registry = this.host.registry()
    const isCurrent = () =>
      registry === this.host.registry() && this.host.project.isCurrentProject(version)
    const run = async () => {
      if (!isCurrent()) return
      try {
        const result = await importProjectAssets(
          selectedFiles,
          this.host.document(),
          registry,
          this.host.project,
          isCurrent,
          (status) => {
            this.host.setImportStatus(status)
            this.host.setOperationProgress(
              `Importing ${Math.min(status.processed + 1, status.total)}/${status.total}…`,
            )
            if (status.importedAssetIds.length)
              this.host.setSelectedAssetIds(status.importedAssetIds)
          },
        )
        if (isCurrent()) {
          let assignedToFrame = false
          if (target && result.importedAssetIds.length === 1) {
            const page = this.host.document().pages.find((page) => page.id === target.pageId)
            if (page && target.slotId in page.slots) {
              this.host.project.assignAsset(page.id, target.slotId, result.importedAssetIds[0])
              this.host.setSelectedSlotId(target.slotId)
              this.host.setLibraryTargetSlotId(null)
              assignedToFrame = true
            }
          }
          if (result.importedAssetIds.length)
            this.host.revealImportedAssets(result.importedAssetIds)
          this.host.setImportStatus(result.issues.length ? result : null)
          if (result.importedAssetIds.length) this.host.setSelectedAssetIds(result.importedAssetIds)
          if (!result.issues.length && result.added)
            this.host.announce(
              assignedToFrame
                ? 'Photo added to frame.'
                : `${result.added} photo${result.added === 1 ? '' : 's'} added.`,
            )
        }
      } catch (error) {
        if (isCurrent())
          this.host.setImportStatus({
            phase: 'complete',
            total: selectedFiles.length,
            processed: selectedFiles.length,
            added: 0,
            skipped: selectedFiles.length,
            issues: [
              {
                fileName: 'Selected files',
                message: error instanceof Error ? error.message : 'Unable to import images',
              },
            ],
            importedAssetIds: [],
          })
      } finally {
        this.host.setOperationProgress(null)
      }
    }
    const importing = this.importChain.then(run)
    this.importChain = importing.catch(() => undefined)
    return importing
  }
}
