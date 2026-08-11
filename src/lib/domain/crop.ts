import { clamp } from '../utils/numbers'
import type { SlotContentV1 } from './types'

export interface ImagePlacement {
  x: number
  y: number
  width: number
  height: number
  cover: number
  overflowX: number
  overflowY: number
}

export const defaultPlacement = (): SlotContentV1['placement'] => ({
  zoom: 1,
  positionX: 0.5,
  positionY: 0.5,
})

export function resolveCoverPlacement(
  frameWidth: number,
  frameHeight: number,
  imageWidth: number,
  imageHeight: number,
  placement: SlotContentV1['placement'],
): ImagePlacement {
  const cover = Math.max(frameWidth / imageWidth, frameHeight / imageHeight)
  const width = imageWidth * cover * placement.zoom
  const height = imageHeight * cover * placement.zoom
  const overflowX = Math.max(0, width - frameWidth)
  const overflowY = Math.max(0, height - frameHeight)
  return {
    x: -placement.positionX * overflowX,
    y: -placement.positionY * overflowY,
    width,
    height,
    cover,
    overflowX,
    overflowY,
  }
}

export function panPlacement(
  placement: SlotContentV1['placement'],
  dimensions: Pick<ImagePlacement, 'overflowX' | 'overflowY'>,
  deltaX: number,
  deltaY: number,
): SlotContentV1['placement'] {
  return {
    zoom: placement.zoom,
    positionX:
      dimensions.overflowX === 0
        ? 0.5
        : clamp(placement.positionX - deltaX / dimensions.overflowX, 0, 1),
    positionY:
      dimensions.overflowY === 0
        ? 0.5
        : clamp(placement.positionY - deltaY / dimensions.overflowY, 0, 1),
  }
}

export function zoomPlacement(
  placement: SlotContentV1['placement'],
  oldDimensions: ImagePlacement,
  nextZoom: number,
): SlotContentV1['placement'] {
  const zoom = clamp(nextZoom, 1, 8)
  const frameWidth = oldDimensions.width - oldDimensions.overflowX
  const frameHeight = oldDimensions.height - oldDimensions.overflowY
  const focalX =
    (frameWidth / 2 + placement.positionX * oldDimensions.overflowX) / oldDimensions.width
  const focalY =
    (frameHeight / 2 + placement.positionY * oldDimensions.overflowY) / oldDimensions.height
  const nextWidth = oldDimensions.width * (zoom / placement.zoom)
  const nextHeight = oldDimensions.height * (zoom / placement.zoom)
  const nextOverflowX = Math.max(0, nextWidth - frameWidth)
  const nextOverflowY = Math.max(0, nextHeight - frameHeight)
  return {
    zoom,
    positionX:
      nextOverflowX === 0
        ? 0.5
        : clamp((focalX * nextWidth - frameWidth / 2) / nextOverflowX, 0, 1),
    positionY:
      nextOverflowY === 0
        ? 0.5
        : clamp((focalY * nextHeight - frameHeight / 2) / nextOverflowY, 0, 1),
  }
}
