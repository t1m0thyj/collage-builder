import { describe, expect, it } from 'vitest'
import { layoutCatalog, presetsForFrameCount } from '../../src/lib/layouts/catalog'
import { previewFrames } from '../../src/lib/layouts/preview'
import { validatePreset } from '../../src/lib/layouts/validatePreset'
import { CURATED_LAYOUT_TOTAL } from '../../src/lib/layouts/curatedCatalog'

describe('layout catalog', () => {
  it('groups definitions by their derived frame count', () => {
    expect(presetsForFrameCount(3)).toHaveLength(6)
    expect(layoutCatalog).toHaveLength(CURATED_LAYOUT_TOTAL)
  })

  it('offers a balanced two-over-three grid first for five photos', () => {
    const fivePhotoLayouts = presetsForFrameCount(5)
    const frames = previewFrames(fivePhotoLayouts[0], 600, 600)
    const sizes = (y: number) =>
      frames
        .filter((frame) => Math.abs(frame.y - y) < 0.001)
        .map((frame) => [Math.round(frame.width), Math.round(frame.height)])
    expect(sizes(0)).toEqual([
      [300, 300],
      [300, 300],
    ])
    expect(sizes(300)).toEqual([
      [200, 300],
      [200, 300],
      [200, 300],
    ])
    expect(
      fivePhotoLayouts.some(
        (preset) => previewFrames(preset, 600, 600).filter((frame) => frame.y === 0).length === 3,
      ),
    ).toBe(true)
  })

  it('rejects a declared frame count that does not match leaves', () => {
    expect(() =>
      validatePreset({
        id: 'bad',
        revision: 1,
        name: 'Bad',
        frameCount: 2,
        tags: [],
        root: { kind: 'leaf', key: 'only' },
      }),
    ).toThrow('declares 2 frames')
  })
})
