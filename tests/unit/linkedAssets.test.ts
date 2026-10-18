import { describe, expect, it, vi } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import type { AssetRecordV1 } from '../../src/lib/domain/types'
import {
  createLinkedProject,
  linkedAssetRecord,
  matchLinkedAssets,
  openLinkedProject,
} from '../../src/lib/persistence/linkedAssets'

async function assetFor(file: File): Promise<AssetRecordV1> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return {
    id: crypto.randomUUID(),
    originalName: 'old.jpg',
    mediaType: 'image/jpeg',
    byteLength: file.size,
    width: 1,
    height: 1,
    sha256: [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
    storage: { kind: 'linked', relativePath: 'old/old.jpg', displayHint: 'old/old.jpg' },
  }
}

function inFolder(file: File, path: string): File {
  Object.defineProperty(file, 'webkitRelativePath', { value: `photos/${path}` })
  return file
}

describe('renamed linked originals', () => {
  it('finds a renamed and moved original after rejecting a same-name file with different bytes', async () => {
    const renamed = inFolder(new File(['original'], 'renamed.jpg'), 'new/renamed.jpg')
    const asset = await assetFor(renamed)
    // Keep the competing file the same size so its hash must be checked.
    const sameSizeWrong = inFolder(new File(['modified'], 'old.jpg'), 'old/old.jpg')
    const wrongRead = vi.spyOn(sameSizeWrong, 'arrayBuffer')
    const matches = await matchLinkedAssets({ [asset.id]: asset }, [renamed, sameSizeWrong])
    expect(wrongRead).toHaveBeenCalledOnce()
    expect(matches.get(asset.id)).toMatchObject({
      file: renamed,
      relativePath: 'new/renamed.jpg',
      sha256: asset.sha256,
    })
    expect(asset.originalName).toBe('old.jpg')
  })

  it('prefers the exact saved path over other identical copies', async () => {
    const copy = inFolder(new File(['original'], 'renamed.jpg'), 'copy/renamed.jpg')
    const basename = inFolder(new File(['original'], 'old.jpg'), 'other/old.jpg')
    const exact = inFolder(new File(['original'], 'old.jpg'), 'old/old.jpg')
    const asset = await assetFor(exact)
    const copyRead = vi.spyOn(copy, 'arrayBuffer')
    const basenameRead = vi.spyOn(basename, 'arrayBuffer')
    const matches = await matchLinkedAssets({ [asset.id]: asset }, [copy, basename, exact])
    expect(matches.get(asset.id)?.file).toBe(exact)
    expect(copyRead).not.toHaveBeenCalled()
    expect(basenameRead).not.toHaveBeenCalled()
  })

  it('does not accept names or sizes without a matching hash', async () => {
    const asset = await assetFor(new File(['original'], 'old.jpg'))
    const wrong = inFolder(new File(['modified'], 'old.jpg'), 'old/old.jpg')
    const matches = await matchLinkedAssets({ [asset.id]: asset }, [wrong])
    expect(matches.size).toBe(0)
  })

  it('writes the new filename and path into JSON without mutating the source project', async () => {
    const file = inFolder(
      new File(['original'], 'renamed.jpg', { lastModified: 1234 }),
      'new/renamed.jpg',
    )
    const asset = await assetFor(file)
    const document = createProject()
    document.assets[asset.id] = asset
    const matches = await matchLinkedAssets(document.assets, [file])
    document.assets[asset.id] = linkedAssetRecord(asset, matches.get(asset.id)!)
    const beforeSave = structuredClone(document)
    const saved = await openLinkedProject(createLinkedProject(document))
    expect(saved.assets[asset.id]).toMatchObject({
      originalName: 'renamed.jpg',
      sha256: asset.sha256,
      storage: {
        kind: 'linked',
        relativePath: 'new/renamed.jpg',
        displayHint: 'new/renamed.jpg',
        lastModified: 1234,
      },
    })
    expect(document).toEqual(beforeSave)
    expect(asset.originalName).toBe('old.jpg')
  })

  it('keeps saved relative paths for linked photos even when originals are unavailable', async () => {
    const asset = await assetFor(new File(['original'], 'old.jpg'))
    const document = createProject()
    document.assets[asset.id] = asset
    const saved = await openLinkedProject(createLinkedProject(document))
    expect(saved.assets[asset.id]).toEqual(asset)
  })
})
