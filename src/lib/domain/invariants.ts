import { resolveLayout } from './geometry'
import { assertPageDimensions } from './pageLimits'
import {
  assertProjectBudgets,
  maxLayoutDepth,
  maxLayoutNodes,
  maxPageFrames,
  maxPolygonPoints,
} from './documentLimits'
import type { CollageDocumentV1, LayoutNodeV1 } from './types'

function leafIds(node: LayoutNodeV1, ids: string[]): void {
  const stack = [{ node, depth: 0 }]
  let count = 0
  while (stack.length) {
    const { node, depth } = stack.pop()!
    if (++count > maxLayoutNodes || depth > maxLayoutDepth)
      throw new Error('Layout exceeds supported complexity')
    if (node.kind === 'leaf') {
      if (
        node.polygon &&
        (node.polygon.length < 3 ||
          node.polygon.length > maxPolygonPoints ||
          node.polygon.some(
            ({ x, y }) =>
              !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1,
          ))
      )
        throw new Error('Layout polygon points must stay within the frame and supported limits')
      ids.push(node.slotId)
    } else if (node.kind === 'grid') {
      if (
        !Number.isSafeInteger(node.columns) ||
        !Number.isSafeInteger(node.rows) ||
        node.columns < 1 ||
        node.rows < 1 ||
        node.columns > maxPageFrames ||
        node.rows > maxPageFrames ||
        !node.cells.length ||
        node.cells.length > maxPageFrames
      )
        throw new Error('Grid dimensions exceed supported limits')
      for (const cell of node.cells) {
        if (
          ![cell.x, cell.y, cell.width, cell.height].every(Number.isSafeInteger) ||
          cell.x < 0 ||
          cell.y < 0 ||
          cell.width < 1 ||
          cell.height < 1 ||
          cell.x + cell.width > node.columns ||
          cell.y + cell.height > node.rows
        )
          throw new Error('Grid cells must stay inside their grid')
        ids.push(cell.slotId)
      }
    } else {
      if (
        node.children.length < 2 ||
        node.children.length > maxPageFrames ||
        node.weights.length !== node.children.length ||
        node.weights.some((weight) => !Number.isFinite(weight) || weight <= 0)
      )
        throw new Error('Split weights must be finite, positive, and match their children')
      for (const child of node.children) stack.push({ node: child, depth: depth + 1 })
    }
    if (ids.length > maxPageFrames)
      throw new Error(`Pages can contain no more than ${maxPageFrames} frames`)
  }
}

export function assertDocumentInvariants(document: CollageDocumentV1): void {
  if (document.pages.length === 0) throw new Error('A project needs at least one page')
  assertProjectBudgets(document)
  for (const [id, asset] of Object.entries(document.assets))
    if (id !== asset.id) throw new Error('Photo map keys must match photo IDs')
  const pageIds = new Set<string>()
  for (const page of document.pages) {
    assertPageDimensions(page.width, page.height)
    if (pageIds.has(page.id)) throw new Error('Page IDs must be unique')
    pageIds.add(page.id)
    const slots: string[] = []
    leafIds(page.layout.root, slots)
    if (slots.length !== new Set(slots).size) throw new Error('Layout slots must be unique')
    if (slots.length !== Object.keys(page.slots).length || slots.some((id) => !(id in page.slots)))
      throw new Error('Layout leaves must match page slots')
    for (const content of Object.values(page.slots))
      if (content && !document.assets[content.assetId])
        throw new Error('A slot references a missing asset')
    resolveLayout(page)
  }
}
