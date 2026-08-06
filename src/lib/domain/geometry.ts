import type { LayoutNodeV1, PageV1, ResolvedFrame } from './types'

const readingTolerance = 0.001

function resolveNode(node: LayoutNodeV1, x: number, y: number, width: number, height: number, gap: number, frames: ResolvedFrame[]): void {
  if (node.kind === 'leaf') { frames.push({ slotId: node.slotId, x, y, width, height, polygon: node.polygon }); return }
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

export interface ResolvedDivider { path: number[]; index: number; axis: 'x' | 'y'; x: number; y: number; width: number; height: number; parentX: number; parentY: number; parentWidth: number; parentHeight: number }

export function resolveDividers(page: PageV1): ResolvedDivider[] {
  const dividers: ResolvedDivider[] = []; const width = page.width - page.style.padding * 2; const height = page.height - page.style.padding * 2
  const visit = (node: LayoutNodeV1, x: number, y: number, nodeWidth: number, nodeHeight: number, path: number[]) => {
    if (node.kind === 'leaf') return
    const axisLength = node.axis === 'x' ? nodeWidth : nodeHeight; const usable = axisLength - page.style.gap * (node.children.length - 1); const total = node.weights.reduce((sum, value) => sum + value, 0); let offset = 0
    node.children.forEach((child, index) => { const length = usable * node.weights[index] / total; if (index < node.children.length - 1) { const center = offset + length + page.style.gap / 2; dividers.push(node.axis === 'x' ? { path, index, axis: 'x', x: x + center - 6, y, width: 12, height: nodeHeight, parentX: x, parentY: y, parentWidth: nodeWidth, parentHeight: nodeHeight } : { path, index, axis: 'y', x, y: y + center - 6, width: nodeWidth, height: 12, parentX: x, parentY: y, parentWidth: nodeWidth, parentHeight: nodeHeight }) }; visit(child, node.axis === 'x' ? x + offset : x, node.axis === 'y' ? y + offset : y, node.axis === 'x' ? length : nodeWidth, node.axis === 'y' ? length : nodeHeight, [...path, index]); offset += length + page.style.gap })
  }
  visit(page.layout.root, page.style.padding, page.style.padding, width, height, [])
  return dividers
}
