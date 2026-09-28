import { describe, expect, it } from 'vitest'
import { suggestBackgroundFromSamples } from '../../src/lib/app/backgroundSuggestion'

const red = [255, 0, 0] as const
const blue = [0, 0, 255] as const
const black = [0, 0, 0] as const
const white = [255, 255, 255] as const

describe('background suggestion', () => {
  it('uses every image equally regardless of its sample count', () => {
    const balanced = suggestBackgroundFromSamples([[red], [blue]])
    const manyRedSamples = suggestBackgroundFromSamples([
      Array.from({ length: 100 }, () => red),
      [blue],
    ])
    expect(manyRedSamples).toBe(balanced)
    expect(balanced).toMatch(/^#[0-9A-F]{6}$/)
    expect(balanced).not.toBe(suggestBackgroundFromSamples([[red]]))
    expect(balanced).not.toBe(suggestBackgroundFromSamples([[blue]]))
  })

  it('chooses a muted middle tone for monochrome photos', () => {
    const color = suggestBackgroundFromSamples([[black], [white]])!
    const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16))
    expect(Math.max(...channels) - Math.min(...channels)).toBeLessThan(40)
    expect(Math.min(...channels)).toBeGreaterThan(50)
    expect(Math.max(...channels)).toBeLessThan(205)
  })

  it('does not suggest a color without usable image samples', () => {
    expect(suggestBackgroundFromSamples([])).toBeNull()
    expect(suggestBackgroundFromSamples([[], []])).toBeNull()
  })
})
