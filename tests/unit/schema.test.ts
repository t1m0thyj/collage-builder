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
})
