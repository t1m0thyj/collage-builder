import { resolveCoverPlacement } from '../domain/crop'
import { drawPlacedImage } from './drawPlacedImage'
import { resolveLayout } from '../domain/geometry'
import type { CollageDocumentV1, ResolvedFrame } from '../domain/types'

const previewMaxEdge = 240

function framePath(
  context: CanvasRenderingContext2D,
  frame: ResolvedFrame,
  scale: number,
  radius: number,
): void {
  context.beginPath()
  if (frame.polygon?.length) {
    const [first, ...rest] = frame.polygon
    context.moveTo(
      (frame.x + first.x * frame.width) * scale,
      (frame.y + first.y * frame.height) * scale,
    )
    for (const point of rest)
      context.lineTo(
        (frame.x + point.x * frame.width) * scale,
        (frame.y + point.y * frame.height) * scale,
      )
    context.closePath()
    return
  }
  context.roundRect(
    frame.x * scale,
    frame.y * scale,
    frame.width * scale,
    frame.height * scale,
    radius,
  )
}

function paintTransparencyGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const size = 12
  context.fillStyle = '#f4f4f4'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#e4e4e4'
  for (let y = 0; y < height; y += size)
    for (let x = 0; x < width; x += size)
      if ((x / size + y / size) % 2 === 0) context.fillRect(x, y, size, size)
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | undefined> {
  const webp = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.8),
  )
  if (webp) return webp
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/png'))
}

export async function createRecoveryPreview(
  document: CollageDocumentV1,
  assets: Map<string, Blob> | ((assetId: string) => Promise<Blob | undefined>),
): Promise<Blob | undefined> {
  const page = document.pages[0]
  if (!page || typeof globalThis.document === 'undefined') return undefined
  const scale = previewMaxEdge / Math.max(page.width, page.height)
  const canvas = globalThis.document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(page.width * scale))
  canvas.height = Math.max(1, Math.round(page.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return undefined
  const getAsset = assets instanceof Map ? async (assetId: string) => assets.get(assetId) : assets

  if (page.style.transparentBackground) paintTransparencyGrid(context, canvas.width, canvas.height)
  else {
    context.fillStyle = page.style.backgroundColor
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  for (const frame of resolveLayout(page)) {
    const radius = Math.min(
      page.style.cornerRadius * scale,
      (frame.width * scale) / 2,
      (frame.height * scale) / 2,
    )
    context.save()
    framePath(context, frame, scale, radius)
    context.clip()
    context.fillStyle = '#dfe5ee'
    context.fillRect(frame.x * scale, frame.y * scale, frame.width * scale, frame.height * scale)

    const content = page.slots[frame.slotId]
    const blob = content ? await getAsset(content.assetId) : undefined
    if (content && blob) {
      const asset = document.assets[content.assetId]
      try {
        const resizeScale = asset
          ? Math.min(1, previewMaxEdge / Math.max(asset.width, asset.height))
          : 1
        const bitmap = await createImageBitmap(
          blob,
          asset
            ? {
                resizeWidth: Math.max(1, Math.round(asset.width * resizeScale)),
                resizeHeight: Math.max(1, Math.round(asset.height * resizeScale)),
                resizeQuality: 'high',
              }
            : undefined,
        )
        try {
          const placement = resolveCoverPlacement(
            frame.width * scale,
            frame.height * scale,
            bitmap.width,
            bitmap.height,
            content.placement,
          )
          drawPlacedImage(
            context,
            bitmap,
            frame.x * scale,
            frame.y * scale,
            placement,
            content.placement,
          )
        } finally {
          bitmap.close()
        }
      } catch {
        // Unsupported or damaged images retain the layout placeholder in the preview.
      }
    }
    context.restore()
  }

  return canvasBlob(canvas)
}
