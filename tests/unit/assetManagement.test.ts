import { describe, expect, it, vi } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import type { AssetRegistry } from '../../src/lib/render/assetRegistry'
import { ProjectStore } from '../../src/lib/state/projectStore'

const imageValidation = vi.hoisted(() => ({ validate: vi.fn() }))

vi.mock('../../src/lib/domain/importImage', () => ({
  validateImportedImage: imageValidation.validate,
}))

import { importProjectAssets } from '../../src/lib/app/assetManagement'

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

    const importing = importProjectAssets(
      files,
      version.document,
      registry,
      project,
      vi.fn(),
      isCurrent,
    )
    await vi.waitFor(() => expect(registry.register).toHaveBeenCalled())
    project.replaceDocument(replacement)
    finishRegistration?.()

    expect(await importing).toBe(0)
    expect(project.snapshot().projectId).toBe(replacement.projectId)
    expect(project.snapshot().assets).toEqual({})
  })
})
