import { describe, expect, it } from 'vitest'
import {
  applyDividerChange,
  dividerChangeForCoordinate,
  findDividerSnapTargets,
} from '../../src/lib/domain/dividerSnapping'
import { resolveDividers, resolveLayout } from '../../src/lib/domain/geometry'
import { createPage } from '../../src/lib/domain/factories'
import { layout4Presets } from '../../src/lib/layouts/definitions/4'

function asymmetricFourFramePage() {
  const preset = layout4Presets.find((candidate) => candidate.id === 'layout-4-013')
  if (!preset) throw new Error('Layout 13 is unavailable')
  return createPage('Snap targets', preset)
}

function topLeftSlotId(page: ReturnType<typeof asymmetricFourFramePage>) {
  return resolveLayout(page).sort((left, right) => left.y - right.y || left.x - right.x)[0].slotId
}

describe('divider snapping', () => {
  it('aligns a selected frame edge with the nearby frame edge in the next column', () => {
    const page = asymmetricFourFramePage()
    const divider = resolveDividers(page).find(
      (candidate) => candidate.axis === 'y' && candidate.path.join('.') === '0',
    )
    expect(divider).toBeDefined()
    const target = findDividerSnapTargets(
      page,
      divider!,
      topLeftSlotId(page),
      divider!.parentX + 20,
    ).find((candidate) => candidate.kind === 'edge' && candidate.targetEdge === 'max')
    expect(target).toBeDefined()

    const next = applyDividerChange(
      page,
      dividerChangeForCoordinate(page, divider!, target!.coordinate),
    )
    const frames = resolveLayout(next)
    const selected = frames.find((frame) => frame.slotId === target!.sourceSlotId)
    const adjacent = frames.find((frame) => frame.slotId === target!.targetSlotId)
    expect(selected).toBeDefined()
    expect(adjacent).toBeDefined()
    expect(selected!.y + selected!.height).toBeCloseTo(adjacent!.y + adjacent!.height, 6)
  })

  it('provides a midpoint target that makes the selected frame and its neighbor equal', () => {
    const page = asymmetricFourFramePage()
    const divider = resolveDividers(page).find(
      (candidate) => candidate.axis === 'y' && candidate.path.join('.') === '0',
    )
    expect(divider).toBeDefined()
    const target = findDividerSnapTargets(
      page,
      divider!,
      topLeftSlotId(page),
      divider!.parentX + 20,
    ).find((candidate) => candidate.kind === 'equal-size')
    expect(target).toBeDefined()

    const next = applyDividerChange(
      page,
      dividerChangeForCoordinate(page, divider!, target!.coordinate),
    )
    const leftColumn = resolveLayout(next).filter((frame) => frame.x < next.width / 2)
    expect(leftColumn).toHaveLength(2)
    expect(leftColumn[0].height).toBeCloseTo(leftColumn[1].height, 6)
  })

  it('changes only the active split weights', () => {
    const page = asymmetricFourFramePage()
    const divider = resolveDividers(page).find(
      (candidate) => candidate.axis === 'y' && candidate.path.join('.') === '0',
    )
    expect(divider).toBeDefined()
    const next = applyDividerChange(
      page,
      dividerChangeForCoordinate(page, divider!, divider!.parentY + divider!.parentHeight * 0.5),
    )
    expect(next.layout.root).toMatchObject({
      kind: 'split',
      weights: page.layout.root.kind === 'split' ? page.layout.root.weights : [],
    })
    if (next.layout.root.kind !== 'split' || page.layout.root.kind !== 'split')
      throw new Error('Split expected')
    expect(next.layout.root.children[1]).toEqual(page.layout.root.children[1])
  })
})
