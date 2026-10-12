import { derived, get, readonly, writable, type Readable, type Writable } from 'svelte/store'
import { assertDocumentInvariants } from '../domain/invariants'
import {
  createPage,
  defaultPlacement,
  defaultTwoPhotoPreset,
  instantiatePreset,
} from '../domain/factories'
import { resolveLayout } from '../domain/geometry'
import { assertPageDimensions } from '../domain/pageLimits'
import type {
  AssetRecordV1,
  CollageDocumentV1,
  LayoutPresetDefinition,
  PageV1,
  SlotContentV1,
  SlotId,
} from '../domain/types'
import { createId } from '../utils/ids'
import { maxProjectAssetCount } from '../persistence/limits'
import { History } from './history'

const clone = <T>(value: T): T => structuredClone(value)
const maxNameLength = 200

export interface ProjectVersion {
  generation: number
  revision: number
}

export interface VersionedProjectSnapshot extends ProjectVersion {
  document: CollageDocumentV1
}

export class ProjectStore {
  private readonly state: Writable<CollageDocumentV1>
  private readonly history = new History<CollageDocumentV1>()
  private readonly historyRevision = writable(0)
  private readonly dirty = writable(false)
  private generation = 0
  private revision = 0
  private pageStyleInteraction:
    { pageId: string; control: string; before: CollageDocumentV1; wasDirty: boolean } | undefined
  readonly document: Readable<CollageDocumentV1>
  readonly canUndo: Readable<boolean>
  readonly canRedo: Readable<boolean>
  readonly isDirty: Readable<boolean>

  constructor(document: CollageDocumentV1) {
    assertDocumentInvariants(document)
    this.state = writable(clone(document))
    this.document = readonly(this.state)
    this.canUndo = derived([this.state, this.historyRevision], () => this.history.canUndo)
    this.canRedo = derived([this.state, this.historyRevision], () => this.history.canRedo)
    this.isDirty = readonly(this.dirty)
  }

  snapshot(): CollageDocumentV1 {
    return clone(get(this.state))
  }

  versionedSnapshot(): VersionedProjectSnapshot {
    return { document: this.snapshot(), generation: this.generation, revision: this.revision }
  }

  isCurrentProject(version: Pick<ProjectVersion, 'generation'>): boolean {
    return version.generation === this.generation
  }

  isCurrentVersion(version: ProjectVersion): boolean {
    return this.isCurrentProject(version) && version.revision === this.revision
  }

  replaceDocument(document: CollageDocumentV1): void {
    assertDocumentInvariants(document)
    this.pageStyleInteraction = undefined
    this.history.clear()
    this.historyRevision.update((value) => value + 1)
    this.generation += 1
    this.revision += 1
    this.state.set(clone(document))
    this.dirty.set(false)
  }

  markClean(version: ProjectVersion): boolean {
    if (!this.isCurrentVersion(version)) return false
    this.dirty.set(false)
    return true
  }

  private publish(document: CollageDocumentV1, dirty?: boolean): void {
    this.revision += 1
    this.state.set(document)
    if (dirty !== undefined) this.dirty.set(dirty)
  }

  private commit(
    mutator: (draft: CollageDocumentV1) => void,
    changedPages: readonly string[] = [],
    changeAssets = false,
  ): void {
    // Published documents are never mutated. Keeping the current immutable
    // state for Undo avoids cloning a complete project solely for history.
    const before = get(this.state)
    const changed = new Set(changedPages)
    const draft = {
      ...before,
      pages: before.pages.map((page) => (changed.has(page.id) ? clone(page) : page)),
      assets: changeAssets ? { ...before.assets } : before.assets,
    }
    mutator(draft)
    draft.updatedAt = new Date().toISOString()
    assertDocumentInvariants(draft)
    this.finishPageStyleInteraction()
    this.history.push(before)
    this.historyRevision.update((value) => value + 1)
    this.publish(draft, true)
  }

  renameProject(title: string): void {
    const normalized = title.trim()
    if (!normalized) throw new Error('Project title cannot be blank')
    if (normalized.length > maxNameLength)
      throw new Error('Project title must be 200 characters or fewer')
    if (normalized === get(this.state).title) return
    this.commit((draft) => {
      draft.title = normalized
    })
  }

