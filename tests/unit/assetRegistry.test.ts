import { describe, expect, it, vi } from 'vitest'
import { AssetRegistry, decodedImageBudgetForDevice } from '../../src/lib/render/assetRegistry'

describe('decoded image cache', () => {
  it('releases originals that have not finished preview preparation', () => {
    const registry = new AssetRegistry()
    registry.bindOriginal('pending', new Blob(['photo']), 'pending-hash')

    registry.clear()

    expect(registry.getBlob('pending')).toBeUndefined()
  })

  it('defaults to 64 MiB and increases the budget at 4 GiB and 8 GiB', () => {
    expect(decodedImageBudgetForDevice(1)).toBe(64 * 1024 * 1024)
    expect(decodedImageBudgetForDevice(2)).toBe(64 * 1024 * 1024)
    expect(decodedImageBudgetForDevice()).toBe(64 * 1024 * 1024)
    expect(decodedImageBudgetForDevice(4)).toBe(128 * 1024 * 1024)
    expect(decodedImageBudgetForDevice(8)).toBe(256 * 1024 * 1024)
  })

  it('evicts the oldest inactive image when the memory budget is exceeded', async () => {
    const registry = new AssetRegistry()
    const images = Reflect.get(registry, 'images') as Map<string, HTMLImageElement>
    const fakeImage = () => ({ naturalWidth: 4096, naturalHeight: 2048 }) as HTMLImageElement // 32 MiB
    images.set('older', fakeImage())
    images.set('newer', fakeImage())
    images.set('active', fakeImage())

    await registry.ensureImages(['older'])
    registry.retainDecodedForPage(['active'])

    expect(registry.getImage('newer')).toBeUndefined()
    expect(registry.getImage('older')).toBeDefined()
    expect(registry.getImage('active')).toBeDefined()
    expect(registry.decodedImageBytes).toBe(64 * 1024 * 1024)
  })

  it('bounds decoded images on a crowded active page and falls back to thumbnails', () => {
    const registry = new AssetRegistry()
    const images = Reflect.get(registry, 'images') as Map<string, HTMLImageElement>
    const thumbnails = Reflect.get(registry, 'thumbnailImages') as Map<string, HTMLImageElement>
    for (let index = 0; index < 16; index += 1) {
      const id = String(index)
      images.set(id, { naturalWidth: 6000, naturalHeight: 4000 } as HTMLImageElement)
      thumbnails.set(id, { naturalWidth: 256, naturalHeight: 171 } as HTMLImageElement)
    }

    registry.retainDecodedForPage(images.keys())

    expect(registry.decodedImageBytes).toBeLessThanOrEqual(decodedImageBudgetForDevice())
    expect(registry.getImage('0')).toBe(thumbnails.get('0'))
  })

  it('reports each decoded image before the rest of the page finishes', async () => {
    const registry = new AssetRegistry()
    let finishFirst: (() => void) | undefined
    let finishSecond: (() => void) | undefined
    const first = new Promise<void>((resolve) => (finishFirst = resolve))
    const second = new Promise<void>((resolve) => (finishSecond = resolve))
    const ensureImage = vi.spyOn(registry, 'ensureImage')
    ensureImage.mockImplementation(async (assetId) => {
      await (assetId === 'first' ? first : second)
      return {} as HTMLImageElement
    })
    const ready = vi.fn()

    const loading = registry.ensureImages(['first', 'second'], () => true, ready)
    finishFirst?.()
    await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1))
    expect(ensureImage).toHaveBeenCalledTimes(2)
    finishSecond?.()
    await loading
    expect(ready).toHaveBeenCalledTimes(2)
  })
})
