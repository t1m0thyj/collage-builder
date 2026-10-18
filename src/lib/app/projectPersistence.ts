import type { CollageDocumentV1 } from '../domain/types'
import type { AssetRegistry } from '../render/assetRegistry'
import {
  chooseSaveTarget,
  createLinkedProjectFile,
  prepareEmbeddedProject,
  writeEmbeddedProject,
  writeProjectBlob,
  type ProjectSaveFormat,
  type SaveTarget,
} from './projectIO'

interface SaveRequest {
  document: CollageDocumentV1
  registry: AssetRegistry
  projectTitle: string
  saveAs: boolean
  chooseFallback: () => Promise<ProjectSaveFormat | null>
  isCurrent?: () => boolean
  onStarted?: () => void
  onProgress?: (
    phase: 'Packaging photos' | 'Saving project' | 'Writing file' | 'Finalizing',
    completed?: number,
    total?: number,
    detail?: string,
  ) => void
}

export interface ProjectSaveResult {
  format: ProjectSaveFormat
  destination: 'native' | 'download'
}

export class ProjectPersistenceController {
  private currentTarget: SaveTarget | null = null
  private currentFormat: ProjectSaveFormat = 'embedded'
  private hasSavedProject = false

  reset(format: ProjectSaveFormat = 'embedded') {
    this.currentTarget = null
    this.currentFormat = format
    this.hasSavedProject = false
  }

  async save({
    document,
    registry,
    projectTitle,
    saveAs,
    chooseFallback,
    isCurrent = () => true,
    onStarted = () => undefined,
    onProgress = () => undefined,
  }: SaveRequest): Promise<ProjectSaveResult | null> {
    let lastProgressAt = 0
    const reportProgress = (
      phase: 'Packaging photos' | 'Saving project' | 'Writing file' | 'Finalizing',
      completed?: number,
      total?: number,
      force = false,
      detail?: string,
    ) => {
      const now = performance.now()
      if (!force && phase !== 'Finalizing' && completed !== 0 && now - lastProgressAt < 100) return
      lastProgressAt = now
      onProgress(phase, completed, total, detail)
    }
    const choosingDestination = saveAs || !this.hasSavedProject
    const target = choosingDestination
      ? await chooseSaveTarget(projectTitle, this.currentFormat, chooseFallback)
      : (this.currentTarget ?? { format: this.currentFormat })
    if (!target || !isCurrent()) return null

    const baseName = projectTitle || 'collage'
    let destination: 'native' | 'download'
    if (target.format === 'embedded') {
      onStarted()
      const archive = await prepareEmbeddedProject(document, registry)
      if (!isCurrent()) return null
      if (target.handle) {
        reportProgress('Saving project', 0, archive.payloadBytes)
        destination = await writeEmbeddedProject(target, archive, `${baseName}.collage`, {
          isCurrent,
          onProgress: (completed, total) =>
            reportProgress('Saving project', completed, total, completed === total),
          onFinalizing: () => reportProgress('Finalizing'),
        })
      } else {
        reportProgress('Packaging photos', 0, archive.payloadBytes)
        destination = await writeEmbeddedProject(target, archive, `${baseName}.collage`, {
          isCurrent,
          onProgress: (completed, total) =>
            reportProgress('Packaging photos', completed, total, completed === total),
          onFinalizing: () => reportProgress('Finalizing'),
        })
      }
    } else {
      onStarted()
      const linkedProject = await createLinkedProjectFile(document)
      if (!isCurrent()) return null
      reportProgress('Writing file', 0, linkedProject.size)
      destination = await writeProjectBlob(target, linkedProject, `${baseName}.collage.json`, {
        isCurrent,
        onProgress: (completed, total) => reportProgress('Writing file', completed, total),
        onFinalizing: () => reportProgress('Finalizing'),
      })
    }

    if (!isCurrent()) return null
    this.currentTarget = target.handle ? target : null
    this.currentFormat = target.format
    this.hasSavedProject = true
    return { format: target.format, destination }
  }
}
