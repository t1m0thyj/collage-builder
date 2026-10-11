import type { AssetRecordV1, PageV1 } from '../domain/types'
import { resolveLayout } from '../domain/geometry'
import { exportDimensions } from './exportQuality'
import { zipBlobs } from '../persistence/zipStreams'
import { drawExportFrameImage, drawExportPage, prepareExportPage } from './exportCanvas'
import { renderPageInWorker, supportsWorkerExport } from './exportWorkerClient'

export { exportDimensions, resolveExportRange } from './exportQuality'

export type ExportFormat = 'png' | 'jpeg'

export function jpegQuality(quality: number): number {
  if (!Number.isFinite(quality) || quality < 1 || quality > 100)
    throw new Error('JPEG quality must be between 1 and 100')
  return quality / 100
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
  useOffscreenCanvas = true,
): Promise<Blob> {
  // Keep worker and foreground fallback on the same canvas implementation when
  // available: rounded clipping can rasterize differently on an HTML canvas.
  const canvas =
    useOffscreenCanvas &&
    typeof OffscreenCanvas === 'function' &&
    typeof OffscreenCanvas.prototype.convertToBlob === 'function'
      ? new OffscreenCanvas(width, height)
      : globalThis.document.createElement('canvas')
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
        let bitmap: ImageBitmap
        try {
          bitmap = await createImageBitmap(source)
        } catch (error) {
          // The saved original can be valid while a full-size bitmap decode fails
          // (for example under memory pressure). The registry already decoded a
          // bounded preview when the project opened, so keep export usable.
          const preview = getImage(content.assetId)
          if (!preview) throw error
          drawExportFrameImage(context, page, frame, asset, preview)
          continue
        }
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
    if ('convertToBlob' in canvas)
      return await canvas.convertToBlob({ type: mimeType, quality: outputQuality })
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
  } catch (error) {
    if (!('convertToBlob' in canvas)) throw error
    // Some browsers expose OffscreenCanvas but fail an operation at runtime.
    // Release its backing store before retrying with the compatibility canvas.
    canvas.width = 1
    canvas.height = 1
    return await renderPageImageOnMainThread(
      page,
      assets,
      getImage,
      getRenderableBlob,
      width,
      height,
      format,
      quality,
      false,
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
  longSide: number,
  format: ExportFormat,
  quality = 90,
  ensureImages?: (assetIds: Iterable<string>) => Promise<unknown>,
): Promise<RenderedPageImage> {
  const { width, height } = exportDimensions(page, longSide)
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
  longSide: number,
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
      longSide,
      format,
      quality,
      ensureImages,
    )
  ).blob
}

export async function zipImages(
  pages: Iterable<{ name: string; blob: Blob }> | AsyncIterable<{ name: string; blob: Blob }>,
  modifiedAt?: string,
): Promise<Blob> {
  const editedAt = modifiedAt ? new Date(modifiedAt) : new Date()
  if (!Number.isFinite(editedAt.getTime())) throw new Error('Invalid export modification date')
  // ZIP has no timezone field. Use the UTC calendar components consistently,
  // retaining a meaningful edit time within ZIP's supported year range.
  const mtime = new Date(
    Math.min(2107, Math.max(1980, editedAt.getUTCFullYear())),
    editedAt.getUTCMonth(),
    editedAt.getUTCDate(),
    editedAt.getUTCHours(),
    editedAt.getUTCMinutes(),
    editedAt.getUTCSeconds(),
  )
  return zipBlobs(pages, 'application/zip', { mtime })
}
