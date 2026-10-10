import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateImportedImage } from '../../src/lib/domain/importImage'

describe('import bitmap lifetime', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps at most one bitmap when validating a folder for metadata', async () => {
    let active = 0
    let peak = 0
    const close = vi.fn(() => active--)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        active++
        peak = Math.max(peak, active)
        return { width: 100, height: 100, close }
      }),
    )
    const candidates = []
    for (let index = 0; index < 10; index++)
      candidates.push(
        await validateImportedImage(
          new File([String(index)], `${index}.png`, { type: 'image/png' }),
          undefined,
          false,
        ),
      )
    expect(candidates.every((candidate) => candidate.decodedSource === undefined)).toBe(true)
    expect(peak).toBe(1)
    expect(active).toBe(0)
    expect(close).toHaveBeenCalledTimes(10)
  })

  it('closes a bitmap if its dimensions fail validation', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 100000, height: 100000, close }),
    )
    await expect(
      validateImportedImage(new File(['x'], 'large.png', { type: 'image/png' })),
    ).rejects.toThrow()
    expect(close).toHaveBeenCalledOnce()
  })
})
