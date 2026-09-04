import { resolveCoverPlacement } from '../domain/crop'
import { resolveLayout } from '../domain/geometry'
import type { AssetRecordV1, PageV1 } from '../domain/types'
import { zipBlobs } from '../persistence/zipStreams'

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

function framePath(
  context: CanvasRenderingContext2D,
  frame: ReturnType<typeof resolveLayout>[number],
  cornerRadius: number,
) {
  context.beginPath()
  if (frame.polygon) {
    context.moveTo(
      frame.x + frame.polygon[0].x * frame.width,
      frame.y + frame.polygon[0].y * frame.height,
    )
    frame.polygon
      .slice(1)
      .forEach((point) =>
        context.lineTo(frame.x + point.x * frame.width, frame.y + point.y * frame.height),
      )
    context.closePath()
    return
  }
  context.roundRect(
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    Math.min(cornerRadius, frame.width / 2, frame.height / 2),
  )
}

function shadowColor(color: string, opacity: number): string {
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  return `rgb(${red} ${green} ${blue} / ${opacity})`
}

export async function renderPageImage(
  page: PageV1,
  assets: Record<string, AssetRecordV1>,
  getImage: (assetId: string) => HTMLImageElement | undefined,
  width: number,
  format: ExportFormat,
  quality = 90,
): Promise<Blob> {
  const dimensions = exportDimensions(page, width)
  const height = dimensions.height
  const canvas = globalThis.document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable')
  const scale = width / page.width
  context.scale(scale, scale)
  if (!page.style.transparentBackground || format === 'jpeg') {
    context.fillStyle = page.style.transparentBackground ? '#FFFFFF' : page.style.backgroundColor
    context.fillRect(0, 0, page.width, page.height)
  }
  if (page.style.shadow.enabled)
    for (const frame of resolveLayout(page)) {
      if (!page.slots[frame.slotId]) continue
      context.save()
      context.shadowColor = shadowColor(page.style.shadow.color, page.style.shadow.opacity)
      context.shadowBlur = page.style.shadow.blur
      context.shadowOffsetX = page.style.shadow.offsetX
      context.shadowOffsetY = page.style.shadow.offsetY
      context.fillStyle = '#FFFFFF'
      framePath(context, frame, page.style.cornerRadius)
      context.fill()
      context.restore()
    }
  for (const frame of resolveLayout(page)) {
    const content = page.slots[frame.slotId]
    if (!content) continue
    const asset = assets[content.assetId]
    const image = getImage(content.assetId)
    if (!asset || !image) throw new Error('An image is not available for export')
    const placement = resolveCoverPlacement(
      frame.width,
      frame.height,
      asset.width,
      asset.height,
      content.placement,
    )
    context.save()
    framePath(context, frame, page.style.cornerRadius)
    context.clip()
    context.drawImage(
      image,
      frame.x + placement.x,
      frame.y + placement.y,
      placement.width,
      placement.height,
    )
    context.restore()
  }
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
  const outputQuality = format === 'jpeg' ? jpegQuality(quality) : undefined
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error(`${format === 'jpeg' ? 'JPEG' : 'PNG'} rendering failed`)),
      mimeType,
      outputQuality,
    ),
  )
}

export async function renderPagePng(
  page: PageV1,
  assets: Record<string, AssetRecordV1>,
  getImage: (assetId: string) => HTMLImageElement | undefined,
  width: number,
): Promise<Blob> {
  return renderPageImage(page, assets, getImage, width, 'png')
}

export async function zipImages(pages: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  return zipBlobs(pages, 'application/zip')
}

export async function zipPngs(pages: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  return zipImages(pages)
}
