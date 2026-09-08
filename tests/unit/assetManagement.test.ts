import { describe, expect, it, vi } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import type { AssetRegistry } from '../../src/lib/render/assetRegistry'
import { ProjectStore } from '../../src/lib/state/projectStore'

const imageValidation = vi.hoisted(() => ({ validate: vi.fn() }))

vi.mock('../../src/lib/domain/importImage', () => ({
  validateImportedImage: imageValidation.validate,
}))

import {
  importProjectAssets,
  relinkProjectAsset,
  replaceProjectAsset,
} from '../../src/lib/app/assetManagement'

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
