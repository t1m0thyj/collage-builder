import { get } from 'svelte/store'
import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import { ProjectStore } from '../../src/lib/state/projectStore'

describe('project history', () => {
  it('changes layouts transactionally and restores them through undo/redo', () => {
    const project = createProject('Original')
    const store = new ProjectStore(project)
    const pageId = project.pages[0].id
    store.renameProject('Updated')
    store.changeLayout(pageId, 'layout-4-001')
    expect(get(store.document).pages[0].layout.presetId).toBe('layout-4-001')
    expect(get(store.canUndo)).toBe(true)
    store.undo()
    expect(get(store.document).pages[0].layout.presetId).toBe('layout-3-001')
    store.redo()
    expect(get(store.document).title).toBe('Updated')
  })

  it('duplicates an embedded layout even when its catalog id is retired', () => {
    const project = createProject('Legacy layout')
    project.pages[0].layout.presetId = 'retired-layout-id'
    const store = new ProjectStore(project)

    store.duplicatePage(project.pages[0].id)

    const pages = get(store.document).pages
    expect(pages).toHaveLength(2)
    expect(pages[1].layout.root).toEqual(pages[0].layout.root)
    expect(pages[1].id).not.toBe(pages[0].id)
  })

  it('uses the active page settings when adding a page', () => {
    const project = createProject('Inherited settings')
    const store = new ProjectStore(project)
    const firstPageId = project.pages[0].id
    store.addPage(firstPageId)
    const secondPage = get(store.document).pages[1]
    store.resizePage(secondPage.id, 2400, 1800)
    store.setPageStyle(secondPage.id, { backgroundColor: '#112233', padding: 48 })

    store.addPage(secondPage.id)

    const addedPage = get(store.document).pages[2]
    expect(addedPage).toMatchObject({
      width: 2400,
      height: 1800,
      style: { backgroundColor: '#112233', padding: 48 },
    })
  })

  it('moves or swaps complete frame content in one undoable command', () => {
    const project = createProject('Swap')
    const store = new ProjectStore(project)
    const page = project.pages[0]
    const [first, second] = Object.keys(page.slots)
    store.addAsset({
      id: 'first',
      originalName: 'first.png',
      mediaType: 'image/png',
      byteLength: 1,
      width: 1,
      height: 1,
      sha256: 'first',
      storage: { kind: 'embedded', archivePath: 'assets/first.png' },
    })
    store.addAsset({
      id: 'second',
      originalName: 'second.png',
      mediaType: 'image/png',
      byteLength: 1,
      width: 1,
      height: 1,
      sha256: 'second',
      storage: { kind: 'embedded', archivePath: 'assets/second.png' },
    })
    store.setSlotContent(page.id, first, {
      assetId: 'first',
      placement: { zoom: 1.5, positionX: 0.2, positionY: 0.8 },
    })
    store.setSlotContent(page.id, second, {
      assetId: 'second',
      placement: { zoom: 2, positionX: 0.7, positionY: 0.3 },
    })
    store.moveOrSwapSlots(page.id, first, second)
    expect(get(store.document).pages[0].slots[first]?.assetId).toBe('second')
    expect(get(store.document).pages[0].slots[second]?.placement).toMatchObject({
      zoom: 1.5,
      positionX: 0.2,
    })
    store.undo()
    expect(get(store.document).pages[0].slots[first]?.assetId).toBe('first')
  })

  it('commits crop once and Escape-style cancellation restores the original placement', () => {
    const project = createProject('Crop')
    const store = new ProjectStore(project)
    const page = project.pages[0]
    const slotId = Object.keys(page.slots)[0]
    const original = { zoom: 1, positionX: 0.5, positionY: 0.5 }
    store.addAsset({
      id: 'asset',
      originalName: 'asset.png',
      mediaType: 'image/png',
      byteLength: 1,
      width: 1,
      height: 1,
      sha256: 'asset',
      storage: { kind: 'embedded', archivePath: 'assets/asset.png' },
    })
    store.setSlotContent(page.id, slotId, { assetId: 'asset', placement: original })
    store.previewSlotContent(page.id, slotId, {
      assetId: 'asset',
      placement: { zoom: 2, positionX: 0.2, positionY: 0.7 },
    })
    store.cancelCrop(page.id, slotId, original)
    expect(get(store.document).pages[0].slots[slotId]?.placement).toEqual(original)
    store.previewSlotContent(page.id, slotId, {
      assetId: 'asset',
      placement: { zoom: 2, positionX: 0.2, positionY: 0.7 },
    })
    store.commitCrop(page.id, slotId, original)
    store.undo()
    expect(get(store.document).pages[0].slots[slotId]?.placement).toEqual(original)
  })
})
