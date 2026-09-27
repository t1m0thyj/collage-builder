import { describe, expect, it } from 'vitest'
import { createPage, createProject } from '../../src/lib/domain/factories'
import { layout4Presets } from '../../src/lib/layouts/definitions/4'
import { resolveLayout } from '../../src/lib/domain/geometry'
import {
  panPlacement,
  resolveCoverPlacement,
  flipPlacement,
  rotatePlacement,
  rotatedImageGeometry,
  zoomPlacement,
} from '../../src/lib/domain/crop'
import { collageDocumentSchema } from '../../src/lib/domain/schema'

describe('split-tree layout resolution', () => {
  it('tiles the padded area with uniform gaps', () => {
    const page = createPage('Page', layout4Presets[0])
    const frames = resolveLayout(page)
    expect(frames).toHaveLength(4)
    expect(frames.map(({ x, y, width, height }) => [x, y, width, height])).toEqual([
      [30, 30, 1875, 1395],
      [1935, 30, 1875, 1395],
      [30, 1455, 1875, 1395],
      [1935, 1455, 1875, 1395],
    ])
  })

  it('rejects padding and gap combinations with no usable frame area', () => {
    const page = createPage()
    page.style.padding = 2000
    expect(() => resolveLayout(page)).toThrow('Page padding')
  })
})

describe('cover crop placement', () => {
  it('covers using rotated dimensions and turns around the frame center', () => {
    const placement = { zoom: 1, positionX: 0.25, positionY: 0.75, rotation: 90 as const }
    const dimensions = resolveCoverPlacement(400, 200, 600, 300, placement)
    expect(dimensions).toMatchObject({ width: 400, height: 800 })
    expect(rotatedImageGeometry(dimensions, placement)).toMatchObject({
      width: 800,
      height: 400,
      offsetX: 400,
      offsetY: 200,
      rotation: 90,
    })
    expect(rotatePlacement(placement, 1)).toMatchObject({
      rotation: 180,
      positionX: 0.25,
      positionY: 0.25,
    })
    expect(rotatePlacement(rotatePlacement(placement, 1), -1)).toMatchObject(placement)
    const mirrored = flipPlacement(placement, 'horizontal')
    expect(mirrored).toMatchObject({ flipHorizontal: true, positionX: 0.75 })
    expect(flipPlacement(mirrored, 'horizontal').positionX).toBe(placement.positionX)
    expect(rotatePlacement(mirrored, 1)).toMatchObject({
      flipHorizontal: false,
      flipVertical: true,
    })
    expect(rotatedImageGeometry(dimensions, mirrored)).toMatchObject({ scaleX: 1, scaleY: -1 })
    expect(panPlacement(placement, dimensions, 10, 10).rotation).toBe(90)
    expect(zoomPlacement(placement, dimensions, 2).rotation).toBe(90)
  })

  it('defaults older project placements to no rotation', () => {
    const project = createProject()
    const slotId = Object.keys(project.pages[0].slots)[0]
    project.pages[0].slots[slotId] = {
      assetId: crypto.randomUUID(),
      placement: { zoom: 1, positionX: 0.5, positionY: 0.5 },
    }
    const parsed = collageDocumentSchema.parse(project)
    expect(parsed.pages[0].slots[slotId]?.placement.rotation).toBe(0)
    expect(parsed.pages[0].slots[slotId]?.placement.flipHorizontal).toBe(false)
    expect(parsed.pages[0].slots[slotId]?.placement.flipVertical).toBe(false)
  })

  it('never leaves an edge uncovered and clamps pan', () => {
    const placement = { zoom: 1, positionX: 0.5, positionY: 0.5 }
    const dimensions = resolveCoverPlacement(400, 200, 300, 600, placement)
    expect(dimensions.width).toBeGreaterThanOrEqual(400)
    expect(dimensions.height).toBeGreaterThanOrEqual(200)
    expect(panPlacement(placement, dimensions, 100000, -100000)).toMatchObject({
      positionX: 0.5,
      positionY: 1,
    })
  })

  it('clamps zoom to documented limits', () => {
    const placement = { zoom: 1, positionX: 0.5, positionY: 0.5 }
    const dimensions = resolveCoverPlacement(400, 200, 300, 600, placement)
    expect(zoomPlacement(placement, dimensions, 99).zoom).toBe(8)
  })

  it('preserves the focal point while zooming', () => {
    const placement = { zoom: 1, positionX: 0.5, positionY: 0.2 }
    const dimensions = resolveCoverPlacement(400, 200, 300, 300, placement)
    expect(zoomPlacement(placement, dimensions, 2)).toMatchObject({
      zoom: 2,
      positionX: 0.5,
      positionY: 0.3,
    })
  })
})
