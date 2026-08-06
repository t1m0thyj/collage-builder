import { describe, expect, it } from 'vitest'
import { createPage } from '../../src/lib/domain/factories'
import { resolveLayout } from '../../src/lib/domain/geometry'
import { panPlacement, resolveCoverPlacement, zoomPlacement } from '../../src/lib/domain/crop'

describe('split-tree layout resolution', () => {
  it('tiles the padded area with uniform gaps', () => {
    const page = createPage('Page', 'grid-2x2')
    const frames = resolveLayout(page)
    expect(frames).toHaveLength(4)
    expect(frames.map(({ x, y, width, height }) => [x, y, width, height])).toEqual([[30, 30, 755, 555], [815, 30, 755, 555], [30, 615, 755, 555], [815, 615, 755, 555]])
  })

  it('rejects padding and gap combinations with no usable frame area', () => {
    const page = createPage()
    page.style.padding = 800
    expect(() => resolveLayout(page)).toThrow('Page padding')
  })
})

describe('cover crop placement', () => {
  it('never leaves an edge uncovered and clamps pan', () => {
    const placement = { zoom: 1, positionX: 0.5, positionY: 0.5 }
    const dimensions = resolveCoverPlacement(400, 200, 300, 600, placement)
    expect(dimensions.width).toBeGreaterThanOrEqual(400)
    expect(dimensions.height).toBeGreaterThanOrEqual(200)
    expect(panPlacement(placement, dimensions, 100000, -100000)).toMatchObject({ positionX: 0.5, positionY: 1 })
  })

  it('clamps zoom to documented limits', () => {
    const placement = { zoom: 1, positionX: 0.5, positionY: 0.5 }
    const dimensions = resolveCoverPlacement(400, 200, 300, 600, placement)
    expect(zoomPlacement(placement, dimensions, 99).zoom).toBe(8)
  })

  it('preserves the focal point while zooming', () => {
    const placement = { zoom: 1, positionX: 0.5, positionY: 0.2 }
    const dimensions = resolveCoverPlacement(400, 200, 300, 300, placement)
    expect(zoomPlacement(placement, dimensions, 2)).toMatchObject({ zoom: 2, positionX: 0.5, positionY: 0.3 })
  })
})
