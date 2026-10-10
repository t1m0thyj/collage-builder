import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import { createArchive, openArchive, prepareArchive } from '../../src/lib/persistence/archive'
import { createLinkedProject, openLinkedProject } from '../../src/lib/persistence/linkedAssets'
import { writeEmbeddedProject } from '../../src/lib/app/projectIO'
import { zipSync, strToU8 } from 'fflate'
import { createHash, randomUUID } from 'node:crypto'

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('collage archive', () => {
  it('round trips a document', async () => {
    const document = createProject('Archive test')
    const archive = await createArchive(document, { get: () => undefined })
    const opened = await openArchive(archive)
    expect(opened.document.title).toBe('Archive test')
    expect(opened.document.projectId).toBe(document.projectId)
  })

  it('reopens an archive with 499 distinct photos', async () => {
    const document = createProject('Large collection')
    const blobs = new Map<string, Blob>()
    for (let index = 0; index < 499; index += 1) {
      const id = randomUUID()
      const bytes = new Uint8Array([index & 255, index >> 8])
      blobs.set(id, new Blob([bytes], { type: 'image/png' }))
      document.assets[id] = {
        id,
        originalName: `${index}.png`,
        mediaType: 'image/png',
        byteLength: bytes.length,
        width: 1,
        height: 1,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        storage: { kind: 'embedded', archivePath: `assets/${id}` },
      }
    }

    const archive = await createArchive(document, { get: (id) => blobs.get(id) })
    const reopened = await openArchive(archive)
    expect(reopened.assets.size).toBe(499)
    expect(reopened.missingAssetIds).toEqual([])
  })

  it('keeps original HEIC bytes and media type in an embedded project', async () => {
    const document = createProject('HEIC archive test')
    const assetId = '11111111-1111-4111-8111-111111111111'
    const original = new Blob(
      [new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99])],
      {
        type: 'image/heic',
      },
    )
    document.assets[assetId] = {
      id: assetId,
      originalName: 'IMG_1234.HEIC',
      mediaType: 'image/heic',
      byteLength: original.size,
      width: 12,
      height: 8,
      sha256: await sha256(original),
      storage: { kind: 'embedded', archivePath: `assets/${assetId}.heic` },
    }
    const archive = await createArchive(document, { get: () => original })
    const opened = await openArchive(archive)
    const restored = opened.assets.get(assetId)
    expect(opened.document.assets[assetId].mediaType).toBe('image/heic')
    expect(restored?.type).toBe('image/heic')
    expect(new Uint8Array(await restored!.arrayBuffer())).toEqual(
      new Uint8Array(await original.arrayBuffer()),
    )
  })

  it('streams a prepared archive to a native handle before committing it', async () => {
    const document = createProject('Native stream')
    const assetId = '11111111-1111-4111-8111-111111111111'
    const original = new Blob([new Uint8Array(300_000).fill(23)], { type: 'image/jpeg' })
    document.assets[assetId] = {
      id: assetId,
      originalName: 'photo.jpg',
      mediaType: 'image/jpeg',
      byteLength: original.size,
      width: 1,
      height: 1,
      sha256: await sha256(original),
      storage: { kind: 'embedded', archivePath: `assets/${assetId}` },
    }
    const prepared = prepareArchive(document, {
      get: () => original,
      hasActive: () => true,
    })
    const chunks: Uint8Array[] = []
    let closed = false
    let receivedBeforeClose = 0
    const handle = {
      name: 'native.collage',
      async createWritable(options?: FileSystemCreateWritableOptions) {
        expect(options?.keepExistingData).toBe(false)
        return {
          async write(chunk: Uint8Array) {
            expect(closed).toBe(false)
            chunks.push(chunk.slice())
          },
          async close() {
            receivedBeforeClose = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
            closed = true
          },
          async abort() {},
        }
      },
    } as unknown as FileSystemFileHandle

    await expect(
      writeEmbeddedProject({ format: 'embedded', handle }, prepared, 'native.collage'),
    ).resolves.toBe('native')
    expect(closed).toBe(true)
    expect(receivedBeforeClose).toBeGreaterThan(original.size)
    const reopened = await openArchive(new Blob(chunks))
    expect(await reopened.assets.get(assetId)?.arrayBuffer()).toEqual(await original.arrayBuffer())
  })

  it('streams an empty project to a native handle', async () => {
    const prepared = prepareArchive(createProject('Empty native stream'), { get: () => undefined })
    let writes = 0
    let closed = false
    const handle = {
      name: 'empty.collage',
      async createWritable() {
        return {
          async write() {
            writes += 1
          },
          async close() {
            closed = true
          },
          async abort() {},
        }
      },
    } as unknown as FileSystemFileHandle

    await writeEmbeddedProject({ format: 'embedded', handle }, prepared, 'empty.collage')
    expect(writes).toBeGreaterThan(0)
    expect(closed).toBe(true)
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
      new Map([[assetId, { file, relativePath: 'dogs/dogs.jpg', sha256: 'a'.repeat(64) }]]),
    )
    expect(linked.type).toBe('application/json')
    expect((await linked.text()).trimStart().startsWith('{')).toBe(true)
    const opened = await openLinkedProject(linked)
    expect(opened.assets[assetId].storage).toMatchObject({
      kind: 'linked',
      relativePath: 'dogs/dogs.jpg',
    })
  })

  it('rejects stale linked-file matches after an original changes', () => {
    const document = createProject('Changed original')
    const assetId = '11111111-1111-4111-8111-111111111111'
    document.assets[assetId] = {
      id: assetId,
      originalName: 'dogs.jpg',
      mediaType: 'image/jpeg',
      byteLength: 42,
      width: 10,
      height: 10,
      sha256: 'b'.repeat(64),
      storage: { kind: 'embedded', archivePath: `assets/${assetId}` },
    }
    const staleFile = new File([new Uint8Array(42)], 'dogs.jpg', { type: 'image/jpeg' })
    expect(() =>
      createLinkedProject(
        document,
        new Map([
          [assetId, { file: staleFile, relativePath: 'dogs/dogs.jpg', sha256: 'a'.repeat(64) }],
        ]),
      ),
    ).toThrow('no longer matches')
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
