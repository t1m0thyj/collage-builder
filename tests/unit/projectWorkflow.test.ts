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
  let openingPageCount: number | null = null
  return {
    announcements,
    operationProgress: () => operationProgress,
    openingPageCount: () => openingPageCount,
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
      chooseLinkedFolderForSave: async () => null,
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
      setOpeningPages: (pages: unknown[] | null) => (openingPageCount = pages?.length ?? null),
      announce: (message: string) => announcements.push(message),
    },
  }
}

describe('project workflow lifecycle guards', () => {
  it('updates matched filenames in one dirty, undoable edit while preserving page edits', async () => {
    const file = new File(['original'], 'renamed.jpg', { lastModified: 1234 })
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    const document = createProject('Linked original')
    const assetId = crypto.randomUUID()
    document.assets[assetId] = {
      id: assetId,
      originalName: 'old.jpg',
      mediaType: 'image/jpeg',
      byteLength: file.size,
      width: 1,
      height: 1,
      sha256: [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      storage: { kind: 'linked', relativePath: 'old.jpg', displayHint: 'old.jpg' },
    }
    const project = new ProjectStore(document)
    const { host, announcements } = workflowHost(project, { save: vi.fn() })
    const registry = { register: vi.fn(async () => project.renameProject('Concurrent edit')) }
    const missing = vi.fn()
    const controller = new ProjectWorkflowController({
      ...host,
      registry: () => registry as unknown as AssetRegistry,
      pendingLinkedDocument: () => document,
      missingAssetIds: () => new Set([assetId]),
      chooseLinkedFolder: async () => [file] as unknown as FileList,
      setMissingAssetIds: missing,
    })
    await controller.requestLinkedFolder()
    expect(project.snapshot().assets[assetId]).toMatchObject({
      originalName: file.name,
      storage: { relativePath: file.name, lastModified: 1234 },
    })
    expect(project.snapshot().title).toBe('Concurrent edit')
    expect(get(project.isDirty)).toBe(true)
    expect(missing).toHaveBeenCalledWith(new Set())
    expect(announcements).toEqual(['Linked images loaded.'])
    project.undo()
    expect(project.snapshot().assets[assetId]).toEqual(document.assets[assetId])
    expect(project.snapshot().title).toBe('Concurrent edit')
  })

  it('does not clear an edit made while an older revision is being saved', async () => {
    let finishSave: ((format: 'embedded') => void) | undefined
    let startSave: (() => void) | undefined
    const persistence = {
      save: vi.fn(({ onStarted }: { onStarted: () => void }) => {
        startSave = onStarted
        return new Promise<'embedded'>((resolve) => (finishSave = resolve))
      }),
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
      chooseLinkedFolderForSave: async () => null,
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
      setOpeningPages: () => undefined,
      announce: () => undefined,
    })

    const saving = controller.save()
    expect(operationProgress).toBeNull()
    startSave?.()
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
    const startSaves: Array<() => void> = []
    const persistence = {
      save: vi.fn(({ onStarted }: { onStarted: () => void }) => {
        startSaves.push(onStarted)
        return startSaves.length === 1 ? firstSave.promise : secondSave.promise
      }),
    }
    const project = new ProjectStore(createProject('Overlapping saves'))
    project.renameProject('First revision')
    const { host, operationProgress } = workflowHost(project, persistence)
    const controller = new ProjectWorkflowController(host)

    const older = controller.save()
    project.renameProject('Second revision')
    const newer = controller.save()
    startSaves[0]()
    expect(operationProgress()).toBeNull()
    startSaves[1]()
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
    const { host, announcements, operationProgress, openingPageCount } = workflowHost(project, {
      save: vi.fn(),
    })
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
    expect(openingPageCount()).toBeNull()
  })

  it('removes the loading pages when a new project supersedes an open', async () => {
    const pendingOpen = deferred<Awaited<ReturnType<typeof projectIOMocks.openProjectFile>>>()
    projectIOMocks.openProjectFile.mockReturnValueOnce(pendingOpen.promise)
    const project = new ProjectStore(createProject('Original'))
    const { host, operationProgress, openingPageCount } = workflowHost(project, { save: vi.fn() })
    const controller = new ProjectWorkflowController(host)

    const opening = controller.open(new File(['pending'], 'pending.collage'))
    expect(openingPageCount()).toBe(0)
    controller.newProject()
    expect(openingPageCount()).toBeNull()
    expect(operationProgress()).toBeNull()

    pendingOpen.resolve({
      format: 'embedded',
      opened: { document: createProject('Stale file'), assets: new Map(), missingAssetIds: [] },
    })
    await opening
    expect(project.snapshot().title).toBe('Untitled collage')
  })
})
