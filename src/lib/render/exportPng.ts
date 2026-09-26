import type { AssetRecordV1, PageV1 } from '../domain/types'
import { resolveLayout } from '../domain/geometry'
import { zipBlobs } from '../persistence/zipStreams'
import { drawExportFrameImage, drawExportPage, prepareExportPage } from './exportCanvas'
import { renderPageInWorker, supportsWorkerExport } from './exportWorkerClient'

export { resolveExportRange } from './exportQuality'

export type ExportFormat = 'png' | 'jpeg'

export function jpegQuality(quality: number): number {
  if (!Number.isFinite(quality) || quality < 1 || quality > 100)
    throw new Error('JPEG quality must be between 1 and 100')
  return quality / 100
}

export function exportDimensions(page: PageV1, width: number): { width: number; height: number } {
  const height = Math.round((width * page.height) / page.width)
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 64_000_000
  )
    throw new Error('Export size exceeds the 8192 px / 64 megapixel limit')
  return { width, height }
}

export interface ExportRenderMeasurement {
  durationMs: number
  pixelCount: number
  renderer: 'worker' | 'main-thread'
  decodedSourceBytes: number
  peakAdditionalDecodedBytes: number
}

export interface RenderedPageImage extends ExportRenderMeasurement {
  blob: Blob
}

function recordMeasurement(measurement: ExportRenderMeasurement, startedAt: number): void {
  try {
    performance.measure('collage-export-render', {
      start: startedAt,
      end: performance.now(),
      detail: measurement,
    })
  } catch {
    // Export still succeeds in browsers without User Timing Level 3 detail support.
  }
}

function pageAssetIds(page: PageV1): string[] {
  return [
    ...new Set(Object.values(page.slots).flatMap((content) => (content ? [content.assetId] : []))),
  ]
}

async function renderPageImageOnMainThread(
  page: PageV1,
  assets: Record<string, AssetRecordV1>,
  getImage: (assetId: string) => HTMLImageElement | undefined,
  getRenderableBlob: ((assetId: string) => Blob | undefined) | undefined,
  width: number,
  height: number,
  format: ExportFormat,
  quality: number,
): Promise<Blob> {
  const canvas = globalThis.document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas rendering is unavailable')
    if (getRenderableBlob && typeof createImageBitmap === 'function') {
      prepareExportPage(context, page, width, format)
      for (const frame of resolveLayout(page)) {
        const content = page.slots[frame.slotId]
        if (!content) continue
        const asset = assets[content.assetId]
        const source = getRenderableBlob(content.assetId)
        if (!asset || !source) throw new Error('An image is not available for export')
        const bitmap = await createImageBitmap(source)
        try {
          drawExportFrameImage(context, page, frame, asset, bitmap)
        } finally {
          bitmap.close()
        }
      }
    } else {
      drawExportPage(context, page, assets, getImage, width, format)
    }
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
    const outputQuality = format === 'jpeg' ? jpegQuality(quality) : undefined
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error(`${format === 'jpeg' ? 'JPEG' : 'PNG'} rendering failed`)),
        mimeType,
        outputQuality,
      ),
    )
  } finally {
    canvas.width = 1
    canvas.height = 1
  }
}

export async function renderPageImageMeasured(
  page: PageV1,
  assets: Record<string, AssetRecordV1>,
  getImage: (assetId: string) => HTMLImageElement | undefined,
  getRenderableBlob: ((assetId: string) => Blob | undefined) | undefined,
  width: number,
  format: ExportFormat,
  quality = 90,
  ensureImages?: (assetIds: Iterable<string>) => Promise<unknown>,
): Promise<RenderedPageImage> {
  const { height } = exportDimensions(page, width)
  const outputQuality = format === 'jpeg' ? jpegQuality(quality) : quality
  const startedAt = performance.now()
  let renderer: ExportRenderMeasurement['renderer'] = 'main-thread'
  let blob: Blob | undefined

  if (getRenderableBlob && supportsWorkerExport()) {
    const assetIds = pageAssetIds(page)
    const images = assetIds.map((assetId) => ({
      assetId,
      blob: getRenderableBlob(assetId),
    }))
    if (images.every((image): image is { assetId: string; blob: Blob } => Boolean(image.blob))) {
      try {
        const pageAssets = Object.fromEntries(
          assetIds.flatMap((assetId) => (assets[assetId] ? [[assetId, assets[assetId]]] : [])),
        )
        blob = await renderPageInWorker(
          page,
          pageAssets,
          images,
          width,
          height,
          format,
          outputQuality,
        )
        renderer = 'worker'
      } catch {
        // A browser can expose OffscreenCanvas without supporting every required operation.
        // Keep the established canvas path as a compatibility fallback.
      }
    }
  }

  if (!blob) {
    await ensureImages?.(pageAssetIds(page))
    blob = await renderPageImageOnMainThread(
      page,
      assets,
      getImage,
      getRenderableBlob,
      width,
      height,
      format,
      quality,
    )
  }
  const measurement: ExportRenderMeasurement = {
    durationMs: performance.now() - startedAt,
    pixelCount: width * height,
    renderer,
    decodedSourceBytes: pageAssetIds(page).reduce(
      (bytes, assetId) =>
        bytes + (assets[assetId]?.width ?? 0) * (assets[assetId]?.height ?? 0) * 4,
      0,
    ),
    peakAdditionalDecodedBytes:
      renderer === 'worker'
        ? Math.max(
            0,
            ...pageAssetIds(page).map(
              (assetId) => (assets[assetId]?.width ?? 0) * (assets[assetId]?.height ?? 0) * 4,
            ),
          )
        : 0,
  }
  recordMeasurement(measurement, startedAt)
  return { blob, ...measurement }
}

export async function renderPageImage(
  page: PageV1,
  assets: Record<string, AssetRecordV1>,
  getImage: (assetId: string) => HTMLImageElement | undefined,
  width: number,
  format: ExportFormat,
  quality = 90,
  getRenderableBlob?: (assetId: string) => Blob | undefined,
  ensureImages?: (assetIds: Iterable<string>) => Promise<unknown>,
): Promise<Blob> {
  return (
    await renderPageImageMeasured(
      page,
      assets,
      getImage,
      getRenderableBlob,
      width,
      format,
      quality,
      ensureImages,
    )
  ).blob
}

export async function zipImages(
  pages: Iterable<{ name: string; blob: Blob }> | AsyncIterable<{ name: string; blob: Blob }>,
): Promise<Blob> {
  return zipBlobs(pages, 'application/zip')
}
