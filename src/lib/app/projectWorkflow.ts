import { createProject } from '../domain/factories'
import type { CollageDocumentV1, PageV1 } from '../domain/types'
import type { AssetRegistry } from '../render/assetRegistry'
import type { ProjectStore } from '../state/projectStore'
import { matchProjectAssets, openProjectFile, type ProjectSaveFormat } from './projectIO'
import type { ProjectPersistenceController } from './projectPersistence'

type PendingNavigation = 'new' | 'open' | null

interface ProjectWorkflowHost {
  project: ProjectStore
  persistence: ProjectPersistenceController
  document: () => CollageDocumentV1
  projectTitle: () => string
  registry: () => AssetRegistry
  activePage: () => PageV1
  isDirty: () => boolean
  recoveredOnly: () => boolean
  pendingNavigation: () => PendingNavigation
  pendingLinkedDocument: () => CollageDocumentV1 | null
  missingAssetIds: () => Set<string>
  chooseProject: () => void
  chooseLinkedFolder: () => Promise<FileList | null>
  chooseFallbackFormat: () => Promise<ProjectSaveFormat | null>
  installDocument: (
    document: CollageDocumentV1,
    assets: Map<string, Blob>,
    isCurrent?: () => boolean,
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
  incrementImageRevision: () => void
  setOperationProgress: (message: string | null) => void
  announce: (message: string) => void
}

export class ProjectWorkflowController {
  private saveSequence = 0
  private openSequence = 0
  private linkedFolderSequence = 0

  constructor(private readonly host: ProjectWorkflowHost) {}

  newProject = () => {
    this.openSequence += 1
    this.linkedFolderSequence += 1
    const next = createProject('Untitled collage')
    this.host.registry().clear()
    this.host.setMissingAssetIds(new Set())
    this.host.setPendingLinkedDocument(null)
    this.host.persistence.reset()
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
      this.host.setOperationProgress('Saving project…')
      const format = await this.host.persistence.save({
        document: snapshot.document,
        registry: this.host.registry(),
        projectTitle: this.host.projectTitle(),
        saveAs,
        chooseFallback: this.host.chooseFallbackFormat,
        chooseLinkedFolder: this.host.chooseLinkedFolder,
        isCurrent,
      })
      if (!format || !isCurrent()) return false
      if (!this.host.project.markClean(snapshot)) return false
      this.host.setRecoveredOnly(false)
      this.host.announce(
        format === 'embedded'
          ? 'Embedded project saved.'
          : 'Linked project saved. Images remain in the chosen folder.',
      )
      return true
    } catch (error) {
      this.host.announce(error instanceof Error ? error.message : 'Unable to save project')
      return false
    } finally {
      if (operation === this.saveSequence) this.host.setOperationProgress(null)
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
      this.host.setOperationProgress('Locating linked images…')
      const files = await this.host.chooseLinkedFolder()
      if (!files || !isCurrent()) return
      const matches = await matchProjectAssets(target.assets, files)
      if (!isCurrent()) return
      this.host.persistence.setLinkedMatches(matches)
      for (const [assetId, match] of matches) {
        if (!isCurrent()) return
        const asset = target.assets[assetId]
        await registry.register(assetId, match.file, asset?.sha256, asset, undefined, isCurrent)
      }
      if (!isCurrent()) return
      this.host.setMissingAssetIds(
        new Set([...this.host.missingAssetIds()].filter((assetId) => !matches.has(assetId))),
      )
      this.host.incrementImageRevision()
      await this.host.preparePageImages(this.host.activePage(), this.host.registry())
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
      if (operation === this.linkedFolderSequence) this.host.setOperationProgress(null)
    }
  }

  open = async (file: File | undefined) => {
    if (!file) return
    const operation = ++this.openSequence
    const version = this.host.project.versionedSnapshot()
    const isCurrent = () =>
      operation === this.openSequence && this.host.project.isCurrentVersion(version)
    try {
      this.host.setOperationProgress('Opening project…')
      const { format, opened } = await openProjectFile(file)
      if (!isCurrent()) return
      const installed = await this.host.installDocument(opened.document, opened.assets, isCurrent)
      if (!installed) return
      if (
        operation !== this.openSequence ||
        this.host.document().projectId !== opened.document.projectId
      )
        return
      const linkedIds = format === 'linked' ? Object.keys(opened.document.assets) : []
      this.host.persistence.reset(format)
      this.host.setMissingAssetIds(new Set([...opened.missingAssetIds, ...linkedIds]))
      this.host.setPendingLinkedDocument(linkedIds.length ? opened.document : null)
      this.host.setRecoveredOnly(false)
      this.host.setActivePageId(opened.document.pages[0].id)
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
      if (operation === this.openSequence) this.host.setOperationProgress(null)
    }
  }
}
