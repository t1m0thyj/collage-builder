import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { unzipBlobBounded, zipBlobs } from '../../src/lib/persistence/zipStreams'

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

  it('rejects oversized expanded content before returning it', async () => {
    const compressed = new Blob([zipSync({ 'large.txt': new Uint8Array(600) })])
    await expect(unzipBlobBounded(compressed, safeOptions)).rejects.toThrow(
      /too large|safety limit/,
    )
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
