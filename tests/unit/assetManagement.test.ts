import { describe, expect, it, vi } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import type { AssetRegistry } from '../../src/lib/render/assetRegistry'
import { ProjectStore } from '../../src/lib/state/projectStore'

const imageValidation = vi.hoisted(() => ({ validate: vi.fn() }))

vi.mock('../../src/lib/domain/importImage', () => ({
  validateImportedImage: imageValidation.validate,
}))

import {
  assetUsageCounts,
  filterAssets,
  importProjectAssets,
  relinkMissingProjectAssets,
  relinkProjectAsset,
  replaceProjectAsset,
} from '../../src/lib/app/assetManagement'

describe('asset usage counts', () => {
  it('counts page placements once and reuses the result when filtering and sorting', () => {
    const document = createProject('Usage')
    const [firstSlot, secondSlot] = Object.keys(document.pages[0].slots)
    document.assets.first = {
      id: 'first',
      originalName: 'first.png',
      mediaType: 'image/png',
      byteLength: 1,
      width: 1,
      height: 1,
      sha256: 'first',
      storage: { kind: 'embedded', archivePath: 'assets/first.png' },
    }
    document.assets.second = { ...document.assets.first, id: 'second', originalName: 'second.png' }
    document.pages[0].slots[firstSlot] = {
      assetId: 'first',
      placement: { zoom: 1, positionX: 0.5, positionY: 0.5 },
    }
    document.pages[0].slots[secondSlot] = {
      assetId: 'first',
      placement: { zoom: 1, positionX: 0.5, positionY: 0.5 },
    }
    const counts = assetUsageCounts(document)

    expect(counts).toEqual(new Map([['first', 2]]))
    expect(
      filterAssets(
        document,
        Object.values(document.assets),
        '',
        'all',
        'usage',
        new Set(),
        counts,
      ).map((asset) => asset.id),
    ).toEqual(['first', 'second'])
  })
})

