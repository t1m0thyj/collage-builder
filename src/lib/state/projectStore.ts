import { derived, get, readonly, writable, type Readable, type Writable } from 'svelte/store'
import { assertDocumentInvariants } from '../domain/invariants'
import { createPage, defaultPlacement, instantiateLayout } from '../domain/factories'
import { resolveLayout } from '../domain/geometry'
import type {
  AssetRecordV1,
  CollageDocumentV1,
  NormalizedPoint,
  PageV1,
  SlotContentV1,
  SlotId,
} from '../domain/types'
import { createId } from '../utils/ids'
import { History } from './history'

const clone = <T>(value: T): T => structuredClone(value)

export class ProjectStore {
  private readonly state: Writable<CollageDocumentV1>
  private readonly history = new History<CollageDocumentV1>()
  private readonly dirty = writable(false)
  readonly document: Readable<CollageDocumentV1>
  readonly canUndo: Readable<boolean>
  readonly canRedo: Readable<boolean>
  readonly isDirty: Readable<boolean>

  constructor(document: CollageDocumentV1) {
    assertDocumentInvariants(document)
    this.state = writable(clone(document))
    this.document = readonly(this.state)
    this.canUndo = derived(this.state, () => this.history.canUndo)
    this.canRedo = derived(this.state, () => this.history.canRedo)
    this.isDirty = readonly(this.dirty)
  }

  snapshot(): CollageDocumentV1 {
    return clone(get(this.state))
  }

  replaceDocument(document: CollageDocumentV1): void {
    assertDocumentInvariants(document)
    this.history.clear()
    this.state.set(clone(document))
    this.dirty.set(false)
  }
  markClean(): void {
    this.dirty.set(false)
  }

  private commit(mutator: (draft: CollageDocumentV1) => void): void {
    const before = this.snapshot()
    const draft = clone(before)
    mutator(draft)
    draft.updatedAt = new Date().toISOString()
    assertDocumentInvariants(draft)
    this.history.push(before)
    this.state.set(draft)
    this.dirty.set(true)
  }

  renameProject(title: string): void {
    const normalized = title.trim()
    if (!normalized) throw new Error('Project title cannot be blank')
    this.commit((draft) => {
      draft.title = normalized
    })
  }

  changeLayout(pageId: string, presetId: string): void {
    this.commit((draft) => {
      const page = this.findPage(draft, pageId)
      const orderedContent = resolveLayout(page).map((frame) => page.slots[frame.slotId])
      const instance = instantiateLayout(presetId)
      const newSlotIds = Object.keys(instance.slots)
      newSlotIds.forEach((slotId, index) => {
        instance.slots[slotId] = orderedContent[index] ?? null
      })
      page.layout = instance.layout
      page.slots = instance.slots
    })
  }

  setPageStyle(pageId: string, patch: Partial<PageV1['style']>): void {
    this.commit((draft) => {
      Object.assign(this.findPage(draft, pageId).style, patch)
    })
  }

