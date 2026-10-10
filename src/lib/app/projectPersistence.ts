import type { CollageDocumentV1 } from '../domain/types'
import type { AssetRegistry } from '../render/assetRegistry'
import {
  chooseSaveTarget,
  createEmbeddedProject,
  createLinkedProjectFile,
  matchProjectAssets,
  writeProjectBlob,
  type LinkedAssetMatch,
  type ProjectSaveFormat,
  type SaveTarget,
} from './projectIO'

interface SaveRequest {
  document: CollageDocumentV1
  registry: AssetRegistry
  projectTitle: string
  saveAs: boolean
  chooseFallback: () => Promise<ProjectSaveFormat | null>
  chooseLinkedFolder: () => Promise<FileList | null>
  isCurrent?: () => boolean
  onStarted?: () => void
  onProgress?: (
    phase: 'Packaging photos' | 'Writing file' | 'Finalizing',
    completed?: number,
    total?: number,
  ) => void
}

export class ProjectPersistenceController {
  private currentTarget: SaveTarget | null = null
  private currentFormat: ProjectSaveFormat = 'embedded'
  private hasSavedProject = false
  private linkedMatches = new Map<string, LinkedAssetMatch>()

  reset(format: ProjectSaveFormat = 'embedded') {
    this.currentTarget = null
    this.currentFormat = format
    this.hasSavedProject = false
    this.linkedMatches = new Map()
  }

  setLinkedMatches(matches: Map<string, LinkedAssetMatch>) {
    this.linkedMatches = matches
  }

  invalidateLinkedMatch(assetId: string) {
    this.linkedMatches = new Map(
      [...this.linkedMatches].filter(([candidate]) => candidate !== assetId),
    )
  }

  private async linkedMatchesForSave(
    document: CollageDocumentV1,
    chooseLinkedFolder: () => Promise<FileList | null>,
    forceChooseFolder: boolean,
    onStarted: () => void,
  ) {
    const assetIds = Object.keys(document.assets)
    if (!assetIds.length) {
      onStarted()
      return new Map<string, LinkedAssetMatch>()
    }
    const cachedMatchesAreComplete = assetIds.every((assetId) => this.linkedMatches.has(assetId))
    if (!forceChooseFolder && cachedMatchesAreComplete) {
      onStarted()
      return this.linkedMatches
    }
    const files = await chooseLinkedFolder()
    if (!files) return null
    onStarted()
    this.linkedMatches = await matchProjectAssets(document.assets, files)
    return this.linkedMatches
  }

  async save({
    document,
    registry,
    projectTitle,
    saveAs,
    chooseFallback,
    chooseLinkedFolder,
    isCurrent = () => true,
    onStarted = () => undefined,
    onProgress = () => undefined,
  }: SaveRequest): Promise<ProjectSaveFormat | null> {
    let lastProgressAt = 0
    const reportProgress = (
      phase: 'Packaging photos' | 'Writing file' | 'Finalizing',
      completed?: number,
      total?: number,
    ) => {
      const now = performance.now()
      if (phase !== 'Finalizing' && completed !== 0 && now - lastProgressAt < 100) return
      lastProgressAt = now
      onProgress(phase, completed, total)
    }
    const choosingDestination = saveAs || !this.hasSavedProject
    const target = choosingDestination
      ? await chooseSaveTarget(projectTitle, this.currentFormat, chooseFallback)
      : (this.currentTarget ?? { format: this.currentFormat })
    if (!target || !isCurrent()) return null

    const baseName = projectTitle || 'collage'
    if (target.format === 'embedded') {
      onStarted()
      const archive = await createEmbeddedProject(document, registry, {
        onProgress: (completed, total) => reportProgress('Packaging photos', completed, total),
      })
      if (!isCurrent()) return null
      reportProgress('Writing file', 0, archive.size)
      await writeProjectBlob(target, archive, `${baseName}.collage`, {
        onProgress: (completed, total) => reportProgress('Writing file', completed, total),
        onFinalizing: () => reportProgress('Finalizing'),
      })
    } else {
      const matches = await this.linkedMatchesForSave(
        document,
        chooseLinkedFolder,
        choosingDestination,
        onStarted,
      )
      if (!matches || !isCurrent()) return null
      const linkedProject = await createLinkedProjectFile(document, matches)
      if (!isCurrent()) return null
      reportProgress('Writing file', 0, linkedProject.size)
      await writeProjectBlob(target, linkedProject, `${baseName}.collage.json`, {
        onProgress: (completed, total) => reportProgress('Writing file', completed, total),
        onFinalizing: () => reportProgress('Finalizing'),
      })
    }

    if (!isCurrent()) return null
    this.currentTarget = target.handle ? target : null
    this.currentFormat = target.format
    this.hasSavedProject = true
    return target.format
  }
}