describe('asset operation lifecycle guards', () => {
  it('does not commit an import after its original project is replaced', async () => {
    const original = createProject('Original')
    const replacement = createProject('Replacement')
    const project = new ProjectStore(original)
    const version = project.versionedSnapshot()
    let finishRegistration: (() => void) | undefined
    const registration = new Promise<void>((resolve) => (finishRegistration = resolve))
    const asset = {
      id: '11111111-1111-4111-8111-111111111111',
      originalName: 'late.png',
      mediaType: 'image/png' as const,
      byteLength: 4,
      width: 1,
      height: 1,
      sha256: 'a'.repeat(64),
      storage: { kind: 'embedded' as const, archivePath: 'assets/late.png' },
    }
    imageValidation.validate.mockResolvedValue({
      asset,
      file: new File(['late'], 'late.png', { type: 'image/png' }),
      displayBlob: undefined,
    })
    const registry = {
      register: vi.fn(async (...args: unknown[]) => {
        await registration
        return (args.at(-1) as () => boolean)()
      }),
      release: vi.fn(),
    } as unknown as AssetRegistry
    const files = {
      length: 1,
      *[Symbol.iterator]() {
        yield new File(['late'], 'late.png', { type: 'image/png' })
      },
    } as FileList
    const isCurrent = () => project.isCurrentProject(version)

    const importing = importProjectAssets(files, version.document, registry, project, isCurrent)
    await vi.waitFor(() => expect(registry.register).toHaveBeenCalled())
    project.replaceDocument(replacement)
    finishRegistration?.()

    expect(await importing).toMatchObject({ added: 0, processed: 1 })
    expect(project.snapshot().projectId).toBe(replacement.projectId)
    expect(project.snapshot().assets).toEqual({})
  })

  it('returns one batch summary with successful files and named failures', async () => {
    const document = createProject('Batch summary')
    const project = new ProjectStore(document)
    const asset = {
      id: '22222222-2222-4222-8222-222222222222',
      originalName: 'good.png',
      mediaType: 'image/png' as const,
      byteLength: 4,
      width: 1,
      height: 1,
      sha256: 'b'.repeat(64),
      storage: { kind: 'embedded' as const, archivePath: 'assets/good.png' },
    }
    imageValidation.validate
      .mockResolvedValueOnce({
        asset,
        file: new File(['good'], 'good.png', { type: 'image/png' }),
        displayBlob: undefined,
      })
      .mockRejectedValueOnce(new Error('Unsupported image format'))
    const registry = {
      register: vi.fn(async () => true),
      release: vi.fn(),
    } as unknown as AssetRegistry
    const selected = [
      new File(['good'], 'good.png', { type: 'image/png' }),
      new File(['bad'], 'bad.txt', { type: 'text/plain' }),
    ]
    const files = {
      length: selected.length,
      *[Symbol.iterator]() {
        yield* selected
      },
    } as FileList
    const progress = vi.fn()

    const result = await importProjectAssets(
      files,
      document,
      registry,
      project,
      () => true,
      progress,
    )

    expect(result).toMatchObject({ phase: 'complete', total: 2, added: 1, skipped: 1 })
    expect(result.issues).toEqual([{ fileName: 'bad.txt', message: 'Unsupported image format' }])
    expect(result.importedAssetIds).toEqual([asset.id])
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ processed: 2, added: 1, skipped: 1 })
  })

  it('commits a successful multi-file import as one undo entry', async () => {
    const document = createProject('Batch history')
    const project = new ProjectStore(document)
    const selected = ['one', 'two'].map(
      (name) => new File([name], `${name}.png`, { type: 'image/png' }),
    )
    imageValidation.validate.mockImplementation(async (file: File) => ({
      asset: {
        id: file.name,
        originalName: file.name,
        mediaType: 'image/png' as const,
        byteLength: file.size,
        width: 1,
        height: 1,
        sha256: file.name,
        storage: { kind: 'embedded' as const, archivePath: `assets/${file.name}` },
      },
      file,
      displayBlob: undefined,
    }))
    const registry = {
      register: vi.fn(async () => true),
      release: vi.fn(),
    } as unknown as AssetRegistry
    const files = {
      length: selected.length,
      *[Symbol.iterator]() {
        yield* selected
      },
    } as FileList

    await importProjectAssets(files, document, registry, project)

    expect(Object.keys(project.snapshot().assets)).toHaveLength(2)
    expect(project.historySnapshots()).toHaveLength(1)
    project.undo()
    expect(project.snapshot().assets).toEqual({})
  })

  it('bulk relinks exact matches first and confirms metadata suggestions', async () => {
    const document = createProject('Missing photos')
    const exactId = '11111111-1111-4111-8111-111111111111'
    const suggestedId = '22222222-2222-4222-8222-222222222222'
    document.assets[exactId] = {
      id: exactId,
      originalName: 'exact.png',
      mediaType: 'image/png',
      byteLength: 5,
      width: 10,
      height: 20,
      sha256: 'exact-hash',
      storage: { kind: 'embedded', archivePath: `assets/${exactId}.png` },
    }
    document.assets[suggestedId] = {
      id: suggestedId,
      originalName: 'suggested.png',
      mediaType: 'image/png',
      byteLength: 9,
      width: 30,
      height: 40,
      sha256: 'old-hash',
      storage: { kind: 'embedded', archivePath: `assets/${suggestedId}.png` },
    }
    const exactFile = new File(['exact'], 'renamed.png', { type: 'image/png' })
    const suggestedFile = new File(['different'], 'suggested.png', { type: 'image/png' })
    imageValidation.validate
      .mockResolvedValueOnce({
        asset: { ...document.assets[exactId], id: 'candidate-exact' },
        file: exactFile,
        displayBlob: undefined,
      })
      .mockResolvedValueOnce({
        asset: {
          ...document.assets[suggestedId],
          id: 'candidate-suggested',
          sha256: 'new-hash',
        },
        file: suggestedFile,
        displayBlob: undefined,
      })
    const registry = {
      register: vi.fn(async () => true),
      release: vi.fn(),
    } as unknown as AssetRegistry
    const files = {
      length: 2,
      *[Symbol.iterator]() {
        yield exactFile
        yield suggestedFile
      },
    } as FileList
    const confirmSuggestion = vi.fn(() => true)
    const project = new ProjectStore(document)

    const result = await relinkMissingProjectAssets(
      files,
      [exactId, suggestedId],
      document,
      registry,
      project,
      confirmSuggestion,
    )

    expect(result).toEqual({
      relinkedAssetIds: [exactId, suggestedId],
      unmatchedAssetIds: [],
      issues: [],
    })
    expect(confirmSuggestion).toHaveBeenCalledOnce()
    expect(project.snapshot().assets[suggestedId].sha256).toBe('new-hash')
    expect(project.historySnapshots()).toHaveLength(1)
    project.undo()
    expect(project.snapshot().assets[suggestedId].sha256).toBe('old-hash')
  })

  it('does not commit a bulk relink when candidate registration fails', async () => {
    const document = createProject('Failed relink')
    const assetIds = ['first', 'second']
    assetIds.forEach((id) => {
      document.assets[id] = {
        id,
        originalName: `${id}.png`,
        mediaType: 'image/png',
        byteLength: 1,
        width: 1,
        height: 1,
        sha256: `${id}-hash`,
        storage: { kind: 'embedded', archivePath: `assets/${id}.png` },
      }
    })
    const selected = assetIds.map((id) => new File([id], `${id}.png`, { type: 'image/png' }))
    imageValidation.validate.mockImplementation(async (file: File) => {
      const id = file.name.replace('.png', '')
      return {
        asset: { ...document.assets[id], id: `candidate-${id}` },
        file,
        displayBlob: undefined,
      }
    })
    const registry = {
      register: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('decode failed')),
      release: vi.fn(),
    } as unknown as AssetRegistry
    const files = {
      length: selected.length,
      *[Symbol.iterator]() {
        yield* selected
      },
    } as FileList
    const project = new ProjectStore(document)

    await expect(
      relinkMissingProjectAssets(files, assetIds, document, registry, project, () => false),
    ).rejects.toThrow('decode failed')

    expect(registry.release).toHaveBeenCalledWith('first')
    expect(project.historySnapshots()).toHaveLength(0)
    expect(project.snapshot().assets).toEqual(document.assets)
  })

  it.each(['replacement', 'relinking'] as const)(
    'does not commit %s after its project is switched',
    async (operation) => {
      const original = createProject('Original')
      const replacement = createProject('Replacement')
      const target = '11111111-1111-4111-8111-111111111111'
      original.assets[target] = {
        id: target,
        originalName: 'original.png',
        mediaType: 'image/png',
        byteLength: 4,
        width: 1,
        height: 1,
        sha256: 'a'.repeat(64),
        storage: { kind: 'embedded', archivePath: `assets/${target}` },
      }
      const project = new ProjectStore(original)
      const version = project.versionedSnapshot()
      let finishRegistration: (() => void) | undefined
      const registration = new Promise<void>((resolve) => (finishRegistration = resolve))
      const validatedAsset = {
        ...original.assets[target],
        id: '22222222-2222-4222-8222-222222222222',
        originalName: 'new.png',
      }
      imageValidation.validate.mockResolvedValue({
        asset: validatedAsset,
        file: new File(['new'], 'new.png', { type: 'image/png' }),
        displayBlob: undefined,
      })
      const registry = {
        retain: vi.fn(),
        register: vi.fn(async () => {
          await registration
          return true
        }),
      } as unknown as AssetRegistry
      const isCurrent = () => project.isCurrentProject(version)
      const pending =
        operation === 'replacement'
          ? replaceProjectAsset(
              new File(['new'], 'new.png', { type: 'image/png' }),
              target,
              version.document,
              registry,
              project,
              isCurrent,
            )
          : relinkProjectAsset(
              new File(['new'], 'new.png', { type: 'image/png' }),
              target,
              version.document,
              registry,
              project,
              () => true,
              isCurrent,
            )

      await vi.waitFor(() => expect(registry.register).toHaveBeenCalled())
      project.replaceDocument(replacement)
      finishRegistration?.()

      expect(await pending).toBe(false)
      expect(project.snapshot().projectId).toBe(replacement.projectId)
      expect(project.snapshot().assets).toEqual({})
    },
  )
})
