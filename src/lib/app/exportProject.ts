import type { CollageDocumentV1, PageV1 } from '../domain/types'
import type { AssetRegistry } from '../render/assetRegistry'
import { countUpscaledPlacements, resolveExportRange } from '../render/exportQuality'
import type { ExportFormat } from '../render/exportPng'
import { exportImageFilenames, safeExportBasename } from './exportFilenames'

export interface ExportSettings {
  scope: 'current' | 'all' | 'range'
  range: string
  longSide: number
  format: ExportFormat
  quality: number
  filenameTemplate?: string
}

export interface ProjectExportRequest {
  document: CollageDocumentV1
  registry: AssetRegistry
  activePageId: string
  scope: ExportSettings['scope']
  range: ExportSettings['range']
  longSide: ExportSettings['longSide']
  format: ExportSettings['format']
  quality: ExportSettings['quality']
  filenameTemplate?: ExportSettings['filenameTemplate']
  baseName: string
  isCancelled: () => boolean
  onProgress: (message: string) => void
}

export interface ProjectExportResult {
  blob: Blob
  filename: string
  pageCount: number
}

function pageAssetIds(page: PageV1): string[] {
  return Object.values(page.slots).flatMap((content) => (content ? [content.assetId] : []))
}

export async function renderProjectExport({
  document,
  registry,
  activePageId,
  scope,
  range,
  longSide,
  format,
  quality,
  baseName,
  filenameTemplate,
  isCancelled,
  onProgress,
}: ProjectExportRequest): Promise<ProjectExportResult> {
  const { renderPageImage, zipImages } = await import('../render/exportPng')
  const activePageIndex = document.pages.findIndex((page) => page.id === activePageId)
  const indices = resolveExportRange(scope, activePageIndex, document.pages.length, range)
  const filenames = exportImageFilenames(
    baseName,
    indices,
    format,
    filenameTemplate,
    document.pages.map((page) => page.name),
  )
  const activePageAssetIds = pageAssetIds(document.pages[activePageIndex])
  const renderPage = async (position: number, index: number) => {
    if (isCancelled()) throw new Error('Export cancelled')
    onProgress(`Rendering page ${position + 1} of ${indices.length}…`)
    const page = document.pages[index]
    const blob = await renderPageImage(
      page,
      document.assets,
      (assetId) => registry.getImage(assetId),
      longSide,
      format,
      quality,
      (assetId) => registry.getRenderableBlob(assetId),
      (assetIds) => registry.ensureImages(assetIds),
    )
    if (isCancelled()) throw new Error('Export cancelled')
    return {
      name: filenames[position],
      blob,
    }
  }

  if (indices.length === 1) {
    try {
      const rendered = await renderPage(0, indices[0])
      onProgress('Preparing download…')
      return { blob: rendered.blob, filename: rendered.name, pageCount: 1 }
    } finally {
      registry.retainDecodedForPage(activePageAssetIds)
    }
  }

  async function* renderPages() {
    for (const [position, index] of indices.entries()) {
      try {
        // zipImages fully consumes this Blob before requesting the next page, so only
        // one rendered page remains reachable outside the growing final ZIP.
        yield await renderPage(position, index)
      } finally {
        registry.retainDecodedForPage(activePageAssetIds)
      }
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))
    }
    onProgress('Finalizing ZIP…')
  }

  const blob = await zipImages(renderPages(), document.updatedAt)
  return {
    blob,
    filename: `${safeExportBasename(baseName)}-pages.zip`,
    pageCount: indices.length,
  }
}

interface ExportWorkflowHost {
  document: () => CollageDocumentV1
  registry: () => AssetRegistry
  activePageId: () => string
  scope: () => 'current' | 'all' | 'range'
  range: () => string
  longSide: () => number
  format: () => ExportFormat
  quality: () => number
  projectTitle: () => string
  isCancelled: () => boolean
  setScope: (scope: 'current' | 'all' | 'range') => void
  setOpen: (open: boolean) => void
  setExporting: (exporting: boolean) => void
  resetCancellation: () => void
  setProgress: (progress: string) => void
  announce: (message: string) => void
}

export class ExportWorkflowController {
  constructor(private readonly host: ExportWorkflowHost) {}

  choose = (scope: 'current' | 'all' | 'range') => {
    this.host.setScope(scope)
    this.host.setOpen(true)
  }

  upscaleCount = (): number => {
    const document = this.host.document()
    try {
      return resolveExportRange(
        this.host.scope(),
        document.pages.findIndex((page) => page.id === this.host.activePageId()),
        document.pages.length,
        this.host.range(),
      ).reduce(
        (count, index) =>
          count +
          countUpscaledPlacements(document.pages[index], document.assets, this.host.longSide()),
        0,
      )
    } catch {
      return 0
    }
  }

  export = async ({
    scope,
    range,
    longSide,
    format,
    quality,
    filenameTemplate,
  }: ExportSettings) => {
    try {
      this.host.setExporting(true)
      this.host.resetCancellation()
      const result = await renderProjectExport({
        document: this.host.document(),
        registry: this.host.registry(),
        activePageId: this.host.activePageId(),
        scope,
        range,
        longSide,
        format,
        quality,
        filenameTemplate,
        baseName: this.host.projectTitle() || 'collage',
        isCancelled: this.host.isCancelled,
        onProgress: this.host.setProgress,
      })
      const link = globalThis.document.createElement('a')
      link.href = URL.createObjectURL(result.blob)
      link.download = result.filename
      link.click()
      URL.revokeObjectURL(link.href)
      this.host.setOpen(false)
      this.host.announce(`Exported ${result.pageCount} page${result.pageCount === 1 ? '' : 's'}.`)
    } catch (error) {
      this.host.announce(error instanceof Error ? error.message : 'Export failed')
    } finally {
      this.host.setExporting(false)
      this.host.setProgress('')
    }
  }
}
