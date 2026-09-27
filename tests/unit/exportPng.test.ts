import { describe, expect, it } from 'vitest'
import { exportDimensions, jpegQuality, resolveExportRange } from '../../src/lib/render/exportPng'
import { countUpscaledPlacements } from '../../src/lib/render/exportQuality'
import { createProject } from '../../src/lib/domain/factories'
import { createPage } from '../../src/lib/domain/factories'
describe('export ranges', () => {
  it('resolves current, all, and inclusive ranges', () => {
    expect(resolveExportRange('current', 1, 4)).toEqual([1])
    expect(resolveExportRange('all', 0, 3)).toEqual([0, 1, 2])
    expect(resolveExportRange('range', 0, 4, '1-3')).toEqual([0, 1, 2])
  })
  it('rejects invalid ranges', () =>
    expect(() => resolveExportRange('range', 0, 3, '4-5')).toThrow())
})
describe('export dimensions', () => {
  it('preserves page aspect ratio and rejects unsafe canvases', () => {
    expect(exportDimensions(createPage(), 3840)).toEqual({ width: 3840, height: 2880 })
    const portrait = createPage()
    portrait.width = 3000
    portrait.height = 4000
    expect(exportDimensions(portrait, 3840)).toEqual({ width: 2880, height: 3840 })
    expect(() => exportDimensions(createPage(), 9000)).toThrow('limit')
  })

  it('normalizes user-facing JPEG quality and rejects invalid values', () => {
    expect(jpegQuality(1)).toBe(0.01)
    expect(jpegQuality(85)).toBe(0.85)
    expect(jpegQuality(100)).toBe(1)
    expect(() => jpegQuality(0)).toThrow('between 1 and 100')
    expect(() => jpegQuality(Number.NaN)).toThrow('between 1 and 100')
  })

  it('warns when a placed original must be enlarged', () => {
    const document = createProject()
    const page = document.pages[0]
    const assetId = '11111111-1111-4111-8111-111111111111'
    document.assets[assetId] = {
      id: assetId,
      originalName: 'small.png',
      mediaType: 'image/png',
      byteLength: 1,
      width: 100,
      height: 100,
      sha256: 'a'.repeat(64),
      storage: { kind: 'embedded', archivePath: `assets/${assetId}` },
    }
    page.slots[Object.keys(page.slots)[0]] = {
      assetId,
      placement: { zoom: 1, positionX: 0.5, positionY: 0.5 },
    }
    expect(countUpscaledPlacements(page, document.assets, 3840)).toBe(1)
    expect(countUpscaledPlacements(page, document.assets, 64)).toBe(0)
    page.width = 3000
    page.height = 4000
    expect(countUpscaledPlacements(page, document.assets, 64)).toBe(0)
  })

  it('compares rotated images against their oriented dimensions', () => {
    const document = createProject()
    const page = document.pages[0]
    page.width = 200
    page.height = 400
    const assetId = '11111111-1111-4111-8111-111111111111'
    document.assets[assetId] = {
      id: assetId,
      originalName: 'landscape.png',
      mediaType: 'image/png',
      byteLength: 1,
      width: 400,
      height: 200,
      sha256: 'a'.repeat(64),
      storage: { kind: 'embedded', archivePath: `assets/${assetId}` },
    }
    page.slots[Object.keys(page.slots)[0]] = {
      assetId,
      placement: { zoom: 1, positionX: 0.5, positionY: 0.5, rotation: 90 },
    }
    expect(countUpscaledPlacements(page, document.assets, 400)).toBe(0)
  })
})
