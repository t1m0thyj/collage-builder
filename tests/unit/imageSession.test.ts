import { describe, expect, it, vi } from 'vitest'
import { preparePageImages } from '../../src/lib/app/imageSession'
import type { PageV1 } from '../../src/lib/domain/types'
import type { AssetRegistry } from '../../src/lib/render/assetRegistry'

function page(id: string, assetId: string): PageV1 {
  return {
    id,
    name: id,
    width: 100,
    height: 100,
    layout: {
      presetId: 'test',
      root: { kind: 'leaf', slotId: 'slot' },
    },
    slots: { slot: { assetId, placement: { zoom: 1, positionX: 0.5, positionY: 0.5 } } },
    style: { backgroundColor: '#ffffff', padding: 0, gap: 0, cornerRadius: 0, shadow: null },
  }
}

describe('page image session', () => {
  it('does not let a stale page request clean up the active page images', async () => {
    let resolveFirstLoad: (() => void) | undefined
    const firstLoad = new Promise<void>((resolve) => (resolveFirstLoad = resolve))
    const registry = {
      getBlob: () => new Blob(['image']),
      ensureImages: vi
        .fn()
        .mockImplementationOnce(() => firstLoad.then(() => true))
        .mockResolvedValueOnce(true),
      releaseDecodedExcept: vi.fn(),
    } as unknown as AssetRegistry
    let activePageId = 'a'

    const loadingA = preparePageImages(page('a', 'asset-a'), registry, () => activePageId === 'a')
    activePageId = 'b'
    await preparePageImages(page('b', 'asset-b'), registry, () => activePageId === 'b')
    resolveFirstLoad?.()
    await loadingA

    expect(registry.releaseDecodedExcept).toHaveBeenCalledTimes(1)
    expect(registry.releaseDecodedExcept).toHaveBeenCalledWith(['asset-b'])
  })
})
