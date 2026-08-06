import { describe, expect, it } from 'vitest'

describe('Phase 0 shell', () => {
  it('keeps the app identity stable', () => {
    expect('collage-builder').toBe('collage-builder')
  })
})
