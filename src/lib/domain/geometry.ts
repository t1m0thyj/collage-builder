import type { LayoutNodeV1, PageV1, ResolvedFrame } from './types'

const readingTolerance = 0.001

function resolveNode(node: LayoutNodeV1, x: number, y: number, width: number, height: number, gap: number, frames: ResolvedFrame[]): void {
  if (node.kind === 'leaf') { frames.push({ slotId: node.slotId, x, y, width, height }); return }
  const axisLength = node.axis === 'x' ? width : height
  const usableLength = axisLength - gap * (node.children.length - 1)
  if (usableLength <= 0) throw new Error('Layout gap leaves no space for frames')
  const totalWeight = node.weights.reduce((total, weight) => total + weight, 0)
  let offset = 0
  node.children.forEach((child, index) => {
    const childLength = usableLength * (node.weights[index] / totalWeight)
    const childX = node.axis === 'x' ? x + offset : x
    const childY = node.axis === 'y' ? y + offset : y
    resolveNode(child, childX, childY, node.axis === 'x' ? childLength : width, node.axis === 'y' ? childLength : height, gap, frames)
    offset += childLength + gap
  })
}

export function readingOrder<T extends { x: number; y: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => Math.abs(left.y - right.y) <= readingTolerance ? left.x - right.x : left.y - right.y)
}

export function resolveLayout(page: PageV1): ResolvedFrame[] {
  const width = page.width - page.style.padding * 2
  const height = page.height - page.style.padding * 2
  if (width <= 0 || height <= 0) throw new Error('Page padding leaves no space for frames')
  const frames: ResolvedFrame[] = []
  resolveNode(page.layout.root, page.style.padding, page.style.padding, width, height, page.style.gap, frames)
  if (frames.some((frame) => frame.width <= 0 || frame.height <= 0)) throw new Error('Layout produced a non-positive frame')
  return readingOrder(frames)
}
