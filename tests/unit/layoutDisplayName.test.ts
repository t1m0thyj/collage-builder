import { describe, expect, it } from 'vitest'
import { layoutCatalog } from '../../src/lib/layouts/catalog'
import { layout2Presets } from '../../src/lib/layouts/definitions/2'
import { layout4Presets } from '../../src/lib/layouts/definitions/4'
import { layoutShapeSummary } from '../../src/lib/layouts/displayName'

describe('layout shape summaries', () => {
  it('summarizes visible frame shapes without changing stable preset ids', () => {
    expect(layout2Presets[0].id).toBe('layout-2-001')
    expect(layoutShapeSummary(layout2Presets[0])).toBe('2 portraits')
    expect(layoutShapeSummary(layout2Presets[1])).toBe('2 landscapes')
    expect(layoutShapeSummary(layout4Presets[0])).toBe('4 squares')
  })

  it('orders mixed frame shapes as portrait, landscape, then square', () => {
    expect(layoutShapeSummary(layout4Presets[1])).toBe('1 portrait, 3 squares')
  })

  it('summarizes every shipped preset', () => {
    const summaries = layoutCatalog.map(layoutShapeSummary)

    expect(summaries).toHaveLength(layoutCatalog.length)
    expect(summaries.every(Boolean)).toBe(true)
  })
})
