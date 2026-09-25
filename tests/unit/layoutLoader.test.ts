import { describe, expect, it } from 'vitest'
import {
  layoutFrameCounts,
  layoutGroupForFrameCount,
  loadLayouts,
} from '../../src/lib/layouts/loader'

describe('layout loader groups', () => {
  it('exposes individual counts through 10 and one 11+ group', () => {
    expect(layoutFrameCounts).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(layoutGroupForFrameCount(10)).toBe(10)
    expect(layoutGroupForFrameCount(11)).toBe(11)
    expect(layoutGroupForFrameCount(16)).toBe(11)
  })

  it('loads every supported high-count preset in the 11+ group', async () => {
    const presets = await loadLayouts(11)
    expect(presets).toHaveLength(23)
    expect(new Set(presets.map((preset) => preset.frameCount))).toEqual(
      new Set([11, 12, 13, 14, 15, 16]),
    )
    expect(loadLayouts(16)).toBe(loadLayouts(11))
  })
})