  changeLayout(pageId: string, preset: LayoutPresetDefinition): void {
    this.commit(
      (draft) => {
        const page = this.findPage(draft, pageId)
        const orderedContent = resolveLayout(page).map((frame) => page.slots[frame.slotId])
        const instance = instantiatePreset(preset)
        const newSlotIds = Object.keys(instance.slots)
        newSlotIds.forEach((slotId, index) => {
          instance.slots[slotId] = orderedContent[index] ?? null
        })
        page.layout = instance.layout
        page.slots = instance.slots
      },
      [pageId],
    )
  }

  setPageStyle(pageId: string, patch: Partial<PageV1['style']>): void {
    this.commit(
      (draft) => {
        Object.assign(this.findPage(draft, pageId).style, clone(patch))
      },
      [pageId],
    )
  }

  previewPageStyle(pageId: string, control: string, patch: Partial<PageV1['style']>): void {
    const draft = this.updatePage(get(this.state), pageId, (page) => {
      Object.assign(page.style, clone(patch))
    })
    assertDocumentInvariants(draft)
    const interaction = this.pageStyleInteraction
    if (interaction && (interaction.pageId !== pageId || interaction.control !== control))
      this.finishPageStyleInteraction()
    if (!this.pageStyleInteraction)
      this.pageStyleInteraction = {
        pageId,
        control,
        before: get(this.state),
        wasDirty: get(this.dirty),
      }

    this.publish(draft, true)
  }

  commitPageStyle(pageId: string, control: string): void {
    const interaction = this.pageStyleInteraction
    if (!interaction || interaction.pageId !== pageId || interaction.control !== control) return
    this.finishPageStyleInteraction()
  }

  private finishPageStyleInteraction(): void {
    const interaction = this.pageStyleInteraction
    if (!interaction) return
    this.pageStyleInteraction = undefined

    const current = get(this.state)
    if (
      JSON.stringify(this.findPage(current, interaction.pageId).style) ===
      JSON.stringify(this.findPage(interaction.before, interaction.pageId).style)
    ) {
      this.dirty.set(interaction.wasDirty)
      return
    }
    const after = { ...current, updatedAt: new Date().toISOString() }
    assertDocumentInvariants(after)
    this.history.push(interaction.before)
    this.historyRevision.update((value) => value + 1)
    this.publish(after, true)
  }

  resizePage(pageId: string, width: number, height: number): void {
    assertPageDimensions(width, height)
    width = Math.round(width)
    height = Math.round(height)
    assertPageDimensions(width, height)
    this.commit(
      (draft) => {
        const page = this.findPage(draft, pageId)
        page.width = width
        page.height = height
      },
      [pageId],
    )
  }

  addAsset(asset: AssetRecordV1): void {
    this.addAssets([asset])
  }

  addAssets(assets: AssetRecordV1[]): void {
    if (!assets.length) return
    this.commit(
      (draft) => {
        if (Object.keys(draft.assets).length + assets.length > maxProjectAssetCount)
          throw new Error(`Projects can contain no more than ${maxProjectAssetCount} photos`)
        const hashes = new Set(Object.values(draft.assets).map((candidate) => candidate.sha256))
        for (const asset of assets) {
          if (hashes.has(asset.sha256))
            throw new Error('This exact image is already in the project')
          hashes.add(asset.sha256)
          draft.assets[asset.id] = clone(asset)
        }
      },
      [],
      true,
    )
  }

  assignAsset(pageId: string, slotId: SlotId, assetId: string): void {
    this.commit(
      (draft) => {
        if (!draft.assets[assetId]) throw new Error(`Unknown asset: ${assetId}`)
        const page = this.findPage(draft, pageId)
        if (!(slotId in page.slots)) throw new Error(`Unknown slot: ${slotId}`)
        page.slots[slotId] = { assetId, placement: defaultPlacement() }
      },
      [pageId],
    )
  }

  clearSlot(pageId: string, slotId: SlotId): void {
    this.commit(
      (draft) => {
        this.findPage(draft, pageId).slots[slotId] = null
      },
      [pageId],
    )
  }

