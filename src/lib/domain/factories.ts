import { layout2Presets } from '../layouts/definitions/2'
import { layout3Presets } from '../layouts/definitions/3'
import { createId } from '../utils/ids'
import { defaultPlacement } from './crop'
import type {
  CollageDocumentV1,
  LayoutNodeV1,
  LayoutPresetNode,
  LayoutPresetDefinition,
  LayoutSnapshotV1,
  PageStyleV1,
  PageV1,
} from './types'

export const defaultPageStyle = (): PageStyleV1 => ({
  backgroundColor: '#808080',
  transparentBackground: false,
  padding: 30,
  gap: 30,
  cornerRadius: 30,
  shadow: { enabled: true, color: '#000000', opacity: 0.5, blur: 10, offsetX: 10, offsetY: 10 },
})

function instantiateNode(node: LayoutPresetNode, slotIds: string[]): LayoutNodeV1 {
  if (node.kind === 'leaf') {
    const slotId = createId()
    slotIds.push(slotId)
    return {
      kind: 'leaf',
      slotId,
      polygon: node.polygon ? structuredClone(node.polygon) : undefined,
    }
  }
  if (node.kind === 'grid') {
    return {
      kind: 'grid',
      columns: node.columns,
      rows: node.rows,
      cells: node.cells.map((cell) => {
        const slotId = createId()
        slotIds.push(slotId)
        return { ...cell, slotId }
      }),
    }
  }
  return {
    kind: 'split',
    axis: node.axis,
    weights: [...node.weights],
    children: node.children.map((child) => instantiateNode(child, slotIds)),
  }
}

export function instantiatePreset(preset: LayoutPresetDefinition): {
  layout: LayoutSnapshotV1
  slots: PageV1['slots']
} {
  const slotIds: string[] = []
  const root = instantiateNode(preset.root, slotIds)
  return {
    layout: { presetId: preset.id, presetRevision: preset.revision, root },
    slots: Object.fromEntries(slotIds.map((slotId) => [slotId, null])),
  }
}

const twoPhotoDefault = layout2Presets.find(
  (preset) => preset.root.kind === 'split' && preset.root.axis === 'y',
)
const threePhotoDefault = layout3Presets.find(
  (preset) =>
    preset.root.kind === 'split' &&
    preset.root.axis === 'y' &&
    preset.root.children.length === 3 &&
    preset.root.children.every((child) => child.kind === 'leaf'),
)
if (!twoPhotoDefault || !threePhotoDefault) throw new Error('Default photo layouts are missing')
export const defaultTwoPhotoPreset: LayoutPresetDefinition = twoPhotoDefault
export const defaultThreePhotoPreset: LayoutPresetDefinition = threePhotoDefault

export function createPage(
  name = 'Page 1',
  preset: LayoutPresetDefinition = defaultThreePhotoPreset,
): PageV1 {
  const instance = instantiatePreset(preset)
  return { id: createId(), name, width: 3840, height: 2880, ...instance, style: defaultPageStyle() }
}

export function createProject(title = 'Untitled collage'): CollageDocumentV1 {
  const now = new Date().toISOString()
  const page = createPage()
  return {
    format: 'collage-builder',
    schemaVersion: 1,
    projectId: createId(),
    title,
    createdAt: now,
    updatedAt: now,
    pages: [page],
    assets: {},
    exportDefaults: { width: page.width, height: page.height, aspectLocked: true },
  }
}

export { defaultPlacement }
