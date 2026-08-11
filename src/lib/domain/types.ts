export type ProjectId = string
export type PageId = string
export type AssetId = string
export type SlotId = string
export interface NormalizedPoint {
  x: number
  y: number
}

export interface CollageDocumentV1 {
  format: 'collage-builder'
  schemaVersion: 1
  projectId: ProjectId
  title: string
  createdAt: string
  updatedAt: string
  pages: PageV1[]
  assets: Record<AssetId, AssetRecordV1>
  exportDefaults: { width: number; height: number; aspectLocked: boolean }
}

export interface PageV1 {
  id: PageId
  name: string
  width: number
  height: number
  layout: LayoutSnapshotV1
  slots: Record<SlotId, SlotContentV1 | null>
  style: PageStyleV1
}

export interface PageStyleV1 {
  backgroundColor: string
  padding: number
  gap: number
  cornerRadius: number
  shadow: {
    enabled: boolean
    color: string
    opacity: number
    blur: number
    offsetX: number
    offsetY: number
  }
}

export type LayoutNodeV1 =
  | { kind: 'leaf'; slotId: SlotId; polygon?: NormalizedPoint[] }
  | { kind: 'split'; axis: 'x' | 'y'; weights: number[]; children: LayoutNodeV1[] }
  | {
      kind: 'grid'
      columns: number
      rows: number
      cells: Array<{ slotId: SlotId; x: number; y: number; width: number; height: number }>
    }

export interface LayoutSnapshotV1 {
  presetId: string
  presetRevision: number
  root: LayoutNodeV1
}

export interface SlotContentV1 {
  assetId: AssetId
  placement: { zoom: number; positionX: number; positionY: number }
}

export interface AssetRecordV1 {
  id: AssetId
  originalName: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
  byteLength: number
  width: number
  height: number
  sha256: string
  storage:
    | { kind: 'embedded'; archivePath: string }
    | { kind: 'linked'; displayHint: string; relativePath?: string; lastModified?: number }
}

export type LayoutPresetNode =
  | { kind: 'leaf'; key: string; polygon?: NormalizedPoint[] }
  | { kind: 'split'; axis: 'x' | 'y'; weights: number[]; children: LayoutPresetNode[] }
  | {
      kind: 'grid'
      columns: number
      rows: number
      cells: Array<{ key: string; x: number; y: number; width: number; height: number }>
    }

export interface LayoutPresetDefinition {
  id: string
  revision: number
  name: string
  frameCount: number
  tags: Array<'uniform' | 'asymmetric' | 'portrait-led' | 'landscape-led'>
  root: LayoutPresetNode
}

export interface ResolvedFrame {
  slotId: SlotId
  x: number
  y: number
  width: number
  height: number
  polygon?: NormalizedPoint[]
}
