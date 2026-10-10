import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { unzipBlobBounded, writeZip, zipBlobs } from '../../src/lib/persistence/zipStreams'

const safeOptions = {
  maxEntries: 4,
  maxEntryBytes: 256,
  maxExpandedBytes: 512,
  validateName: (name: string) => {
    if (name.includes('..')) throw new Error('unsafe path')
  },
}

describe('bounded ZIP streams', () => {
  it('round trips streamed blob entries', async () => {
    const archive = await zipBlobs(
      [
        { name: 'one.txt', blob: new Blob(['one']) },
        { name: 'two.txt', blob: new Blob(['two']) },
      ],
      'application/zip',
    )
    const entries = await unzipBlobBounded(archive, safeOptions)
    expect(await entries['one.txt'].text()).toBe('one')
    expect(await entries['two.txt'].text()).toBe('two')
  })

  it('consumes async entries one at a time', async () => {
    let firstEntryConsumed = false
    const first = new Blob(['first'])
    const originalSlice = first.slice.bind(first)
    first.slice = (...args) => {
      const slice = originalSlice(...args)
      const originalArrayBuffer = slice.arrayBuffer.bind(slice)
      slice.arrayBuffer = async () => {
        const result = await originalArrayBuffer()
        firstEntryConsumed = true
        return result
      }
      return slice
    }
    async function* entries() {
      yield { name: 'first.txt', blob: first }
      expect(firstEntryConsumed).toBe(true)
      yield { name: 'second.txt', blob: new Blob(['second']) }
    }

    const archive = await zipBlobs(entries(), 'application/zip')
    const expanded = await unzipBlobBounded(archive, safeOptions)
    expect(await expanded['first.txt'].text()).toBe('first')
    expect(await expanded['second.txt'].text()).toBe('second')
  })

  it('reuses a Blob checksum on a repeat archive without changing its bytes', async () => {
    const original = new Blob([new Uint8Array(300_000).fill(42)])
    const entries = [{ name: 'photo.bin', blob: original }]
    let firstChecksumBytes = 0
    let secondChecksumBytes = 0

    const first = await zipBlobs(entries, 'application/zip', {
      onChecksum: (bytes) => (firstChecksumBytes += bytes),
    })
    const second = await zipBlobs(entries, 'application/zip', {
      onChecksum: (bytes) => (secondChecksumBytes += bytes),
    })

    expect(firstChecksumBytes).toBe(original.size)
    expect(secondChecksumBytes).toBe(0)
    const largeOptions = { ...safeOptions, maxEntryBytes: 400_000, maxExpandedBytes: 400_000 }
    expect(await (await unzipBlobBounded(first, largeOptions))['photo.bin'].arrayBuffer()).toEqual(
      await original.arrayBuffer(),
    )
    expect(await (await unzipBlobBounded(second, largeOptions))['photo.bin'].arrayBuffer()).toEqual(
      await original.arrayBuffer(),
    )
  })

  it('waits for a slow sink before producing the next bounded ZIP batch', async () => {
    const chunks: Uint8Array[] = []
    let firstWrite: (() => void) | undefined
    const gate = new Promise<void>((resolve) => (firstWrite = resolve))
    const writing = writeZip(
      [{ name: 'photo.bin', blob: new Blob([new Uint8Array(600_000).fill(9)]) }],
      {
        async write(chunk) {
          chunks.push(chunk.slice())
          if (chunks.length === 1) await gate
        },
      },
    )

    for (let attempt = 0; attempt < 20 && chunks.length === 0; attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 0))
    // The local-file header is the only output before the first source slice.
    expect(chunks).toHaveLength(1)
    firstWrite?.()
    await writing
    const archive = new Blob(chunks)
    const entries = await unzipBlobBounded(archive, {
      ...safeOptions,
      maxEntryBytes: 700_000,
      maxExpandedBytes: 700_000,
    })
    expect(entries['photo.bin'].size).toBe(600_000)
  })

  it('rejects oversized expanded content before returning it', async () => {
    const compressed = new Blob([zipSync({ 'large.txt': new Uint8Array(600) })])
    await expect(unzipBlobBounded(compressed, safeOptions)).rejects.toThrow(
      /too large|safety limit/,
    )
  })

  it('bounds a compressed entry whose local ZIP header understates its expanded size', async () => {
    const archive = zipSync({ 'understated.txt': new Uint8Array(8 * 1024 * 1024).fill(65) })
    // The local header is what the streaming reader sees before it creates a
    // decoder. Leave the central-directory value intact to model a malformed
    // archive with conflicting size declarations.
    new DataView(archive.buffer, archive.byteOffset, archive.byteLength).setUint32(22, 1_024, true)

    await expect(
      unzipBlobBounded(new Blob([archive]), {
        ...safeOptions,
        maxEntryBytes: 1_024,
        maxExpandedBytes: 1_024,
      }),
    ).rejects.toThrow(/too large|safety limit/)
  })

  it('rejects unsafe paths during streaming discovery', async () => {
    const compressed = new Blob([zipSync({ '../outside.txt': new Uint8Array([1]) })])
    await expect(unzipBlobBounded(compressed, safeOptions)).rejects.toThrow('unsafe path')
  })

  it('rejects duplicate entry names', async () => {
    const compressed = await zipBlobs(
      [
        { name: 'document.json', blob: new Blob(['first']) },
        { name: 'document.json', blob: new Blob(['second']) },
      ],
      'application/zip',
    )
    await expect(unzipBlobBounded(compressed, safeOptions)).rejects.toThrow('duplicate entry')
  })
})
