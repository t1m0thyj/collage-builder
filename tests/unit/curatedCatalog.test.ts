import { describe, expect, it } from 'vitest'
import {
  CURATED_LAYOUT_TOTAL,
  LAYOUT_FAMILIES,
  SUPPORTED_PHOTO_COUNTS,
  curatedCollagePresets,
  generateCuratedCatalog,
  generateCuratedPresets,
  layoutSimilarityThreshold,
  minimumLayoutSlotArea,
  stableLayoutId,
  topologySignature,
  type CollageSlot,
} from '../../src/lib/layouts/curatedCatalog'

function overlapArea(left: CollageSlot, right: CollageSlot): number {
  return (
    Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)) *
    Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  )
}

function regularGridDimensions(slots: readonly CollageSlot[]): string | undefined {
  const xCoordinates = new Set(slots.map((slot) => slot.x.toFixed(7)))
  const yCoordinates = new Set(slots.map((slot) => slot.y.toFixed(7)))
  const columns = xCoordinates.size
  const rows = yCoordinates.size
  if (rows < 2 || columns < 2 || rows * columns !== slots.length) return undefined
  if (
    slots.some(
      (slot) =>
        Math.abs(slot.width - 1 / columns) > 1e-8 || Math.abs(slot.height - 1 / rows) > 1e-8,
    )
  )
    return undefined
  return `${rows}x${columns}`
}

