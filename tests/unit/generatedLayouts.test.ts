import { describe, expect, it } from 'vitest'
import type { LayoutPresetNode } from '../../src/lib/domain/types'
import { layoutCatalog } from '../../src/lib/layouts/catalog'
import { curatedCollagePresets } from '../../src/lib/layouts/curatedCatalog'
import { previewFrames } from '../../src/lib/layouts/preview'
import { validatePreset } from '../../src/lib/layouts/validatePreset'
import { generateLayoutDefinitions } from '../../scripts/generate-layout-presets'

function geometrySignature(
  slots: readonly { x: number; y: number; width: number; height: number }[],
): string {
  return slots
    .map(({ x, y, width, height }) =>
      [x, y, width, height].map((value) => value.toFixed(7)).join(','),
    )
    .sort()
    .join('|')
}

function containsGrid(node: LayoutPresetNode): boolean {
  if (node.kind === 'grid') return true
  return node.kind === 'split' && node.children.some(containsGrid)
}

describe('generated runtime layouts', () => {
  it('reproduces the checked-in definitions from procedural generation', () => {
    expect(generateLayoutDefinitions()).toEqual(layoutCatalog)
  })

  it('matches every procedurally curated source geometry', () => {
    expect(layoutCatalog).toHaveLength(curatedCollagePresets.length)
    layoutCatalog.forEach((preset, index) => {
      validatePreset(preset)
      expect(preset.id).toMatch(/^generated-\d+-t[0-9a-f]{16}$/)
      expect(preset.id).toBe(curatedCollagePresets[index].id)
      expect(geometrySignature(previewFrames(preset, 1, 1))).toBe(
        geometrySignature(curatedCollagePresets[index].slots),
      )
    })
  })

  it('uses editable split trees for every preset', () => {
    expect(layoutCatalog.some((preset) => containsGrid(preset.root))).toBe(false)
  })
})
