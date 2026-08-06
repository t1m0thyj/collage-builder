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
    store.changeLayout(pageId, 'grid-2x2')
    expect(get(store.document).pages[0].layout.presetId).toBe('grid-2x2')
    expect(get(store.canUndo)).toBe(true)
    store.undo()
    expect(get(store.document).pages[0].layout.presetId).toBe('feature-right')
    store.redo()
    expect(get(store.document).title).toBe('Updated')
  })
})
