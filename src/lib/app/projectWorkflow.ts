import { createProject } from '../domain/factories'
import type { CollageDocumentV1, PageV1 } from '../domain/types'
import type { AssetRegistry } from '../render/assetRegistry'
import type { LinkedFolderFile } from '../persistence/linkedAssets'
import type { ProjectStore } from '../state/projectStore'
import { matchProjectAssets, openProjectFile, type ProjectSaveFormat } from './projectIO'
import type { ProjectPersistenceController } from './projectPersistence'
import {
  formatLinkedAssetProgress,
  formatOperationBytes,
  type ProjectOperation,
} from './projectOperation'

type PendingNavigation = 'new' | 'open' | null

interface ProjectWorkflowHost {
  project: ProjectStore
  persistence: ProjectPersistenceController
  document: () => CollageDocumentV1
  projectTitle: () => string
  registry: () => AssetRegistry
  activePage: () => PageV1
  preferredPageId?: (document: CollageDocumentV1) => string
  isDirty: () => boolean
  recoveredOnly: () => boolean
  pendingNavigation: () => PendingNavigation
  pendingLinkedDocument: () => CollageDocumentV1 | null
  missingAssetIds: () => Set<string>
  chooseProject: () => void
  chooseLinkedFolder: () => Promise<Iterable<File | LinkedFolderFile> | null>
  chooseFallbackFormat: () => Promise<ProjectSaveFormat | null>
  installDocument: (
    document: CollageDocumentV1,
    assets: Map<string, Blob>,
    isCurrent?: () => boolean,
    onProgress?: (completed: number, total: number, readyPages: PageV1[]) => void,
  ) => Promise<boolean>
  preparePageImages: (page: PageV1, registry: AssetRegistry) => Promise<void>
  setPendingNavigation: (pending: PendingNavigation) => void
  setPendingLinkedDocument: (document: CollageDocumentV1 | null) => void
  setMissingAssetIds: (assetIds: Set<string>) => void
  setRecoveredOnly: (recovered: boolean) => void
  setActivePageId: (pageId: string) => void
  setSelectedSlotId: (slotId: string | null) => void
  setSelectedAssetId: (assetId: string | null) => void
  setCropModeSlotId: (slotId: string | null) => void
  setProjectTitle: (title: string) => void
  setHasSavedProject: (saved: boolean) => void
  incrementImageRevision: () => void
  setOperationProgress: (message: string | null) => void
  setProjectOperation?: (operation: ProjectOperation | null) => void
  setOpeningPages: (pages: PageV1[] | null, total: number) => void
  announce: (message: string) => void
}

export class ProjectWorkflowController {
  private saveSequence = 0
  private openSequence = 0
  private linkedFolderSequence = 0
  private opening = false

  constructor(private readonly host: ProjectWorkflowHost) {}

  newProject = () => {
    this.openSequence += 1
    this.linkedFolderSequence += 1
    if (this.opening) {
      this.opening = false
      this.host.setOpeningPages(null, 0)
      this.host.setOperationProgress(null)
    }
    const next = createProject('Untitled collage')
    this.host.registry().clear()
    this.host.setMissingAssetIds(new Set())
    this.host.setPendingLinkedDocument(null)
    this.host.persistence.reset()
    this.host.setHasSavedProject(false)
    this.host.setRecoveredOnly(false)
    this.host.project.replaceDocument(next)
    this.host.setProjectTitle(next.title)
    this.host.setActivePageId(next.pages[0].id)
    this.host.setSelectedSlotId(null)
    this.host.setSelectedAssetId(null)
    this.host.setCropModeSlotId(null)
    this.host.announce('New blank project created.')
  }

  requestNew = () => {
    if (this.host.isDirty() || this.host.recoveredOnly()) this.host.setPendingNavigation('new')
    else this.newProject()
  }

  requestOpen = () => {
    if (this.host.isDirty() || this.host.recoveredOnly()) this.host.setPendingNavigation('open')
    else this.host.chooseProject()
  }

  continueNavigation = () => {
    const action = this.host.pendingNavigation()
    this.host.setPendingNavigation(null)
    if (action === 'new') this.newProject()
    else if (action === 'open') this.host.chooseProject()
  }