describe('curated collage catalog', () => {
  it('generates a naturally sized deterministic catalog', () => {
    expect(curatedCollagePresets).toHaveLength(CURATED_LAYOUT_TOTAL)
    expect(CURATED_LAYOUT_TOTAL).toBeGreaterThanOrEqual(200)
    expect(CURATED_LAYOUT_TOTAL).toBeLessThanOrEqual(250)
    expect(new Set(curatedCollagePresets.map((preset) => preset.id)).size).toBe(
      CURATED_LAYOUT_TOTAL,
    )
    for (const photoCount of SUPPORTED_PHOTO_COUNTS) {
      const presets = generateCuratedPresets(photoCount)
      expect(presets.length).toBeGreaterThan(0)
      expect(presets.every((preset) => preset.photoCount === photoCount)).toBe(true)
    }
    expect(generateCuratedCatalog()).toEqual(curatedCollagePresets)
  })

  it('only offers horizontal and vertical splits for two photos', () => {
    const presets = generateCuratedPresets(2)
    expect(presets).toHaveLength(2)
    expect(new Set(presets.map((preset) => preset.family))).toEqual(new Set(['rows', 'columns']))
  })

  it('includes all six canonical three-photo orientations', () => {
    expect(generateCuratedPresets(3)).toHaveLength(6)
  })

  it('includes every useful regular grid for composite photo counts', () => {
    for (const photoCount of SUPPORTED_PHOTO_COUNTS) {
      const expected = new Set<string>()
      for (let rows = 2; rows <= photoCount / 2; rows += 1)
        if (photoCount % rows === 0) expected.add(`${rows}x${photoCount / rows}`)
      if (expected.size === 0) continue
      const actual = new Set(
        generateCuratedPresets(photoCount).flatMap((preset) => {
          const dimensions = regularGridDimensions(preset.slots)
          return dimensions ? [dimensions] : []
        }),
      )
      expect(actual).toEqual(expected)
    }
  })

  it('offers top, bottom, and center hero choices for 12 and 13 photos', () => {
    for (const photoCount of [12, 13]) {
      const positions = new Set(
        generateCuratedPresets(photoCount).flatMap((preset) => {
          if (preset.family === 'center-hero') return ['center']
          if (preset.family !== 'hero' || preset.featuredSlots?.length !== 1) return []
          const slot = preset.slots[preset.featuredSlots[0]]
          if (Math.abs(slot.width - 1) > 1e-8) return []
          return [slot.y < 1e-8 ? 'top' : 'bottom']
        }),
      )
      expect(positions).toEqual(new Set(['top', 'bottom', 'center']))
    }
  })

  it('keeps strong low-count variety while rejecting cramped 8–10 photo layouts', () => {
    expect(generateCuratedPresets(4).length).toBeGreaterThanOrEqual(20)
    expect(generateCuratedPresets(5).length).toBeGreaterThanOrEqual(25)
    expect(generateCuratedPresets(6).length).toBeGreaterThanOrEqual(25)
    for (const photoCount of [8, 9, 10])
      for (const preset of generateCuratedPresets(photoCount)) {
        const smallestArea = Math.min(...preset.slots.map((slot) => slot.width * slot.height))
        expect(smallestArea).toBeGreaterThanOrEqual(minimumLayoutSlotArea(photoCount))
      }
  })

  it('scales similarity and minimum-area thresholds down as photo count increases', () => {
    for (let photoCount = 2; photoCount < 16; photoCount += 1) {
      expect(layoutSimilarityThreshold(photoCount + 1)).toBeLessThan(
        layoutSimilarityThreshold(photoCount),
      )
      expect(minimumLayoutSlotArea(photoCount + 1)).toBeLessThan(minimumLayoutSlotArea(photoCount))
    }
  })

  it('produces complete, bounded, non-overlapping rectangular tilings', () => {
    for (const preset of curatedCollagePresets) {
      expect(preset.slots).toHaveLength(preset.photoCount)
      expect(preset.slots.reduce((area, slot) => area + slot.width * slot.height, 0)).toBeCloseTo(
        1,
        10,
      )
      for (const slot of preset.slots) {
        expect(slot.x).toBeGreaterThanOrEqual(0)
        expect(slot.y).toBeGreaterThanOrEqual(0)
        expect(slot.x + slot.width).toBeLessThanOrEqual(1 + 1e-8)
        expect(slot.y + slot.height).toBeLessThanOrEqual(1 + 1e-8)
        expect(Math.min(slot.width, slot.height)).toBeGreaterThanOrEqual(0.074)
      }
      for (let left = 0; left < preset.slots.length; left += 1)
        for (let right = left + 1; right < preset.slots.length; right += 1)
          expect(overlapArea(preset.slots[left], preset.slots[right])).toBeLessThan(1e-8)
    }
  })

  it('does not emit layouts that differ only by divider positions', () => {
    for (const photoCount of SUPPORTED_PHOTO_COUNTS) {
      const presets = generateCuratedPresets(photoCount)
      expect(new Set(presets.map((preset) => topologySignature(preset.slots))).size).toBe(
        presets.length,
      )
    }
  })

  it('keeps IDs stable when slot order and divider proportions change', () => {
    const rows = generateCuratedPresets(2)[0]
    const shiftedRows = [
      { x: 0, y: 0, width: 1, height: 0.4 },
      { x: 0, y: 0.4, width: 1, height: 0.6 },
    ]
    expect(stableLayoutId(2, [...rows.slots].reverse())).toBe(rows.id)
    expect(stableLayoutId(2, shiftedRows)).toBe(rows.id)
    expect(generateCuratedPresets(2)[1].id).not.toBe(rows.id)
  })

  it('puts familiar layouts and featured choices before secondary variants and strips', () => {
    for (const photoCount of [4, 5, 6, 7, 8, 9, 10]) {
      const presets = generateCuratedPresets(photoCount)
      expect(presets[0].family).toBe('grid')
      expect(presets[1].family).toBe('hero')
      const firstStrip = presets.findIndex(
        (preset) => preset.family === 'rows' || preset.family === 'columns',
      )
      if (firstStrip >= 0) expect(firstStrip).toBeGreaterThanOrEqual(presets.length - 2)
    }
    expect(regularGridDimensions(generateCuratedPresets(4)[0].slots)).toBe('2x2')
    expect(regularGridDimensions(generateCuratedPresets(16)[0].slots)).toBe('4x4')
  })

  it('uses every family where the photo count can express it without letting one dominate', () => {
    const highCountPresets = curatedCollagePresets.filter((preset) => preset.photoCount >= 5)
    for (const family of LAYOUT_FAMILIES) {
      if (family === 'rows' || family === 'columns') continue
      expect(highCountPresets.some((preset) => preset.family === family)).toBe(true)
    }
    for (const photoCount of [5, 6, 7, 8, 9, 10]) {
      const presets = generateCuratedPresets(photoCount)
      const counts = new Map<string, number>()
      presets.forEach((preset) => counts.set(preset.family, (counts.get(preset.family) ?? 0) + 1))
      expect(Math.max(...counts.values()) / presets.length).toBeLessThan(0.5)
    }
  })

  it('makes featured photographs meaningfully larger and centers center heroes', () => {
    const featuredFamilies = new Set(['hero', 'center-hero', 'frame', 'magazine', 'feature-strip'])
    for (const preset of curatedCollagePresets) {
      if (!featuredFamilies.has(preset.family)) continue
      expect(preset.featuredSlots?.length).toBeGreaterThan(0)
      const averageArea = 1 / preset.photoCount
      const largestFeaturedArea = Math.max(
        ...(preset.featuredSlots ?? []).map((index) => {
          const slot = preset.slots[index]
          return slot.width * slot.height
        }),
      )
      expect(largestFeaturedArea).toBeGreaterThanOrEqual(averageArea * 1.15)
      if (preset.family === 'center-hero') {
        const slot = preset.slots[preset.featuredSlots?.[0] ?? -1]
        expect(slot.x).toBeLessThan(0.5)
        expect(slot.x + slot.width).toBeGreaterThan(0.5)
        expect(slot.y).toBeLessThan(0.5)
        expect(slot.y + slot.height).toBeGreaterThan(0.5)
      }
    }
  })

  it('rejects unsupported photo counts', () => {
    expect(() => generateCuratedPresets(1)).toThrow('2 through 16')
    expect(() => generateCuratedPresets(17)).toThrow('2 through 16')
  })

  it('keeps the combined 11+ group useful but compact', () => {
    const highCountPresets = curatedCollagePresets.filter((preset) => preset.photoCount >= 11)
    expect(highCountPresets.length).toBeLessThanOrEqual(25)
    expect(new Set(highCountPresets.map((preset) => preset.photoCount))).toEqual(
      new Set([11, 12, 13, 14, 15, 16]),
    )
  })
})
