import { resolveLayout, type ResolvedDivider } from './geometry'
import type { PageV1, ResolvedFrame, SlotId } from './types'

export interface DividerChange {
  path: number[]
  index: number
  position: number
}

export type DividerSnapKind = 'edge' | 'equal-size'
export type FrameEdge = 'min' | 'max'

export interface DividerSnapTarget {
  id: string
  kind: DividerSnapKind
  coordinate: number
  sourceSlotId: SlotId
  targetSlotId: SlotId
  sourceEdge: FrameEdge
  targetEdge: FrameEdge
  label: string
}

export function dividerKey(divider: Pick<ResolvedDivider, 'path' | 'index'>): string {
  return `${divider.path.join('.')}-${divider.index}`
}

export function dividerCenter(divider: ResolvedDivider): number {
  return divider.axis === 'x' ? divider.x + divider.width / 2 : divider.y + divider.height / 2
}

function frameMin(frame: ResolvedFrame, axis: ResolvedDivider['axis']): number {
  return axis === 'x' ? frame.x : frame.y
}

function frameMax(frame: ResolvedFrame, axis: ResolvedDivider['axis']): number {
  return axis === 'x' ? frame.x + frame.width : frame.y + frame.height
}

function perpendicularMin(frame: ResolvedFrame, axis: ResolvedDivider['axis']): number {
  return axis === 'x' ? frame.y : frame.x
}

function perpendicularMax(frame: ResolvedFrame, axis: ResolvedDivider['axis']): number {
  return axis === 'x' ? frame.y + frame.height : frame.x + frame.width
}

function intervalDistance(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
) {
  if (firstEnd < secondStart) return secondStart - firstEnd
  if (secondEnd < firstStart) return firstStart - secondEnd
  return 0
}

function overlaps(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
  return Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart) > 0.001
}

function frameAtDividerSide(
  frames: ResolvedFrame[],
  divider: ResolvedDivider,
  gap: number,
  side: FrameEdge,
  pointerPerpendicularCoordinate: number,
): ResolvedFrame | undefined {
  const center = dividerCenter(divider)
  const expectedEdge = center + (side === 'min' ? gap / 2 : -gap / 2)
  return frames
    .filter(
      (frame) =>
        Math.abs(
          (side === 'min' ? frameMin(frame, divider.axis) : frameMax(frame, divider.axis)) -
            expectedEdge,
        ) < 1 &&
        pointerPerpendicularCoordinate >= perpendicularMin(frame, divider.axis) &&
        pointerPerpendicularCoordinate <= perpendicularMax(frame, divider.axis),
    )
    .sort(
      (left, right) =>
        Math.abs(
          (perpendicularMin(left, divider.axis) + perpendicularMax(left, divider.axis)) / 2 -
            pointerPerpendicularCoordinate,
        ) -
        Math.abs(
          (perpendicularMin(right, divider.axis) + perpendicularMax(right, divider.axis)) / 2 -
            pointerPerpendicularCoordinate,
        ),
    )[0]
}

function sourceAtDivider(
  frames: ResolvedFrame[],
  divider: ResolvedDivider,
  gap: number,
  selectedSlotId: SlotId | null,
  pointerPerpendicularCoordinate: number,
): { frame: ResolvedFrame; edge: FrameEdge } | undefined {
  const selected = selectedSlotId
    ? frames.find((frame) => frame.slotId === selectedSlotId)
    : undefined
  const center = dividerCenter(divider)
  if (selected) {
    if (Math.abs(frameMax(selected, divider.axis) - (center - gap / 2)) < 1)
      return { frame: selected, edge: 'max' }
    if (Math.abs(frameMin(selected, divider.axis) - (center + gap / 2)) < 1)
      return { frame: selected, edge: 'min' }
  }
  const leading = frameAtDividerSide(frames, divider, gap, 'max', pointerPerpendicularCoordinate)
  if (leading) return { frame: leading, edge: 'max' }
  const trailing = frameAtDividerSide(frames, divider, gap, 'min', pointerPerpendicularCoordinate)
  return trailing ? { frame: trailing, edge: 'min' } : undefined
}

function targetIsReachable(page: PageV1, divider: ResolvedDivider, target: DividerSnapTarget) {
  const next = applyDividerChange(
    page,
    dividerChangeForCoordinate(page, divider, target.coordinate),
  )
  const frames = resolveLayout(next)
  const source = frames.find((frame) => frame.slotId === target.sourceSlotId)
  const adjacent = frames.find((frame) => frame.slotId === target.targetSlotId)
  if (!source || !adjacent) return false
  if (target.kind === 'equal-size') {
    const sourceSize = divider.axis === 'x' ? source.width : source.height
    const adjacentSize = divider.axis === 'x' ? adjacent.width : adjacent.height
    return Math.abs(sourceSize - adjacentSize) < 0.01
  }
  const sourceCoordinate =
    target.sourceEdge === 'min' ? frameMin(source, divider.axis) : frameMax(source, divider.axis)
  const targetCoordinate =
    target.targetEdge === 'min'
      ? frameMin(adjacent, divider.axis)
      : frameMax(adjacent, divider.axis)
  return Math.abs(sourceCoordinate - targetCoordinate) < 0.01
}

function oppositeFrames(
  frames: ResolvedFrame[],
  divider: ResolvedDivider,
  source: ResolvedFrame,
  sourceEdge: FrameEdge,
  gap: number,
): ResolvedFrame[] {
  const center = dividerCenter(divider)
  const expectedEdge = center + (sourceEdge === 'max' ? gap / 2 : -gap / 2)
  const targetEdge: FrameEdge = sourceEdge === 'max' ? 'min' : 'max'
  return frames.filter(
    (frame) =>
      frame.slotId !== source.slotId &&
      Math.abs(
        (targetEdge === 'min' ? frameMin(frame, divider.axis) : frameMax(frame, divider.axis)) -
          expectedEdge,
      ) < 1 &&
      overlaps(
        perpendicularMin(frame, divider.axis),
        perpendicularMax(frame, divider.axis),
        perpendicularMin(source, divider.axis),
        perpendicularMax(source, divider.axis),
      ),
  )
}

