import { describe, expect, it } from 'vitest'
import { layoutCatalog } from '../../src/lib/layouts/catalog'
import { layout2Presets } from '../../src/lib/layouts/definitions/2'
import { layout4Presets } from '../../src/lib/layouts/definitions/4'
import { layoutShapeSummary } from '../../src/lib/layouts/displayName'

describe('layout shape summaries', () => {
  it('summarizes visible frame shapes without changing stable preset ids', () => {
    expect(layout2Presets[0].id).toBe('generated-2-t44b67f0379bd3d39')
    expect(layoutShapeSummary(layout2Presets[0])).toBe('2 landscapes')
    expect(layoutShapeSummary(layout2Presets[1])).toBe('2 portraits')
    expect(layoutShapeSummary(layout4Presets[0])).toBe('4 squares')
  })

  it('orders mixed frame shapes as portrait, landscape, then square', () => {
    const mosaic = layout4Presets.find((preset) => preset.id === 'generated-4-t059320da1280c0bb')
    expect(mosaic).toBeDefined()
    expect(layoutShapeSummary(mosaic!)).toBe('2 portraits, 2 landscapes')
  })

  it('summarizes every shipped preset', () => {
    const summaries = layoutCatalog.map(layoutShapeSummary)

    expect(summaries).toHaveLength(layoutCatalog.length)
    expect(summaries.every(Boolean)).toBe(true)
  })
})
