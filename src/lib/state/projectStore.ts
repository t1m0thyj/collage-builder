import { derived, get, readonly, writable, type Readable, type Writable } from 'svelte/store'
import { assertDocumentInvariants } from '../domain/invariants'
import { instantiateLayout } from '../domain/factories'
import { resolveLayout } from '../domain/geometry'
import type { CollageDocumentV1, PageV1 } from '../domain/types'
import { History } from './history'

const clone = <T>(value: T): T => structuredClone(value)

export class ProjectStore {
  private readonly state: Writable<CollageDocumentV1>
  private readonly history = new History<CollageDocumentV1>()
  readonly document: Readable<CollageDocumentV1>
  readonly canUndo: Readable<boolean>
  readonly canRedo: Readable<boolean>

  constructor(document: CollageDocumentV1) {
    assertDocumentInvariants(document)
    this.state = writable(clone(document))
    this.document = readonly(this.state)
    this.canUndo = derived(this.state, () => this.history.canUndo)
    this.canRedo = derived(this.state, () => this.history.canRedo)
  }

  snapshot(): CollageDocumentV1 { return clone(get(this.state)) }

  private commit(mutator: (draft: CollageDocumentV1) => void): void {
    const before = this.snapshot()
    const draft = clone(before)
    mutator(draft)
    draft.updatedAt = new Date().toISOString()
    assertDocumentInvariants(draft)
    this.history.push(before)
    this.state.set(draft)
  }

  renameProject(title: string): void {
    const normalized = title.trim()
    if (!normalized) throw new Error('Project title cannot be blank')
    this.commit((draft) => { draft.title = normalized })
  }

  changeLayout(pageId: string, presetId: string): void {
    this.commit((draft) => {
      const page = this.findPage(draft, pageId)
      const orderedContent = resolveLayout(page).map((frame) => page.slots[frame.slotId])
      const instance = instantiateLayout(presetId)
      const newSlotIds = Object.keys(instance.slots)
      newSlotIds.forEach((slotId, index) => { instance.slots[slotId] = orderedContent[index] ?? null })
      page.layout = instance.layout
      page.slots = instance.slots
    })
  }

  setPageStyle(pageId: string, patch: Partial<PageV1['style']>): void {
    this.commit((draft) => { Object.assign(this.findPage(draft, pageId).style, patch) })
  }

  undo(): void { const previous = this.history.undo(this.snapshot()); if (previous) this.state.set(previous) }
  redo(): void { const next = this.history.redo(this.snapshot()); if (next) this.state.set(next) }

  private findPage(document: CollageDocumentV1, pageId: string): PageV1 {
    const page = document.pages.find((candidate) => candidate.id === pageId)
    if (!page) throw new Error(`Unknown page: ${pageId}`)
    return page
  }
}
