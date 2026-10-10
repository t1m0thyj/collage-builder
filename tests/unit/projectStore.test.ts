import { get } from 'svelte/store'
import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import { ProjectStore } from '../../src/lib/state/projectStore'
import { layout4Presets } from '../../src/lib/layouts/definitions/4'
import { layout3Presets } from '../../src/lib/layouts/definitions/3'

describe('project history', () => {
  it('preserves unchanged pages and assets while keeping Undo snapshots immutable', () => {
    const store = new ProjectStore(createProject())
    store.addPage()
    const before = get(store.document)
    const pageId = before.pages[0].id
    const padding = before.pages[0].style.padding
    store.setPageStyle(pageId, { padding: padding + 5 })
    const after = get(store.document)
    expect(after.pages[1]).toBe(before.pages[1])
    expect(after.assets).toBe(before.assets)
    expect(before.pages[0].style.padding).toBe(padding)
    expect(after.pages[0]).not.toBe(before.pages[0])
    store.undo()
    expect(get(store.document)).toBe(before)
    store.redo()
    expect(get(store.document)).toBe(after)
  })

  it('does not invalidate history retention on ordinary edits or slider previews', () => {
    const store = new ProjectStore(createProject())
    const pageId = get(store.document).pages[0].id
    const revision = store.historyRetentionRevision
    store.renameProject('Edited')
    store.previewPageStyle(pageId, 'padding', { padding: 17 })
    store.previewPageStyle(pageId, 'padding', { padding: 18 })
    store.commitPageStyle(pageId, 'padding')
    expect(store.historyRetentionRevision).toBe(revision)
    store.undo()
    store.renameProject('New branch')
    expect(store.historyRetentionRevision).toBeGreaterThan(revision)
  })

  it('only changes pages using a removed asset and restores their content through Undo', () => {
    const store = new ProjectStore(createProject())
    store.addPage()
    store.addAsset({
      id: 'photo',
      originalName: 'photo.png',
      mediaType: 'image/png',
      width: 1,
      height: 1,
      byteLength: 1,
      sha256: 'photo',
      storage: { kind: 'embedded', archivePath: 'assets/photo' },
    })
    const page = get(store.document).pages[0]
    const slot = Object.keys(page.slots)[0]
    store.assignAsset(page.id, slot, 'photo')
    const before = get(store.document)
    store.removeAsset('photo')
    expect(before.pages[0].slots[slot]?.assetId).toBe('photo')
    expect(get(store.document).pages[1]).toBe(before.pages[1])
    expect(get(store.document).pages[0].slots[slot]).toBeNull()
    store.undo()
    expect(get(store.document)).toBe(before)
  })

  it('does not mark an unchanged project title as a new edit', () => {
    const store = new ProjectStore(createProject('Already saved'))
    const saved = store.versionedSnapshot()

    store.renameProject(' Already saved ')

    expect(store.isCurrentVersion(saved)).toBe(true)
    expect(get(store.isDirty)).toBe(false)
    expect(get(store.canUndo)).toBe(false)
  })

  it('keeps project and page names within the format limit', () => {
    const store = new ProjectStore(createProject())
    const pageId = store.snapshot().pages[0].id

    expect(() => store.renameProject('a'.repeat(201))).toThrow('200 characters')
    expect(() => store.renamePage(pageId, 'b'.repeat(201))).toThrow('200 characters')
    store.renameProject('a'.repeat(200))
    store.renamePage(pageId, 'b'.repeat(200))
    store.duplicatePage(pageId)

    expect(store.snapshot().title).toHaveLength(200)
    expect(store.snapshot().pages[1].name).toHaveLength(200)
  })

  it('only marks the exact saved revision clean', () => {
    const store = new ProjectStore(createProject('Revision guard'))
    store.renameProject('First edit')
    const saving = store.versionedSnapshot()
    store.renameProject('Edit made while saving')

    expect(store.markClean(saving)).toBe(false)
    expect(get(store.isDirty)).toBe(true)

    expect(store.markClean(store.versionedSnapshot())).toBe(true)
    expect(get(store.isDirty)).toBe(false)
  })

  it('changes layouts transactionally and restores them through undo/redo', () => {
    const project = createProject('Original')
    const store = new ProjectStore(project)
    const pageId = project.pages[0].id
    store.renameProject('Updated')
    store.changeLayout(pageId, layout4Presets[0])
    expect(get(store.document).pages[0].layout.presetId).toBe(layout4Presets[0].id)
    expect(get(store.canUndo)).toBe(true)
    store.undo()
    expect(get(store.document).pages[0].layout.presetId).toBe(project.pages[0].layout.presetId)
    store.redo()
    expect(get(store.document).title).toBe('Updated')
  })

  it('equalizes every sibling in a split as one undoable edit', () => {
    const project = createProject('Even split')
    const store = new ProjectStore(project)
    const pageId = project.pages[0].id
    store.changeLayout(pageId, layout3Presets[0])
    store.markClean(store.versionedSnapshot())
    const saved = store.versionedSnapshot()

    store.equalizeSplit(pageId, [])
    expect(store.isCurrentVersion(saved)).toBe(true)
    expect(get(store.isDirty)).toBe(false)

    store.adjustDivider(pageId, [], 0, 0.45)
    const uneven = store.snapshot().pages[0].layout.root
    expect(uneven.kind).toBe('split')
    if (uneven.kind !== 'split') return
    expect(uneven.weights[0]).toBeGreaterThan(uneven.weights[1])

    store.equalizeSplit(pageId, [])
    const even = store.snapshot().pages[0].layout.root
    expect(even.kind).toBe('split')
    if (even.kind !== 'split') return
    expect(even.weights).toEqual([1 / 3, 1 / 3, 1 / 3])
    store.undo()
    expect(store.snapshot().pages[0].layout.root).toEqual(uneven)
  })

  it('coalesces each continuous page-style interaction without merging controls', () => {
    const project = createProject('Style history')
    const store = new ProjectStore(project)
    const pageId = project.pages[0].id
    const originalPadding = project.pages[0].style.padding
    const originalGap = project.pages[0].style.gap

    for (let padding = originalPadding + 1; padding <= originalPadding + 10; padding += 1)
      store.previewPageStyle(pageId, 'padding', { padding })
    store.commitPageStyle(pageId, 'padding')

    for (let gap = originalGap + 1; gap <= originalGap + 10; gap += 1)
      store.previewPageStyle(pageId, 'gap', { gap })
    store.commitPageStyle(pageId, 'gap')

    expect(store.historySnapshots()).toHaveLength(2)
    expect(store.snapshot().pages[0].style).toMatchObject({
      padding: originalPadding + 10,
      gap: originalGap + 10,
    })

    store.undo()
    expect(store.snapshot().pages[0].style).toMatchObject({
      padding: originalPadding + 10,
      gap: originalGap,
    })
    store.undo()
    expect(store.snapshot().pages[0].style).toMatchObject({
      padding: originalPadding,
      gap: originalGap,
    })
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

  it('adds several imported assets as one undoable command', () => {
    const store = new ProjectStore(createProject('Batch import'))
    const assets = ['first', 'second'].map((id) => ({
      id,
      originalName: `${id}.png`,
      mediaType: 'image/png' as const,
      byteLength: 1,
      width: 1,
      height: 1,
      sha256: id,
      storage: { kind: 'embedded' as const, archivePath: `assets/${id}.png` },
    }))

    store.addAssets(assets)

    expect(Object.keys(store.snapshot().assets)).toEqual(['first', 'second'])
    expect(store.historySnapshots()).toHaveLength(1)
    store.undo()
    expect(store.snapshot().assets).toEqual({})
  })

  it('reorders pages by insertion point as one undoable command', () => {
    const document = createProject('Page order')
    const store = new ProjectStore(document)
    store.addPage(document.pages[0].id)
    store.addPage(store.snapshot().pages[1].id)
    const before = store.snapshot().pages.map((page) => page.id)

    store.reorderPage(before[0], 3)

    expect(store.snapshot().pages.map((page) => page.id)).toEqual([before[1], before[2], before[0]])
    store.undo()
    expect(store.snapshot().pages.map((page) => page.id)).toEqual(before)
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

  it('removes several assets as one undoable command', () => {
    const document = createProject()
    const page = document.pages[0]
    const assetIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]
    assetIds.forEach((id, index) => {
      document.assets[id] = {
        id,
        originalName: `${index}.png`,
        mediaType: 'image/png',
        byteLength: 1,
        width: 1,
        height: 1,
        sha256: String(index).repeat(64),
        storage: { kind: 'embedded', archivePath: `assets/${id}` },
      }
      page.slots[Object.keys(page.slots)[index]] = {
        assetId: id,
        placement: { zoom: 1, positionX: 0.5, positionY: 0.5 },
      }
    })
    const store = new ProjectStore(document)
    store.removeAssets(assetIds)
    expect(Object.keys(store.snapshot().assets)).toHaveLength(0)
    store.undo()
    expect(Object.keys(store.snapshot().assets)).toHaveLength(2)
  })

  it('can evict the oldest undo snapshot when its retained resources exceed their budget', () => {
    const document = createProject('Retention')
    const assetId = '11111111-1111-4111-8111-111111111111'
    document.assets[assetId] = {
      id: assetId,
      originalName: 'original.png',
      mediaType: 'image/png',
      byteLength: 50 * 1024 * 1024,
      width: 1,
      height: 1,
      sha256: '0'.repeat(64),
      storage: { kind: 'embedded', archivePath: `assets/${assetId}` },
    }
    const store = new ProjectStore(document)
    for (let index = 1; index <= 6; index += 1)
      store.replaceAsset(assetId, {
        ...document.assets[assetId],
        sha256: String(index).repeat(64),
      })

    expect(store.historySnapshots()).toHaveLength(6)
    expect(store.discardOldestUndo()).toBe(true)
    expect(store.historySnapshots()[0].assets[assetId].sha256).toBe('1'.repeat(64))
    expect(get(store.canUndo)).toBe(true)
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