  save = async (saveAs = false): Promise<boolean> => {
    const operation = ++this.saveSequence
    const snapshot = this.host.project.versionedSnapshot()
    const isCurrent = () =>
      operation === this.saveSequence && this.host.project.isCurrentVersion(snapshot)
    try {
      const saved = await this.host.persistence.save({
        document: snapshot.document,
        registry: this.host.registry(),
        projectTitle: this.host.projectTitle(),
        saveAs,
        chooseFallback: this.host.chooseFallbackFormat,
        isCurrent,
        onStarted: () => {
          if (!isCurrent()) return
          this.host.setOperationProgress('Saving project…')
          this.host.setProjectOperation?.({
            id: operation,
            kind: 'save',
            phase: 'Packaging photos',
          })
        },
        onProgress: (phase, completed, total, detail) => {
          if (!isCurrent()) return
          this.host.setOperationProgress(`${phase}…`)
          this.host.setProjectOperation?.({
            id: operation,
            kind: 'save',
            phase,
            completed,
            total,
            indeterminate: phase === 'Finalizing',
            detail:
              detail ??
              (completed !== undefined && total !== undefined
                ? `${formatOperationBytes(completed)} of ${formatOperationBytes(total)}`
                : undefined),
          })
        },
      })
      if (!saved || !isCurrent()) return false
      this.host.setHasSavedProject(true)
      if (!this.host.project.markClean(snapshot)) return false
      this.host.setRecoveredOnly(false)
      this.host.announce(
        saved.destination === 'download'
          ? saved.format === 'embedded'
            ? 'Project download started.'
            : 'Linked project download started.'
          : saved.format === 'embedded'
            ? 'Embedded project saved.'
            : 'Linked project saved. Choose the photo folder when opening it.',
      )
      return true
    } catch (error) {
      this.host.announce(error instanceof Error ? error.message : 'Unable to save project')
      return false
    } finally {
      if (operation === this.saveSequence) {
        this.host.setOperationProgress(null)
        this.host.setProjectOperation?.(null)
      }
    }
  }

  saveThenContinue = async () => {
    if (await this.save()) this.continueNavigation()
  }

  requestLinkedFolder = async () => {
    const target = this.host.pendingLinkedDocument()
    if (!target) return
    const operation = ++this.linkedFolderSequence
    const version = this.host.project.versionedSnapshot()
    const registry = this.host.registry()
    const isCurrent = () =>
      operation === this.linkedFolderSequence &&
      registry === this.host.registry() &&
      this.host.project.isCurrentProject(version)
    try {
      const files = await this.host.chooseLinkedFolder()
      if (!files || !isCurrent()) return
      this.host.setOperationProgress('Locating photos…')
      this.host.setProjectOperation?.({ id: operation, kind: 'open', phase: 'Locating photos' })
      const matches = await matchProjectAssets(target.assets, files, {
        isCurrent,
        onProgress: (progress) => {
          if (!isCurrent()) return
          this.host.setProjectOperation?.({
            id: operation,
            kind: 'open',
            phase: 'Locating photos',
            completed: progress.completed,
            total: progress.total,
            detail: formatLinkedAssetProgress(progress),
          })
        },
      })
      const { linkedAssetRecord } = await import('../persistence/linkedAssets')
      if (!isCurrent()) return
      let prepared = 0
      let lastProgressAt = 0
      const reportPreparation = (force = false) => {
        if (!isCurrent()) return
        const now = performance.now()
        if (!force && now - lastProgressAt < 100) return
        lastProgressAt = now
        this.host.setOperationProgress('Preparing photos…')
        this.host.setProjectOperation?.({
          id: operation,
          kind: 'open',
          phase: 'Preparing photos',
          completed: prepared,
          total: matches.size,
          detail: `${prepared} of ${matches.size} photos`,
        })
      }
      reportPreparation(true)
      for (const [assetId, match] of matches) {
        if (!isCurrent()) return
        const asset = target.assets[assetId]
        await registry.register(
          assetId,
          match.file,
          asset?.sha256,
          asset,
          undefined,
          undefined,
          isCurrent,
        )
        prepared += 1
        reportPreparation(prepared === matches.size)
      }
      if (!isCurrent()) return
      const currentAssets = this.host.document().assets
      this.host.project.replaceAssets(
        [...matches].flatMap(([assetId, match]) => {
          const asset = currentAssets[assetId]
          if (!asset || asset.sha256 !== match.sha256 || asset.byteLength !== match.file.size)
            return []
          const replacement = linkedAssetRecord(asset, match)
          if (
            asset.originalName === replacement.originalName &&
            asset.storage.kind === 'linked' &&
            asset.storage.relativePath === match.relativePath &&
            asset.storage.displayHint === match.relativePath &&
            asset.storage.lastModified === match.file.lastModified
          )
            return []
          return [{ assetId, replacement }]
        }),
      )
      this.host.setMissingAssetIds(
        new Set([...this.host.missingAssetIds()].filter((assetId) => !matches.has(assetId))),
      )
      this.host.incrementImageRevision()
      await this.host.preparePageImages(this.host.activePage(), this.host.registry())
      if (!isCurrent()) return
      this.host.setPendingLinkedDocument(null)
      this.host.announce(
        matches.size === Object.keys(target.assets).length
          ? 'Linked images loaded.'
          : `${matches.size} linked photo${matches.size === 1 ? '' : 's'} found; the rest still need relinking.`,
      )
    } catch (error) {
      this.host.announce(
        error instanceof Error ? error.message : 'Unable to use the selected asset folder',
      )
    } finally {
      if (operation === this.linkedFolderSequence) {
        this.host.setOperationProgress(null)
        this.host.setProjectOperation?.(null)
      }
    }
  }

