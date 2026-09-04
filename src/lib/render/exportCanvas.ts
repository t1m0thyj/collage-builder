import { resolveCoverPlacement } from '../domain/crop'
import { resolveLayout } from '../domain/geometry'
import type { AssetRecordV1, PageV1, ResolvedFrame } from '../domain/types'

type ExportContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function framePath(context: ExportContext, frame: ResolvedFrame, cornerRadius: number): void {
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

export function drawExportPage(
  context: ExportContext,
  page: PageV1,
  assets: Record<string, AssetRecordV1>,
  getImage: (assetId: string) => CanvasImageSource | undefined,
  width: number,
  format: 'png' | 'jpeg',
): void {
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
}
