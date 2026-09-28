import { describe, expect, it } from 'vitest'
import {
  applyDividerChange,
  dividerChangeForCoordinate,
  findDividerSnapTargets,
} from '../../src/lib/domain/dividerSnapping'
import { resolveDividers, resolveLayout } from '../../src/lib/domain/geometry'
import { createPage } from '../../src/lib/domain/factories'
import { layout3Presets } from '../../src/lib/layouts/definitions/3'
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

  it('offers equal-size snapping even when another frame is selected', () => {
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
    expect(targets.some((target) => target.kind === 'equal-size')).toBe(true)
  })

  it('uses the pair closest to the cursor when several pairs touch a divider', () => {
    const page = asymmetricFourFramePage()
    const divider = resolveDividers(page).find((candidate) => candidate.axis === 'x')
    expect(divider).toBeDefined()
    const selectedSlotId = topLeftSlotId(page)
    const upper = findDividerSnapTargets(
      page,
      divider!,
      selectedSlotId,
      divider!.parentY + 20,
    ).find((target) => target.kind === 'equal-size')
    const lower = findDividerSnapTargets(
      page,
      divider!,
      selectedSlotId,
      divider!.parentY + divider!.parentHeight - 20,
    ).find((target) => target.kind === 'equal-size')
    expect(upper).toBeDefined()
    expect(lower).toBeDefined()
    expect(upper!.sourceSlotId).not.toBe(lower!.sourceSlotId)
    expect(upper!.targetSlotId).not.toBe(lower!.targetSlotId)
  })

  it.each(['x', 'y'] as const)(
    'equalizes only the two frames beside either %s divider in a three-frame split',
    (axis) => {
      const preset = layout3Presets.find(
        (candidate) =>
          candidate.root.kind === 'split' &&
          candidate.root.axis === axis &&
          candidate.root.children.length === 3 &&
          candidate.root.children.every((child) => child.kind === 'leaf'),
      )
      if (!preset) throw new Error('Three-frame split unavailable')
      const page = createPage('Three frames', preset)
      if (page.layout.root.kind !== 'split') throw new Error('Split expected')
      page.layout.root.weights = [0.2, 0.3, 0.5]
      const size = (frame: ReturnType<typeof resolveLayout>[number]) =>
        axis === 'x' ? frame.width : frame.height
      const ordered = (frames: ReturnType<typeof resolveLayout>) =>
        frames.sort((left, right) => (axis === 'x' ? left.x - right.x : left.y - right.y))
      const before = ordered(resolveLayout(page))

      for (const divider of resolveDividers(page)) {
        const target = findDividerSnapTargets(
          page,
          divider,
          null,
          axis === 'x' ? divider.parentY + 20 : divider.parentX + 20,
        ).find((candidate) => candidate.kind === 'equal-size')
        expect(target).toBeDefined()
        const after = ordered(
          resolveLayout(
            applyDividerChange(page, dividerChangeForCoordinate(page, divider, target!.coordinate)),
          ),
        )
        expect(size(after[divider.index])).toBeCloseTo(size(after[divider.index + 1]), 6)
        const untouchedIndex = divider.index === 0 ? 2 : 0
        expect(size(after[untouchedIndex])).toBeCloseTo(size(before[untouchedIndex]), 6)
      }
    },
  )

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
