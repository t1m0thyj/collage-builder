import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import { collageDocumentSchema } from '../../src/lib/domain/schema'

describe('document schema', () => {
  it('accepts a new factory document', () => {
    expect(collageDocumentSchema.safeParse(createProject()).success).toBe(true)
  })

  it('rejects non-finite page dimensions', () => {
    const document = createProject()
    document.pages[0].width = Number.POSITIVE_INFINITY
    expect(collageDocumentSchema.safeParse(document).success).toBe(false)
  })

  it('accepts HEIC and HEIF asset records', () => {
    const document = createProject()
    for (const [index, mediaType] of ['image/heic', 'image/heif'].entries()) {
      const id = `11111111-1111-4111-8111-11111111111${index}`
      document.assets[id] = {
        id,
        originalName: `photo.${mediaType.slice(6)}`,
        mediaType,
        byteLength: 42,
        width: 12,
        height: 8,
        sha256: 'a'.repeat(64),
        storage: { kind: 'embedded', archivePath: `assets/${id}.${mediaType.slice(6)}` },
      }
    }
    expect(collageDocumentSchema.safeParse(document).success).toBe(true)
  })
})
