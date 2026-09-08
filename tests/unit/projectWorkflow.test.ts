import { get } from 'svelte/store'
import { describe, expect, it, vi } from 'vitest'
import { ProjectWorkflowController } from '../../src/lib/app/projectWorkflow'
import { createProject } from '../../src/lib/domain/factories'
import type { AssetRegistry } from '../../src/lib/render/assetRegistry'
import { ProjectStore } from '../../src/lib/state/projectStore'

describe('project workflow lifecycle guards', () => {
  it('does not clear an edit made while an older revision is being saved', async () => {
    let finishSave: ((format: 'embedded') => void) | undefined
    const persistence = {
      save: vi.fn(() => new Promise<'embedded'>((resolve) => (finishSave = resolve))),
    }
    const project = new ProjectStore(createProject('Save race'))
    project.renameProject('Snapshot being saved')
    let operationProgress: string | null = null
    const controller = new ProjectWorkflowController({
      project,
      persistence: persistence as never,
      document: () => project.snapshot(),
      projectTitle: () => project.snapshot().title,
      registry: () => ({}) as AssetRegistry,
      activePage: () => project.snapshot().pages[0],
      isDirty: () => get(project.isDirty),
      recoveredOnly: () => false,
      pendingNavigation: () => null,
      pendingLinkedDocument: () => null,
      missingAssetIds: () => new Set(),
      chooseProject: () => undefined,
      chooseLinkedFolder: async () => null,
      chooseFallbackFormat: async () => null,
      installDocument: async () => true,
      preparePageImages: async () => undefined,
      setPendingNavigation: () => undefined,
      setPendingLinkedDocument: () => undefined,
      setMissingAssetIds: () => undefined,
      setRecoveredOnly: () => undefined,
      setActivePageId: () => undefined,
      setSelectedSlotId: () => undefined,
      setSelectedAssetId: () => undefined,
      setCropModeSlotId: () => undefined,
      setProjectTitle: () => undefined,
      incrementImageRevision: () => undefined,
      setOperationProgress: (message) => (operationProgress = message),
      announce: () => undefined,
    })

    const saving = controller.save()
    expect(operationProgress).toBe('Saving project…')
    project.renameProject('Newer unsaved edit')
    finishSave?.('embedded')

    expect(await saving).toBe(false)
    expect(get(project.isDirty)).toBe(true)
    expect(project.snapshot().title).toBe('Newer unsaved edit')
    expect(operationProgress).toBeNull()
  })
})
