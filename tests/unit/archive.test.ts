import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import { createArchive, openArchive } from '../../src/lib/persistence/archive'
import { zipSync, strToU8 } from 'fflate'

describe('collage archive', () => {
  it('round trips a document', async () => {
    const document = createProject('Archive test')
    const archive = await createArchive(document, { get: () => undefined })
    const opened = await openArchive(archive)
    expect(opened.document.title).toBe('Archive test')
    expect(opened.document.projectId).toBe(document.projectId)
  })

  it('rejects unsafe archive paths', async () => {
    const archive = new Blob([
      zipSync({
        mimetype: strToU8('application/vnd.collage-builder+zip'),
        'document.json': strToU8('{}'),
        '../unsafe': strToU8('x'),
      }),
    ])
    await expect(openArchive(archive)).rejects.toThrow('unsafe path')
  })

  it('writes a compact linked project without image bytes', async () => {
    const document = createProject('Linked test')
    const assetId = '11111111-1111-4111-8111-111111111111'
    document.assets[assetId] = {
      id: assetId,
      originalName: 'dogs.jpg',
      mediaType: 'image/jpeg',
      byteLength: 42,
      width: 10,
      height: 10,
      sha256: 'a'.repeat(64),
      storage: {
        kind: 'linked',
        displayHint: 'dogs/dogs.jpg',
        relativePath: 'dogs/dogs.jpg',
      },
    }
    const archive = await createArchive(document, { get: () => undefined }, 'linked')
    const opened = await openArchive(archive)
    expect(opened.assets).toHaveLength(0)
    expect(opened.document.assets[assetId].storage).toMatchObject({
      kind: 'linked',
      relativePath: 'dogs/dogs.jpg',
    })
  })
})
