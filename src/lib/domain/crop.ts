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
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
})

export function rotatedDimensions(width: number, height: number, rotation = 0) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height }
}

export function rotatedImageGeometry(
  placement: ImagePlacement,
  transform: Pick<SlotContentV1['placement'], 'rotation' | 'flipHorizontal' | 'flipVertical'>,
) {
  const rotation = transform.rotation ?? 0
  const { width, height } = rotatedDimensions(placement.width, placement.height, rotation)
  const quarterTurn = rotation === 90 || rotation === 270
  return {
    x: placement.x + placement.width / 2,
    y: placement.y + placement.height / 2,
    width,
    height,
    offsetX: width / 2,
    offsetY: height / 2,
    rotation,
    scaleX: (quarterTurn ? transform.flipVertical : transform.flipHorizontal) ? -1 : 1,
    scaleY: (quarterTurn ? transform.flipHorizontal : transform.flipVertical) ? -1 : 1,
  }
}

export function rotatePlacement(placement: SlotContentV1['placement'], quarterTurns: -1 | 1) {
  const rotation = (((placement.rotation ?? 0) + quarterTurns * 90 + 360) % 360) as
    0 | 90 | 180 | 270
  return {
    ...placement,
    rotation,
    flipHorizontal: placement.flipVertical ?? false,
    flipVertical: placement.flipHorizontal ?? false,
    positionX: quarterTurns === 1 ? 1 - placement.positionY : placement.positionY,
    positionY: quarterTurns === 1 ? placement.positionX : 1 - placement.positionX,
  }
}

export function flipPlacement(
  placement: SlotContentV1['placement'],
  axis: 'horizontal' | 'vertical',
) {
  return axis === 'horizontal'
    ? {
        ...placement,
        flipHorizontal: !placement.flipHorizontal,
        positionX: 1 - placement.positionX,
      }
    : {
        ...placement,
        flipVertical: !placement.flipVertical,
        positionY: 1 - placement.positionY,
      }
}

export function resolveCoverPlacement(
  frameWidth: number,
  frameHeight: number,
  imageWidth: number,
  imageHeight: number,
  placement: SlotContentV1['placement'],
): ImagePlacement {
  const oriented = rotatedDimensions(imageWidth, imageHeight, placement.rotation)
  const cover = Math.max(frameWidth / oriented.width, frameHeight / oriented.height)
  const width = oriented.width * cover * placement.zoom
  const height = oriented.height * cover * placement.zoom
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
    rotation: placement.rotation,
    flipHorizontal: placement.flipHorizontal,
    flipVertical: placement.flipVertical,
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
    rotation: placement.rotation,
    flipHorizontal: placement.flipHorizontal,
    flipVertical: placement.flipVertical,
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