  setSlotContent(pageId: string, slotId: SlotId, content: SlotContentV1 | null): void {
    this.commit(
      (draft) => {
        const page = this.findPage(draft, pageId)
        if (!(slotId in page.slots)) throw new Error(`Unknown slot: ${slotId}`)
        page.slots[slotId] = content ? clone(content) : null
      },
      [pageId],
    )
  }

  previewSlotContent(pageId: string, slotId: SlotId, content: SlotContentV1): void {
    const draft = this.updatePage(get(this.state), pageId, (page) => {
      if (!(slotId in page.slots)) throw new Error(`Unknown slot: ${slotId}`)
      page.slots[slotId] = clone(content)
    })
    assertDocumentInvariants(draft)
    this.publish(draft)
  }

  commitCrop(pageId: string, slotId: SlotId, originalPlacement: SlotContentV1['placement']): void {
    const current = get(this.state)
    const after = { ...current, updatedAt: new Date().toISOString() }
    const content = this.findPage(after, pageId).slots[slotId]
    if (!content) return
    const before = this.updatePage(current, pageId, (page) => {
      page.slots[slotId] = { ...content, placement: clone(originalPlacement) }
    })
    assertDocumentInvariants(after)
    this.history.push(before)
    this.historyRevision.update((value) => value + 1)
    this.publish(after, true)
  }

  cancelCrop(pageId: string, slotId: SlotId, originalPlacement: SlotContentV1['placement']): void {
    const current = get(this.state)
    const content = this.findPage(current, pageId).slots[slotId]
    if (!content) return
    const draft = this.updatePage(current, pageId, (page) => {
      page.slots[slotId] = { ...content, placement: clone(originalPlacement) }
    })
    this.publish(draft)
  }

  moveOrSwapSlots(pageId: string, sourceSlotId: SlotId, targetSlotId: SlotId): void {
    if (sourceSlotId === targetSlotId) return
    this.commit(
      (draft) => {
        const slots = this.findPage(draft, pageId).slots
        if (!(sourceSlotId in slots) || !(targetSlotId in slots)) throw new Error('Unknown frame')
        ;[slots[sourceSlotId], slots[targetSlotId]] = [slots[targetSlotId], slots[sourceSlotId]]
      },
      [pageId],
    )
  }

  removeAsset(assetId: string): void {
    this.removeAssets([assetId])
  }

  removeAssets(assetIds: Iterable<string>): void {
    const uniqueAssetIds = [...new Set(assetIds)]
    if (!uniqueAssetIds.length) return
    const removedAssetIds = new Set(uniqueAssetIds)
    const changedPages = get(this.state)
      .pages.filter((page) =>
        Object.values(page.slots).some(
          (content) => content && removedAssetIds.has(content.assetId),
        ),
      )
      .map((page) => page.id)
    this.commit(
      (draft) => {
        for (const assetId of uniqueAssetIds)
          if (!draft.assets[assetId]) throw new Error(`Unknown asset: ${assetId}`)
        draft.pages.forEach((page) =>
          Object.keys(page.slots).forEach((slotId) => {
            if (page.slots[slotId]?.assetId && removedAssetIds.has(page.slots[slotId]!.assetId))
              page.slots[slotId] = null
          }),
        )
        uniqueAssetIds.forEach((assetId) => delete draft.assets[assetId])
      },
      changedPages,
      true,
    )
  }

  replaceAsset(assetId: string, replacement: AssetRecordV1): void {
    this.replaceAssets([{ assetId, replacement }])
  }

  replaceAssets(replacements: Array<{ assetId: string; replacement: AssetRecordV1 }>): void {
    if (!replacements.length) return
    this.commit(
      (draft) => {
        for (const { assetId } of replacements)
          if (!draft.assets[assetId]) throw new Error(`Unknown asset: ${assetId}`)
        for (const { assetId, replacement } of replacements)
          draft.assets[assetId] = { ...clone(replacement), id: assetId }
      },
      [],
      true,
    )
  }