export function findDividerSnapTargets(
  page: PageV1,
  divider: ResolvedDivider,
  selectedSlotId: SlotId | null,
  pointerPerpendicularCoordinate: number,
): DividerSnapTarget[] {
  const frames = resolveLayout(page)
  const source = sourceAtDivider(
    frames,
    divider,
    page.style.gap,
    selectedSlotId,
    pointerPerpendicularCoordinate,
  )
  const targets: DividerSnapTarget[] = []
  if (source) {
    const sourcePerpendicularStart = perpendicularMin(source.frame, divider.axis)
    const sourcePerpendicularEnd = perpendicularMax(source.frame, divider.axis)

    for (const frame of frames) {
      if (frame.slotId === source.frame.slotId) continue
      const framePerpendicularStart = perpendicularMin(frame, divider.axis)
      const framePerpendicularEnd = perpendicularMax(frame, divider.axis)
      const separation = intervalDistance(
        sourcePerpendicularStart,
        sourcePerpendicularEnd,
        framePerpendicularStart,
        framePerpendicularEnd,
      )
      if (separation < 0.001 || separation > page.style.gap + 1) continue
      for (const targetEdge of ['min', 'max'] as const) {
        const targetCoordinate =
          targetEdge === 'min' ? frameMin(frame, divider.axis) : frameMax(frame, divider.axis)
        const coordinate =
          targetCoordinate + (source.edge === 'max' ? page.style.gap / 2 : -page.style.gap / 2)
        targets.push({
          id: `edge:${source.frame.slotId}:${source.edge}:${frame.slotId}:${targetEdge}`,
          kind: 'edge',
          coordinate,
          sourceSlotId: source.frame.slotId,
          targetSlotId: frame.slotId,
          sourceEdge: source.edge,
          targetEdge,
          label: 'Aligned edges',
        })
      }
    }
  }

  const center = dividerCenter(divider)
  const equalPairs = frames
    .filter((frame) => Math.abs(frameMax(frame, divider.axis) - (center - page.style.gap / 2)) < 1)
    .flatMap((leading) =>
      oppositeFrames(frames, divider, leading, 'max', page.style.gap).map((trailing) => {
        const overlapStart = Math.max(
          perpendicularMin(leading, divider.axis),
          perpendicularMin(trailing, divider.axis),
        )
        const overlapEnd = Math.min(
          perpendicularMax(leading, divider.axis),
          perpendicularMax(trailing, divider.axis),
        )
        const target: DividerSnapTarget = {
          id: `equal:${leading.slotId}:${trailing.slotId}`,
          kind: 'equal-size',
          coordinate: (frameMin(leading, divider.axis) + frameMax(trailing, divider.axis)) / 2,
          sourceSlotId: leading.slotId,
          targetSlotId: trailing.slotId,
          sourceEdge: 'max',
          targetEdge: 'min',
          label: divider.axis === 'x' ? 'Equal width' : 'Equal height',
        }
        return {
          target,
          distance: intervalDistance(
            pointerPerpendicularCoordinate,
            pointerPerpendicularCoordinate,
            overlapStart,
            overlapEnd,
          ),
          centerDistance: Math.abs(
            (overlapStart + overlapEnd) / 2 - pointerPerpendicularCoordinate,
          ),
        }
      }),
    )
    .filter(({ target }) => targetIsReachable(page, divider, target))
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.centerDistance - right.centerDistance ||
        left.target.id.localeCompare(right.target.id),
    )
  if (equalPairs[0]) targets.push(equalPairs[0].target)

  return targets
    .filter((target, index) => targets.findIndex(({ id }) => id === target.id) === index)
    .filter((target) => targetIsReachable(page, divider, target))
}

export function dividerChangeForCoordinate(
  page: PageV1,
  divider: ResolvedDivider,
  coordinate: number,
): DividerChange {
  let node = page.layout.root
  for (const childIndex of divider.path) {
    if (node.kind !== 'split' || !node.children[childIndex]) throw new Error('Unknown divider')
    node = node.children[childIndex]
  }
  if (node.kind !== 'split') throw new Error('Unknown divider')
  const start = divider.axis === 'x' ? divider.parentX : divider.parentY
  const length = divider.axis === 'x' ? divider.parentWidth : divider.parentHeight
  const usableLength = length - page.style.gap * (node.children.length - 1)
  return {
    path: divider.path,
    index: divider.index,
    position: Math.min(
      0.95,
      Math.max(0.05, (coordinate - start - page.style.gap * (divider.index + 0.5)) / usableLength),
    ),
  }
}

export function applyDividerChange(page: PageV1, change: DividerChange): PageV1 {
  const draft = structuredClone(page)
  let node = draft.layout.root
  for (const childIndex of change.path) {
    if (node.kind !== 'split' || !node.children[childIndex]) throw new Error('Unknown divider')
    node = node.children[childIndex]
  }
  if (node.kind !== 'split' || !node.children[change.index + 1]) throw new Error('Unknown divider')
  const total = node.weights.reduce((sum, weight) => sum + weight, 0)
  const before = node.weights.slice(0, change.index).reduce((sum, weight) => sum + weight, 0)
  const pair = node.weights[change.index] + node.weights[change.index + 1]
  const first = Math.min(pair - 0.1, Math.max(0.1, change.position * total - before))
  node.weights[change.index] = first
  node.weights[change.index + 1] = pair - first
  return draft
}
