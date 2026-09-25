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
  const preset = layout4Presets.find(
    (candidate) =>
      candidate.root.kind === 'split' &&
      candidate.root.axis === 'x' &&
      candidate.root.children[0]?.kind === 'split' &&
      candidate.root.children[0].axis === 'y' &&
      candidate.root.children[1]?.kind === 'split' &&
      candidate.root.children[1].axis === 'y' &&
      candidate.root.children[0].weights[0] !== candidate.root.children[1].weights[0],
  )
  if (!preset) throw new Error('An asymmetric split layout is unavailable')
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
    const frames = resolveLayout(next)
    const leftX = Math.min(...frames.map((frame) => frame.x))
    const leftColumn = frames.filter((frame) => Math.abs(frame.x - leftX) < 0.001)
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

  it('only offers equal-size snapping when the selected frame touches the active divider', () => {
    const page = asymmetricFourFramePage()
    const divider = resolveDividers(page).find(
      (candidate) => candidate.axis === 'y' && candidate.path.join('.') === '0',
    )
    expect(divider).toBeDefined()
    const frames = resolveLayout(page)
    const topY = Math.min(...frames.map((frame) => frame.y))
    const unrelatedSlotId = frames
      .filter((frame) => Math.abs(frame.y - topY) < 0.001)
      .sort((left, right) => right.x - left.x)[0]?.slotId
    expect(unrelatedSlotId).toBeDefined()

    const targets = findDividerSnapTargets(page, divider!, unrelatedSlotId!, divider!.parentX + 20)
    expect(targets.some((target) => target.kind === 'equal-size')).toBe(false)
  })

  it('only returns targets that the constrained divider can actually satisfy', () => {
    const page = asymmetricFourFramePage()
    const selectedSlotId = topLeftSlotId(page)
    const divider = resolveDividers(page).find(
      (candidate) => candidate.axis === 'y' && candidate.path.join('.') === '0',
    )
    expect(divider).toBeDefined()
    const targets = findDividerSnapTargets(page, divider!, selectedSlotId, divider!.parentX + 20)
    expect(targets.length).toBeGreaterThan(0)

    for (const target of targets) {
      const next = applyDividerChange(
        page,
        dividerChangeForCoordinate(page, divider!, target.coordinate),
      )
      const frames = resolveLayout(next)
      const source = frames.find((frame) => frame.slotId === target.sourceSlotId)!
      const adjacent = frames.find((frame) => frame.slotId === target.targetSlotId)!
      if (target.kind === 'equal-size') {
        expect(source.height).toBeCloseTo(adjacent.height, 6)
      } else {
        const sourceEdge = target.sourceEdge === 'min' ? source.y : source.y + source.height
        const targetEdge = target.targetEdge === 'min' ? adjacent.y : adjacent.y + adjacent.height
        expect(sourceEdge).toBeCloseTo(targetEdge, 6)
      }
    }
  })
})
