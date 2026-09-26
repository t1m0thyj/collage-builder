import { describe, expect, it } from 'vitest'
import { AssetRegistry, decodedImageBudgetForDevice } from '../../src/lib/render/assetRegistry'

describe('decoded image cache', () => {
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
})
