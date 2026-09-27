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
  }: SaveRequest): Promise<ProjectSaveFormat | null> {
    const choosingDestination = saveAs || !this.hasSavedProject
    const target = choosingDestination
      ? await chooseSaveTarget(projectTitle, this.currentFormat, chooseFallback)
      : (this.currentTarget ?? { format: this.currentFormat })
    if (!target || !isCurrent()) return null

    const baseName = projectTitle || 'collage'
    if (target.format === 'embedded') {
      onStarted()
      const archive = await createEmbeddedProject(document, registry)
      if (!isCurrent()) return null
      await writeProjectBlob(target, archive, `${baseName}.collage`)
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
      await writeProjectBlob(target, linkedProject, `${baseName}.collage.json`)
    }

    if (!isCurrent()) return null
    this.currentTarget = target.handle ? target : null
    this.currentFormat = target.format
    this.hasSavedProject = true
    return target.format
  }
}
