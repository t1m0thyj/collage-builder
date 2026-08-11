import { describe, expect, it } from 'vitest'
import { createId } from '../../src/lib/utils/ids'

describe('createId', () => {
  it('returns a UUID accepted by the document schema', () => {
    expect(createId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