  addPage(sourcePageId?: string): void {
    this.commit((draft) => {
      const source = sourcePageId
        ? this.findPage(draft, sourcePageId)
        : draft.pages[draft.pages.length - 1]
      const page = createPage(`Page ${draft.pages.length + 1}`, defaultTwoPhotoPreset)
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
      duplicate.name = `${source.name.slice(0, maxNameLength - ' copy'.length)} copy`
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
    this.commit(
      (draft) => {
        const page = this.findPage(draft, pageId)
        Object.keys(page.slots).forEach((slotId) => (page.slots[slotId] = null))
      },
      [pageId],
    )
  }

  renamePage(pageId: string, name: string): void {
    const normalized = name.trim() || 'Untitled page'
    if (normalized.length > maxNameLength)
      throw new Error('Page name must be 200 characters or fewer')
    this.commit(
      (draft) => {
        this.findPage(draft, pageId).name = normalized
      },
      [pageId],
    )
  }

  movePage(pageId: string, direction: -1 | 1): void {
    this.commit((draft) => {
      const index = draft.pages.findIndex((page) => page.id === pageId)
      const target = index + direction
      if (target < 0 || target >= draft.pages.length) return
      ;[draft.pages[index], draft.pages[target]] = [draft.pages[target], draft.pages[index]]
    })
  }

  reorderPage(pageId: string, insertionIndex: number): void {
    const pages = get(this.state).pages
    const sourceIndex = pages.findIndex((page) => page.id === pageId)
    if (sourceIndex < 0) throw new Error(`Unknown page: ${pageId}`)
    const boundary = Math.min(pages.length, Math.max(0, Math.round(insertionIndex)))
    const targetIndex = sourceIndex < boundary ? boundary - 1 : boundary
    if (targetIndex === sourceIndex) return
    this.commit((draft) => {
      const [page] = draft.pages.splice(sourceIndex, 1)
      draft.pages.splice(targetIndex, 0, page)
    })
  }

  adjustDivider(pageId: string, path: number[], dividerIndex: number, position: number): void {
    this.adjustDividers(pageId, [{ path, index: dividerIndex, position }])
  }

  equalizeSplit(pageId: string, path: number[]): void {
    const splitAtPath = (page: PageV1) => {
      let node = page.layout.root
      for (const childIndex of path) {
        if (node.kind !== 'split' || !node.children[childIndex]) throw new Error('Unknown divider')
        node = node.children[childIndex]
      }
      if (node.kind !== 'split') throw new Error('Unknown divider')
      return node
    }
    const node = splitAtPath(this.findPage(get(this.state), pageId))
    const equalWeight = node.weights.reduce((sum, weight) => sum + weight, 0) / node.weights.length
    if (node.weights.every((weight) => Math.abs(weight - equalWeight) < 0.000001)) return
    this.commit(
      (draft) => {
        splitAtPath(this.findPage(draft, pageId)).weights = node.weights.map(() => equalWeight)
      },
      [pageId],
    )
  }

  adjustDividers(
    pageId: string,
    changes: Array<{ path: number[]; index: number; position: number }>,
  ): void {
    this.commit(
      (draft) => {
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
      },
      [pageId],
    )
  }

  undo(): void {
    this.finishPageStyleInteraction()
    const previous = this.history.undo(get(this.state))
    if (previous) {
      this.publish(previous, true)
    }
  }
  redo(): void {
    this.finishPageStyleInteraction()
    const next = this.history.redo(get(this.state))
    if (next) {
      this.publish(next, true)
    }
  }

  historySnapshots(): readonly CollageDocumentV1[] {
    return this.history.snapshots()
  }

  get historyRetentionRevision(): number {
    return this.history.retentionRevision
  }

  discardOldestUndo(): boolean {
    const discarded = this.history.discardOldestUndo()
    if (discarded) this.historyRevision.update((value) => value + 1)
    return discarded
  }

  private findPage(document: CollageDocumentV1, pageId: string): PageV1 {
    const page = document.pages.find((candidate) => candidate.id === pageId)
    if (!page) throw new Error(`Unknown page: ${pageId}`)
    return page
  }

  private updatePage(
    document: CollageDocumentV1,
    pageId: string,
    update: (page: PageV1) => void,
  ): CollageDocumentV1 {
    const index = document.pages.findIndex((page) => page.id === pageId)
    if (index < 0) throw new Error(`Unknown page: ${pageId}`)
    const page = clone(document.pages[index])
    update(page)
    const pages = document.pages.slice()
    pages[index] = page
    return { ...document, pages }
  }
}
