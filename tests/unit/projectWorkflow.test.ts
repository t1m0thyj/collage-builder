import { get } from 'svelte/store'
import { describe, expect, it, vi } from 'vitest'
import { ProjectWorkflowController } from '../../src/lib/app/projectWorkflow'
import { createProject } from '../../src/lib/domain/factories'
import type { AssetRegistry } from '../../src/lib/render/assetRegistry'
import { ProjectStore } from '../../src/lib/state/projectStore'

const projectIOMocks = vi.hoisted(() => ({ openProjectFile: vi.fn() }))

vi.mock('../../src/lib/app/projectIO', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/app/projectIO')>()),
  openProjectFile: projectIOMocks.openProjectFile,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function workflowHost(project: ProjectStore, persistence: { save: ReturnType<typeof vi.fn> }) {
  const announcements: string[] = []
  let operationProgress: string | null = null
  return {
    announcements,
    operationProgress: () => operationProgress,
    host: {
      project,
      persistence: {
        ...persistence,
        reset: vi.fn(),
        setLinkedMatches: vi.fn(),
      } as never,
      document: () => project.snapshot(),
      projectTitle: () => project.snapshot().title,
      registry: () => ({ clear: vi.fn() }) as unknown as AssetRegistry,
      activePage: () => project.snapshot().pages[0],
      isDirty: () => get(project.isDirty),
      recoveredOnly: () => false,
      pendingNavigation: () => null,
      pendingLinkedDocument: () => null,
      missingAssetIds: () => new Set<string>(),
      chooseProject: () => undefined,
      chooseLinkedFolder: async () => null,
      chooseFallbackFormat: async () => null,
      installDocument: async (document) => {
        project.replaceDocument(document)
        return true
      },
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
      setHasSavedProject: () => undefined,
      incrementImageRevision: () => undefined,
      setOperationProgress: (message: string | null) => (operationProgress = message),
      announce: (message: string) => announcements.push(message),
    },
  }
}

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
      setHasSavedProject: () => undefined,
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

  it('keeps edits dirty when saving is cancelled or the destination write fails', async () => {
    const project = new ProjectStore(createProject('Save failure'))
    project.renameProject('Needs preserving')
    const persistence = {
      save: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('The selected file could not be written')),
    }
    const { host, announcements, operationProgress } = workflowHost(project, persistence)
    const controller = new ProjectWorkflowController(host)

    expect(await controller.save()).toBe(false)
    expect(get(project.isDirty)).toBe(true)
    expect(operationProgress()).toBeNull()

    expect(await controller.save()).toBe(false)
    expect(get(project.isDirty)).toBe(true)
    expect(announcements).toContain('The selected file could not be written')
    expect(operationProgress()).toBeNull()
  })

  it('lets a newer save supersede an older pending save without clearing newer edits', async () => {
    const firstSave = deferred<'embedded'>()
    const secondSave = deferred<'embedded'>()
    const persistence = {
      save: vi.fn().mockReturnValueOnce(firstSave.promise).mockReturnValueOnce(secondSave.promise),
    }
    const project = new ProjectStore(createProject('Overlapping saves'))
    project.renameProject('First revision')
    const { host, operationProgress } = workflowHost(project, persistence)
    const controller = new ProjectWorkflowController(host)

    const older = controller.save()
    project.renameProject('Second revision')
    const newer = controller.save()
    firstSave.resolve('embedded')

    expect(await older).toBe(false)
    expect(operationProgress()).toBe('Saving project…')
    expect(get(project.isDirty)).toBe(true)

    secondSave.resolve('embedded')
    expect(await newer).toBe(true)
    expect(project.snapshot().title).toBe('Second revision')
    expect(get(project.isDirty)).toBe(false)
    expect(operationProgress()).toBeNull()
  })

  it('keeps the newer project when overlapping opens finish out of order', async () => {
    const firstOpen = deferred<Awaited<ReturnType<typeof projectIOMocks.openProjectFile>>>()
    const secondOpen = deferred<Awaited<ReturnType<typeof projectIOMocks.openProjectFile>>>()
    projectIOMocks.openProjectFile
      .mockReturnValueOnce(firstOpen.promise)
      .mockReturnValueOnce(secondOpen.promise)

    const project = new ProjectStore(createProject('Current project'))
    const { host, announcements, operationProgress } = workflowHost(project, { save: vi.fn() })
    const controller = new ProjectWorkflowController(host)
    const firstDocument = createProject('First file')
    const secondDocument = createProject('Second file')

    const first = controller.open(new File(['first'], 'first.collage'))
    const second = controller.open(new File(['second'], 'second.collage'))
    secondOpen.resolve({
      format: 'embedded',
      opened: { document: secondDocument, assets: new Map(), missingAssetIds: [] },
    })
    await second
    firstOpen.resolve({
      format: 'embedded',
      opened: { document: firstDocument, assets: new Map(), missingAssetIds: [] },
    })
    await first

    expect(project.snapshot().projectId).toBe(secondDocument.projectId)
    expect(project.snapshot().title).toBe('Second file')
    expect(announcements).toEqual(['Project opened.'])
    expect(operationProgress()).toBeNull()
  })
})
