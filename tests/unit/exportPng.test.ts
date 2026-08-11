import { describe, expect, it } from 'vitest'
import { exportDimensions, resolveExportRange } from '../../src/lib/render/exportPng'
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
    expect(exportDimensions(createPage(), 1600)).toEqual({ width: 1600, height: 1200 })
    expect(() => exportDimensions(createPage(), 9000)).toThrow('limit')
  })
})
