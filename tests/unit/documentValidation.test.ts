import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { get } from 'svelte/store'
import { createProject, createPage } from '../../src/lib/domain/factories'
import { migrateDocument } from '../../src/lib/domain/migrations'
import {
  assertDocumentStructure,
  maxDocumentValues,
  maxProjectPages,
  maxPolygonPoints,
} from '../../src/lib/domain/documentLimits'
import { resolveLayout, resolveDividers } from '../../src/lib/domain/geometry'
import { pageSpacingLimits } from '../../src/lib/domain/pageStyle'
import { ProjectStore } from '../../src/lib/state/projectStore'
import { openLinkedProject } from '../../src/lib/persistence/linkedAssets'
import { openArchive, collageMimeType } from '../../src/lib/persistence/archive'
import { maxProjectAssetCount, maxProjectBytes } from '../../src/lib/persistence/limits'
import type { AssetRecordV1, LayoutNodeV1 } from '../../src/lib/domain/types'

function asset(id = crypto.randomUUID(), byteLength = 1): AssetRecordV1 {
  return {
    id,
    byteLength,
    originalName: 'photo.png',
    mediaType: 'image/png',
    width: 1,
    height: 1,
    sha256: 'a'.repeat(64),
    storage: { kind: 'linked', displayHint: 'photo.png', relativePath: 'photo.png' },
  }
}

describe('untrusted document validation', () => {
  it('rejects deeply nested input before recursive parsing', () => {
    const document = createProject()
    let root: LayoutNodeV1 = { kind: 'leaf', slotId: crypto.randomUUID() }
    for (let index = 0; index < 1800; index++)
      root = {
        kind: 'split',
        axis: 'x',
        weights: [1, 1],
        children: [root, { kind: 'leaf', slotId: crypto.randomUUID() }],
      }
    document.pages[0].layout.root = root
    expect(() => migrateDocument(document)).toThrow(
      'Project structure exceeds supported complexity',
    )
  })
  it('bounds wide/sparse input and cycles without recursion', () => {
    expect(() => assertDocumentStructure(new Array(maxDocumentValues + 1))).toThrow(/complexity/)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => assertDocumentStructure(cyclic)).toThrow(/cyclic/)
  })
  it('bounds pages, frames, and polygon vertices', () => {
    const document = createProject()
    document.pages = Array.from({ length: maxProjectPages + 1 }, () => createPage())
    expect(() => migrateDocument(document)).toThrow()
    document.pages = [createPage()]
    const page = document.pages[0]
    const id = Object.keys(page.slots)[0]
    page.layout.root = {
      kind: 'leaf',
      slotId: id,
      polygon: Array.from({ length: maxPolygonPoints + 1 }, () => ({ x: 0, y: 0 })),
    }
    expect(() => migrateDocument(document)).toThrow()
    const leaves = Array.from({ length: 257 }, () => ({
      kind: 'leaf' as const,
      slotId: crypto.randomUUID(),
    }))
    page.layout.root = { kind: 'split', axis: 'x', weights: leaves.map(() => 1), children: leaves }
    expect(() => migrateDocument(document)).toThrow()
  })
  it('rejects mismatched asset identity and missing references', () => {
    const document = createProject()
    document.assets[crypto.randomUUID()] = asset()
    expect(() => migrateDocument(document)).toThrow('Photo map keys must match photo IDs')
    document.assets = {}
    document.pages[0].slots[Object.keys(document.pages[0].slots)[0]] = {
      assetId: crypto.randomUUID(),
      placement: { zoom: 1, positionX: 0.5, positionY: 0.5 },
    }
    expect(() => migrateDocument(document)).toThrow('missing asset')
  })
  it('rejects grid cells outside their container through all parsers', async () => {
    const document = createProject()
    const page = document.pages[0]
    const id = Object.keys(page.slots)[0]
    page.layout.root = {
      kind: 'grid',
      columns: 1,
      rows: 1,
      cells: [{ slotId: id, x: 99, y: 99, width: 1, height: 1 }],
    }
    page.slots = { [id]: null }
    expect(() => migrateDocument(document)).toThrow('Grid cells must stay inside their grid')
    await expect(openLinkedProject(new Blob([JSON.stringify(document)]))).rejects.toThrow(
      'Grid cells must stay inside their grid',
    )
    await expect(
      openArchive(
        new Blob([
          zipSync({
            mimetype: strToU8(collageMimeType),
            'document.json': strToU8(JSON.stringify(document)),
          }),
        ]),
      ),
    ).rejects.toThrow('Grid cells must stay inside their grid')
  })
  it('applies photo count and byte limits to linked imports and recovery parsing', async () => {
    const document = createProject()
    for (let index = 0; index <= maxProjectAssetCount; index++) {
      const record = asset()
      document.assets[record.id] = record
    }
    expect(() => migrateDocument(document)).toThrow(/photos/)
    await expect(openLinkedProject(new Blob([JSON.stringify(document)]))).rejects.toThrow(/photos/)
    const first = asset(crypto.randomUUID(), maxProjectBytes)
    const second = asset()
    document.assets = { [first.id]: first, [second.id]: second }
    expect(() => migrateDocument(document)).toThrow('1 GB safety limit')
    await expect(openLinkedProject(new Blob([JSON.stringify(document)]))).rejects.toThrow(
      '1 GB safety limit',
    )
  })
  it('normalizes large finite weights and rejects underflowed empty frames', () => {
    const document = createProject()
    const root = document.pages[0].layout.root
    if (root.kind !== 'split') throw new Error('Fixture requires a split')
    root.weights = root.weights.map(() => 1e308)
    const parsed = migrateDocument(document)
    expect(
      resolveLayout(parsed.pages[0]).every((frame) => frame.width > 0 && frame.height > 0),
    ).toBe(true)
    expect(resolveDividers(parsed.pages[0]).every((divider) => Number.isFinite(divider.y))).toBe(
      true,
    )
    root.weights[0] = Number.MIN_VALUE
    expect(() => migrateDocument(document)).toThrow(/empty/)
  })
})

