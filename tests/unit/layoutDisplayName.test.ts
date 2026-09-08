import { describe, expect, it } from 'vitest'
import { layout2Presets } from '../../src/lib/layouts/definitions/2'
import { layout4Presets } from '../../src/lib/layouts/definitions/4'
import { layoutDisplayName } from '../../src/lib/layouts/displayName'

describe('layout display names', () => {
  it('describes layout structure without changing stable preset ids', () => {
    expect(layout2Presets[0].id).toBe('layout-2-001')
    expect(layoutDisplayName(layout2Presets[0])).toBe('Two photos side by side')
    expect(layoutDisplayName(layout2Presets[1])).toBe('Two photos stacked')
    expect(layoutDisplayName(layout4Presets[0])).toBe('Four photos in equal tiles')
    expect(layoutDisplayName(layout4Presets[1])).toBe('Four photos with a large left panel')
  })
})
