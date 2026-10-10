import { describe, expect, it } from 'vitest'
import { decodeStoredBlob, encodeStoredBlob } from '../../src/lib/persistence/storedBlob'

describe('recovery image storage', () => {
  it('round-trips binary image bytes and their media type through structured cloning', async () => {
    const bytes = new Uint8Array([0, 137, 255, 10])
    const original = new Blob([bytes], { type: 'image/png' })
    const stored = structuredClone(await encodeStoredBlob(original))
    const restored = decodeStoredBlob(stored)!
    expect(restored.type).toBe(original.type)
    expect(restored.size).toBe(original.size)
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(bytes)
  })

  it('reads existing Blob records without converting them', () => {
    const original = new Blob(['legacy'], { type: 'image/webp' })
    expect(decodeStoredBlob(original)).toBe(original)
  })

  it.each([
    undefined,
    null,
    {},
    { bytes: [1, 2], type: 'image/png' },
    { bytes: new ArrayBuffer(1) },
  ])('ignores a malformed recovery image record: %j', (record) =>
    expect(decodeStoredBlob(record)).toBeUndefined(),
  )
})