  open = async (file: File | undefined) => {
    if (!file) return
    const operation = ++this.openSequence
    const version = this.host.project.versionedSnapshot()
    const isCurrent = () =>
      operation === this.openSequence && this.host.project.isCurrentVersion(version)
    this.opening = true
    try {
      this.host.setOperationProgress('Opening project…')
      this.host.setProjectOperation?.({ id: operation, kind: 'open', phase: 'Reading project' })
      this.host.setOpeningPages([], 0)
      const { format, opened } = await openProjectFile(file, {
        onProgress: (phase, completed, total) => {
          if (!isCurrent()) return
          this.host.setOperationProgress(`${phase}…`)
          this.host.setProjectOperation?.({
            id: operation,
            kind: 'open',
            phase,
            completed,
            total,
            detail: `${formatOperationBytes(completed)} of ${formatOperationBytes(total)}`,
          })
        },
      })
      if (!isCurrent()) return
      this.host.setOperationProgress(`Opening pages 0/${opened.document.pages.length}…`)
      this.host.setProjectOperation?.({
        id: operation,
        kind: 'open',
        phase: 'Preparing pages',
        completed: 0,
        total: opened.document.pages.length,
        detail: `0 of ${opened.document.pages.length} pages`,
      })
      this.host.setOpeningPages([], opened.document.pages.length)
      const installed = await this.host.installDocument(
        opened.document,
        opened.assets,
        isCurrent,
        (completed, total, readyPages) => {
          if (!isCurrent()) return
          this.host.setOperationProgress(`Opening pages ${completed}/${total}…`)
          this.host.setProjectOperation?.({
            id: operation,
            kind: 'open',
            phase: 'Preparing pages',
            completed,
            total,
            detail: `${completed} of ${total} pages`,
          })
          this.host.setOpeningPages(readyPages, total)
        },
      )
      if (!installed) return
      if (
        operation !== this.openSequence ||
        this.host.document().projectId !== opened.document.projectId
      )
        return
      const linkedIds = format === 'linked' ? Object.keys(opened.document.assets) : []
      this.host.persistence.reset(format)
      this.host.setHasSavedProject(false)
      this.host.setMissingAssetIds(new Set([...opened.missingAssetIds, ...linkedIds]))
      this.host.setPendingLinkedDocument(linkedIds.length ? opened.document : null)
      this.host.setRecoveredOnly(false)
      this.host.setActivePageId(
        this.host.preferredPageId?.(opened.document) ?? opened.document.pages[0].id,
      )
      this.host.setSelectedSlotId(null)
      this.host.setProjectTitle(opened.document.title)
      this.host.announce(
        opened.missingAssetIds.length || linkedIds.length
          ? `Project opened with ${opened.missingAssetIds.length + linkedIds.length} photo${opened.missingAssetIds.length + linkedIds.length === 1 ? '' : 's'} to locate.`
          : 'Project opened.',
      )
    } catch (error) {
      this.host.announce(error instanceof Error ? error.message : 'Unable to open project')
    } finally {
      if (operation === this.openSequence) {
        this.opening = false
        this.host.setOperationProgress(null)
        this.host.setProjectOperation?.(null)
        this.host.setOpeningPages(null, 0)
      }
    }
  }
}