describe('atomic style editing', () => {
  it('rejects the small-page margin reproduction and derives usable limits', () => {
    const document = createProject()
    Object.assign(document.pages[0], { width: 256, height: 256 })
    const store = new ProjectStore(document)
    const before = store.versionedSnapshot()
    expect(pageSpacingLimits(document.pages[0])).toEqual({ padding: 97, gap: 97 })
    expect(() => store.setPageStyle(document.pages[0].id, { padding: 120 })).toThrow()
    expect(() =>
      store.previewPageStyle(document.pages[0].id, 'padding', { padding: 120 }),
    ).toThrow()
    store.commitPageStyle(document.pages[0].id, 'padding')
    expect(store.versionedSnapshot()).toEqual(before)
    expect(get(store.canUndo)).toBe(false)
    expect(get(store.isDirty)).toBe(false)
  })
  it('keeps an existing gesture intact when a preview or discrete edit is rejected', () => {
    const store = new ProjectStore(createProject())
    const id = store.snapshot().pages[0].id
    store.previewPageStyle(id, 'padding', { padding: 35 })
    const before = store.versionedSnapshot()
    expect(() => store.previewPageStyle(id, 'gap', { gap: 5000 })).toThrow()
    expect(() => store.setPageStyle(id, { gap: 5000 })).toThrow()
    expect(store.versionedSnapshot()).toEqual(before)
    expect(get(store.canUndo)).toBe(false)
    store.commitPageStyle(id, 'padding')
    store.undo()
    expect(store.snapshot().pages[0].style.padding).toBe(30)
    expect(get(store.canUndo)).toBe(false)
    store.redo()
    expect(store.snapshot().pages[0].style.padding).toBe(35)
  })
})
