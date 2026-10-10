import { describe, expect, it } from 'vitest'
import {
  editorSurface,
  maxEditorCanvasDimension,
  maxEditorCanvasPixels,
  prepareEditorResize,
} from '../../src/lib/render/editorSurface'

describe('editor backing surface budget', () => {
  it('keeps intermediate allocations within budget when changing orientation', () => {
    let width = 2000
    let height = 8000
    const allocations: number[] = []
    const stage = {
      width: () => width,
      height: () => height,
      size: (next: { width: number; height: number }) => {
        width = next.width
        allocations.push(width * height)
        height = next.height
        allocations.push(width * height)
      },
    }
    prepareEditorResize(stage, { width: 8000, height: 2000 })
    stage.size({ width: 8000, height: 2000 })
    prepareEditorResize(stage, { width: 2000, height: 8000 })
    stage.size({ width: 2000, height: 8000 })
    expect(Math.max(...allocations)).toBeLessThanOrEqual(maxEditorCanvasPixels)
    expect({ width, height }).toEqual({ width: 2000, height: 8000 })
  })
  for (const pixelRatio of [1, 2, 3]) {
    it(`bounds large pages, extreme aspect ratios, zooms and viewports at DPR ${pixelRatio}`, () => {
      for (const page of [
        { width: 8000, height: 8000 },
        { width: 16_384, height: 64 },
        { width: 64, height: 16_384 },
        { width: 3840, height: 2880 },
      ]) {
        for (const viewport of [
          { width: 600, height: 500 },
          { width: 20_000, height: 20_000 },
        ]) {
          for (const zoom of [0.1, 0.25, 1, 2]) {
            const surface = editorSurface(page, viewport, zoom, pixelRatio)
            expect(surface.width * surface.height * pixelRatio ** 2).toBeLessThanOrEqual(
              maxEditorCanvasPixels,
            )
            expect(surface.width * pixelRatio).toBeLessThanOrEqual(maxEditorCanvasDimension)
            expect(surface.height * pixelRatio).toBeLessThanOrEqual(maxEditorCanvasDimension)
            expect(surface.zoom).toBeGreaterThan(0)
            expect(surface.zoom).toBeLessThanOrEqual(zoom)
            expect(surface.width).toBeGreaterThanOrEqual(Math.ceil(page.width * surface.zoom + 48))
            expect(surface.height).toBeGreaterThanOrEqual(
              Math.ceil(page.height * surface.zoom + 48),
            )
          }
        }
      }
    })
  }
  it('preserves safe zoom and viewport dimensions', () => {
    expect(
      editorSurface({ width: 3840, height: 2880 }, { width: 600, height: 500 }, 0.1, 3),
    ).toEqual({ width: 600, height: 500, zoom: 0.1, limited: false })
  })
  it('also bounds hit canvases when the scene ratio is below one', () => {
    const surface = editorSurface(
      { width: 8000, height: 8000 },
      { width: 600, height: 500 },
      2,
      0.5,
    )
    expect(surface.width * surface.height).toBeLessThanOrEqual(maxEditorCanvasPixels)
  })
})
