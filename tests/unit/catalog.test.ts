import { describe, expect, it } from 'vitest'
import { layoutCatalog, presetsForFrameCount } from '../../src/lib/layouts/catalog'
import { validatePreset } from '../../src/lib/layouts/validatePreset'

describe('layout catalog', () => {
  it('groups definitions by their derived frame count', () => {
    expect(presetsForFrameCount(3).map((preset) => preset.id)).toEqual(['feature-right', 'feature-top'])
    expect(layoutCatalog).toHaveLength(6)
  })

  it('rejects a declared frame count that does not match leaves', () => {
    expect(() => validatePreset({ id: 'bad', revision: 1, name: 'Bad', frameCount: 2, tags: [], root: { kind: 'leaf', key: 'only' } })).toThrow('declares 2 frames')
  })
})
