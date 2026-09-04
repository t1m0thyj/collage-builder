import { describe, expect, it } from 'vitest'
import { heicMediaType, isHeicBlob } from '../../src/lib/domain/heic'

describe('HEIC/HEIF detection', () => {
  it('recognizes MIME types and case-insensitive filename extensions', () => {
    expect(heicMediaType({ name: 'photo.bin', type: 'image/heic' })).toBe('image/heic')
    expect(heicMediaType({ name: 'photo.bin', type: 'image/heif-sequence' })).toBe('image/heif')
    expect(heicMediaType({ name: 'IMG_1234.HEIC', type: '' })).toBe('image/heic')
    expect(heicMediaType({ name: 'image.HEIF', type: 'application/octet-stream' })).toBe(
      'image/heif',
    )
    expect(heicMediaType({ name: 'photo.jpg', type: 'image/jpeg' })).toBeUndefined()
  })

  it('recognizes stored HEIC blobs from their normalized MIME type', () => {
    expect(isHeicBlob(new Blob([], { type: 'image/heic' }))).toBe(true)
    expect(isHeicBlob(new Blob([], { type: 'image/png' }))).toBe(false)
  })
})
