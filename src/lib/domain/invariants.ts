import { resolveLayout } from './geometry'
import type { CollageDocumentV1, LayoutNodeV1 } from './types'

function leafIds(node: LayoutNodeV1, ids: string[]): void {
  if (node.kind === 'leaf') ids.push(node.slotId)
  else if (node.kind === 'grid') node.cells.forEach((cell) => ids.push(cell.slotId))
  else node.children.forEach((child) => leafIds(child, ids))
}

export function assertDocumentInvariants(document: CollageDocumentV1): void {
  if (document.pages.length === 0) throw new Error('A project needs at least one page')
  const pageIds = new Set<string>()
  for (const page of document.pages) {
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
