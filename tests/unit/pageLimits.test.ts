import { describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import { createProject } from '../../src/lib/domain/factories'
import { migrateDocument } from '../../src/lib/domain/migrations'
import { ProjectStore } from '../../src/lib/state/projectStore'
import { assertPageDimensions } from '../../src/lib/domain/pageLimits'

describe('page dimension limits', () => {
  it.each([
    [64, 64],
    [16_384, 64],
    [8000, 8000],
  ])('accepts %i × %i', (width, height) => {
    expect(() => assertPageDimensions(width, height)).not.toThrow()
    const document = createProject()
    Object.assign(document.pages[0], { width, height })
    expect(migrateDocument(document).pages[0].width).toBe(width)
  })

  it.each([
    [63, 100],
    [16_385, 100],
    [8001, 8000],
    [Infinity, 100],
    [NaN, 100],
  ])(
    'rejects %i × %i in local edits, import/recovery, and direct installation',
    (width, height) => {
      const document = createProject()
      const store = new ProjectStore(document)
      store.renameProject('Keep my work')
      const before = store.versionedSnapshot()
      expect(() => store.resizePage(document.pages[0].id, width, height)).toThrow()
      expect(store.versionedSnapshot()).toEqual(before)
      expect(get(store.canUndo)).toBe(true)
      store.undo()
      expect(store.snapshot().title).toBe(document.title)
      expect(get(store.canRedo)).toBe(true)
      const clean = store.versionedSnapshot()
      const invalid = structuredClone(document)
      Object.assign(invalid.pages[0], { width, height })
      expect(() => migrateDocument(invalid)).toThrow()
      expect(() => store.replaceDocument(invalid)).toThrow()
      expect(store.versionedSnapshot()).toEqual(clean)
      expect(get(store.canRedo)).toBe(true)
      expect(get(store.isDirty)).toBe(true)
    },
  )

  it('checks rounded dimensions before altering state or history', () => {
    const store = new ProjectStore(createProject())
    const before = store.versionedSnapshot()
    expect(() => store.resizePage(before.document.pages[0].id, 8001.5, 7998.5)).toThrow(
      /megapixels/,
    )
    expect(store.versionedSnapshot()).toEqual(before)
    expect(get(store.canUndo)).toBe(false)
    expect(get(store.isDirty)).toBe(false)
  })
})
