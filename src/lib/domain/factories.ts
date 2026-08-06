import { getPreset } from '../layouts/catalog'
import { createId } from '../utils/ids'
import { defaultPlacement } from './crop'
import type { CollageDocumentV1, LayoutNodeV1, LayoutPresetNode, LayoutSnapshotV1, PageStyleV1, PageV1 } from './types'

export const defaultPageStyle = (): PageStyleV1 => ({ backgroundColor: '#F4EFE8', padding: 48, gap: 20, cornerRadius: 16, shadow: { enabled: true, color: '#000000', opacity: 0.12, blur: 18, offsetX: 0, offsetY: 6 } })

function instantiateNode(node: LayoutPresetNode, slotIds: string[]): LayoutNodeV1 {
  if (node.kind === 'leaf') { const slotId = createId(); slotIds.push(slotId); return { kind: 'leaf', slotId } }
  return { kind: 'split', axis: node.axis, weights: [...node.weights], children: node.children.map((child) => instantiateNode(child, slotIds)) }
}

export function instantiateLayout(presetId: string): { layout: LayoutSnapshotV1; slots: PageV1['slots'] } {
  const preset = getPreset(presetId)
  const slotIds: string[] = []
  const root = instantiateNode(preset.root, slotIds)
  return { layout: { presetId: preset.id, presetRevision: preset.revision, root }, slots: Object.fromEntries(slotIds.map((slotId) => [slotId, null])) }
}

export function createPage(name = 'Page 1', presetId = 'feature-right'): PageV1 {
  const instance = instantiateLayout(presetId)
  return { id: createId(), name, width: 1600, height: 1200, ...instance, style: defaultPageStyle() }
}

export function createProject(title = 'Untitled collage'): CollageDocumentV1 {
  const now = new Date().toISOString()
  const page = createPage()
  return { format: 'collage-builder', schemaVersion: 1, projectId: createId(), title, createdAt: now, updatedAt: now, pages: [page], assets: {}, exportDefaults: { width: page.width, height: page.height, aspectLocked: true } }
}

export { defaultPlacement }
