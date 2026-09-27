import { rotatedImageGeometry, type ImagePlacement } from '../domain/crop'
import type { SlotContentV1 } from '../domain/types'

type DrawContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export function drawPlacedImage(
  context: DrawContext,
  image: CanvasImageSource,
  frameX: number,
  frameY: number,
  placement: ImagePlacement,
  transform: Pick<SlotContentV1['placement'], 'rotation' | 'flipHorizontal' | 'flipVertical'>,
) {
  const geometry = rotatedImageGeometry(placement, transform)
  context.save()
  context.translate(frameX + geometry.x, frameY + geometry.y)
  context.scale(transform.flipHorizontal ? -1 : 1, transform.flipVertical ? -1 : 1)
  context.rotate((geometry.rotation * Math.PI) / 180)
  context.drawImage(image, -geometry.offsetX, -geometry.offsetY, geometry.width, geometry.height)
  context.restore()
}
