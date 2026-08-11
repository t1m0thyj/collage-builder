import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import { createArchive, openArchive } from '../../src/lib/persistence/archive'
import { createLinkedProject, openLinkedProject } from '../../src/lib/persistence/linkedAssets'
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

  it('round trips linked projects as plain JSON without image bytes', async () => {
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
      storage: { kind: 'embedded', archivePath: `assets/${assetId}` },
    }
    const file = new File([new Uint8Array(42)], 'dogs.jpg', { type: 'image/jpeg' })
    const linked = createLinkedProject(
      document,
      new Map([[assetId, { file, relativePath: 'dogs/dogs.jpg' }]]),
    )
    expect(linked.type).toBe('application/json')
    expect((await linked.text()).trimStart().startsWith('{')).toBe(true)
    const opened = await openLinkedProject(linked)
    expect(opened.assets[assetId].storage).toMatchObject({
      kind: 'linked',
      relativePath: 'dogs/dogs.jpg',
    })
  })

  it('does not accept linked JSON metadata inside an embedded archive', async () => {
    const document = createProject('Wrong container')
    const assetId = '11111111-1111-4111-8111-111111111111'
    document.assets[assetId] = {
      id: assetId,
      originalName: 'dogs.jpg',
      mediaType: 'image/jpeg',
      byteLength: 42,
      width: 10,
      height: 10,
      sha256: 'a'.repeat(64),
      storage: { kind: 'linked', displayHint: 'dogs.jpg', relativePath: 'dogs.jpg' },
    }
    const archive = new Blob([
      zipSync({
        mimetype: strToU8('application/vnd.collage-builder+zip'),
        'document.json': strToU8(JSON.stringify(document)),
      }),
    ])
    await expect(openArchive(archive)).rejects.toThrow('linked asset metadata')
  })
})