  resizePage(pageId: string, width: number, height: number): void {
    this.commit((draft) => {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 64 || height < 64)
        throw new Error('Page dimensions must be at least 64 px')
      const page = this.findPage(draft, pageId)
      page.width = Math.round(width)
      page.height = Math.round(height)
    })
  }

  addAsset(asset: AssetRecordV1): void {
    this.commit((draft) => {
      if (Object.values(draft.assets).some((candidate) => candidate.sha256 === asset.sha256))
        throw new Error('This exact image is already in the project')
      draft.assets[asset.id] = clone(asset)
    })
  }

  assignAsset(pageId: string, slotId: SlotId, assetId: string): void {
    this.commit((draft) => {
      if (!draft.assets[assetId]) throw new Error(`Unknown asset: ${assetId}`)
      const page = this.findPage(draft, pageId)
      if (!(slotId in page.slots)) throw new Error(`Unknown slot: ${slotId}`)
      page.slots[slotId] = { assetId, placement: defaultPlacement() }
    })
  }

  clearSlot(pageId: string, slotId: SlotId): void {
    this.commit((draft) => {
      this.findPage(draft, pageId).slots[slotId] = null
    })
  }

  setSlotContent(pageId: string, slotId: SlotId, content: SlotContentV1 | null): void {
    this.commit((draft) => {
      const page = this.findPage(draft, pageId)
      if (!(slotId in page.slots)) throw new Error(`Unknown slot: ${slotId}`)
      page.slots[slotId] = content ? clone(content) : null
    })
  }

  previewSlotContent(pageId: string, slotId: SlotId, content: SlotContentV1): void {
    const draft = this.snapshot()
    const page = this.findPage(draft, pageId)
    if (!(slotId in page.slots)) throw new Error(`Unknown slot: ${slotId}`)
    page.slots[slotId] = clone(content)
    assertDocumentInvariants(draft)
    this.state.set(draft)
  }

  commitCrop(pageId: string, slotId: SlotId, originalPlacement: SlotContentV1['placement']): void {
    const after = this.snapshot()
    const content = this.findPage(after, pageId).slots[slotId]
    if (!content) return
    const before = clone(after)
    this.findPage(before, pageId).slots[slotId] = {
      ...content,
      placement: clone(originalPlacement),
    }
    after.updatedAt = new Date().toISOString()
    assertDocumentInvariants(after)
    this.history.push(before)
    this.state.set(after)
    this.dirty.set(true)
  }

  cancelCrop(pageId: string, slotId: SlotId, originalPlacement: SlotContentV1['placement']): void {
    const draft = this.snapshot()
    const content = this.findPage(draft, pageId).slots[slotId]
    if (!content) return
    content.placement = clone(originalPlacement)
    this.state.set(draft)
  }

  moveOrSwapSlots(pageId: string, sourceSlotId: SlotId, targetSlotId: SlotId): void {
    if (sourceSlotId === targetSlotId) return
    this.commit((draft) => {
      const slots = this.findPage(draft, pageId).slots
      if (!(sourceSlotId in slots) || !(targetSlotId in slots)) throw new Error('Unknown frame')
      ;[slots[sourceSlotId], slots[targetSlotId]] = [slots[targetSlotId], slots[sourceSlotId]]
    })
  }

  removeAsset(assetId: string): void {
    this.commit((draft) => {
      if (!draft.assets[assetId]) throw new Error(`Unknown asset: ${assetId}`)
      draft.pages.forEach((page) =>
        Object.keys(page.slots).forEach((slotId) => {
          if (page.slots[slotId]?.assetId === assetId) page.slots[slotId] = null
        }),
      )
      delete draft.assets[assetId]
    })
  }

  replaceAsset(assetId: string, replacement: AssetRecordV1): void {
    this.commit((draft) => {
      if (!draft.assets[assetId]) throw new Error(`Unknown asset: ${assetId}`)
      draft.assets[assetId] = { ...clone(replacement), id: assetId }
    })
  }

  removeUnusedAssets(): void {
    this.commit((draft) => {
      const used = new Set(
        draft.pages.flatMap((page) =>
          Object.values(page.slots).flatMap((content) => (content ? [content.assetId] : [])),
        ),
      )
      Object.keys(draft.assets).forEach((assetId) => {
        if (!used.has(assetId)) delete draft.assets[assetId]
      })
    })
  }

  addPage(): void {
    this.commit((draft) => {
      const source = draft.pages[draft.pages.length - 1]
      const page = createPage(`Page ${draft.pages.length + 1}`, 'layout-2-001')
      page.width = source.width
      page.height = source.height
      page.style = clone(source.style)
      draft.pages.push(page)
    })
  }

  duplicatePage(pageId: string): void {
    this.commit((draft) => {
      const source = this.findPage(draft, pageId)
      const duplicate = clone(source)
      duplicate.id = createId()
      duplicate.name = `${source.name} copy`
      draft.pages.splice(draft.pages.indexOf(source) + 1, 0, duplicate)
    })
  }

  deletePage(pageId: string): void {
    this.commit((draft) => {
      if (draft.pages.length < 2) throw new Error('A project must keep one page')
      draft.pages.splice(draft.pages.indexOf(this.findPage(draft, pageId)), 1)
    })
  }

  clearPage(pageId: string): void {
    this.commit((draft) => {
      const page = this.findPage(draft, pageId)
      Object.keys(page.slots).forEach((slotId) => (page.slots[slotId] = null))
    })
  }

  renamePage(pageId: string, name: string): void {
    this.commit((draft) => {
      this.findPage(draft, pageId).name = name.trim() || 'Untitled page'
    })
  }

  movePage(pageId: string, direction: -1 | 1): void {
    this.commit((draft) => {
      const index = draft.pages.findIndex((page) => page.id === pageId)
      const target = index + direction
      if (target < 0 || target >= draft.pages.length) return
      ;[draft.pages[index], draft.pages[target]] = [draft.pages[target], draft.pages[index]]
    })
  }

  adjustDivider(pageId: string, path: number[], dividerIndex: number, position: number): void {
    this.adjustDividers(pageId, [{ path, index: dividerIndex, position }])
  }

  adjustDividers(
    pageId: string,
    changes: Array<{ path: number[]; index: number; position: number }>,
  ): void {
    this.commit((draft) => {
      const page = this.findPage(draft, pageId)
      for (const { path, index, position } of changes) {
        let node = page.layout.root
        for (const childIndex of path) {
          if (node.kind !== 'split' || !node.children[childIndex])
            throw new Error('Unknown divider')
          node = node.children[childIndex]
        }
        if (node.kind !== 'split') throw new Error('Unknown divider')
        const total = node.weights.reduce((sum, weight) => sum + weight, 0)
        const before = node.weights.slice(0, index).reduce((sum, weight) => sum + weight, 0)
        const pair = node.weights[index] + node.weights[index + 1]
        const first = Math.min(pair - 0.1, Math.max(0.1, position * total - before))
        node.weights[index] = first
        node.weights[index + 1] = pair - first
      }
    })
  }

  setFramePolygon(pageId: string, slotId: SlotId, polygon?: NormalizedPoint[]): void {
    this.commit((draft) => {
      const visit = (node: PageV1['layout']['root']): boolean => {
        if (node.kind === 'leaf') {
          if (node.slotId !== slotId) return false
          node.polygon = polygon ? clone(polygon) : undefined
          return true
        }
        if (node.kind === 'grid') return false
        return node.children.some(visit)
      }
      if (!visit(this.findPage(draft, pageId).layout.root)) throw new Error('Unknown frame')
    })
  }

  undo(): void {
    const previous = this.history.undo(this.snapshot())
    if (previous) {
      this.state.set(previous)
      this.dirty.set(true)
    }
  }
  redo(): void {
    const next = this.history.redo(this.snapshot())
    if (next) {
      this.state.set(next)
      this.dirty.set(true)
    }
  }

  private findPage(document: CollageDocumentV1, pageId: string): PageV1 {
    const page = document.pages.find((candidate) => candidate.id === pageId)
    if (!page) throw new Error(`Unknown page: ${pageId}`)
    return page
  }
}
