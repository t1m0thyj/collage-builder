import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPage, createProject, defaultPlacement } from '../../src/lib/domain/factories'
import { AssetRegistry } from '../../src/lib/render/assetRegistry'
import { preparePageImages } from '../../src/lib/app/imageSession'

const cache = vi.hoisted(() => ({
  loadPreviewCache: vi.fn(),
  removePreviewCache: vi.fn().mockResolvedValue(undefined),
  savePreviewCache: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../src/lib/persistence/previewCache', () => cache)

function fixture() {
  const document = createProject()
  const registry = new AssetRegistry()
  const page = createPage('Test')
  for (let index = 0; index < 4; index++) {
    const id = `photo-${index}`
    document.assets[id] = {
      id,
      originalName: `${id}.png`,
      width: 1,
      height: 1,
      byteLength: 1,
      mediaType: 'image/png',
      sha256: `hash-${index}`,
      storage: { kind: 'embedded', archivePath: `assets/${id}` },
    }
    registry.bindOriginal(id, new Blob([id]), `hash-${index}`)
    page.slots[id] = { assetId: id, placement: defaultPlacement() }
  }
  vi.spyOn(registry, 'ensureThumbnailImages').mockResolvedValue(false)
  vi.spyOn(registry, 'ensureImages').mockResolvedValue(false)
  return { document, registry, page }
}

describe('queued photo preparation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('skips an old queued hash while allowing its replacement to prepare', async () => {
    cache.loadPreviewCache.mockResolvedValue(undefined)
    const { document, registry, page } = fixture()
    const gates: Array<() => void> = []
    const register = vi.spyOn(registry, 'register').mockImplementation(async (id) => {
      if (id !== 'photo-3') await new Promise<void>((resolve) => gates.push(resolve))
      return true
    })
    let oldPageCurrent = true
    const oldRequest = preparePageImages(
      page,
      registry,
      () => oldPageCurrent,
      undefined,
      undefined,
      document.assets,
    )
    expect(register).toHaveBeenCalledTimes(3)
    const replacement = new Blob(['new'])
    registry.bindOriginal('photo-3', replacement, 'new-hash')
    const newAssets = {
      ...document.assets,
      'photo-3': { ...document.assets['photo-3'], sha256: 'new-hash' },
    }
    const newPage = { ...page, slots: { 'photo-3': page.slots['photo-3'] } }
    oldPageCurrent = false
    const newRequest = preparePageImages(
      newPage,
      registry,
      () => true,
      undefined,
      undefined,
      newAssets,
    )
    gates.forEach((finish) => finish())
    await Promise.all([oldRequest, newRequest])
    const photoCalls = register.mock.calls.filter(([id]) => id === 'photo-3')
    expect(photoCalls).toHaveLength(1)
    expect(photoCalls[0][1]).toBe(replacement)
    expect(photoCalls[0][2]).toBe('new-hash')
  })

  it('discards an undecodable cache entry and regenerates from its original', async () => {
    vi.stubGlobal('indexedDB', {})
    const { document, registry, page } = fixture()
    page.slots = { 'photo-0': page.slots['photo-0'] }
    cache.loadPreviewCache.mockResolvedValue({
      preview: new Blob(['bad']),
      thumbnail: new Blob(['bad']),
    })
    vi.spyOn(registry, 'registerPrepared').mockRejectedValue(new Error('Cannot decode'))
    const register = vi.spyOn(registry, 'register').mockResolvedValue(true)
    await preparePageImages(page, registry, () => true, undefined, undefined, document.assets)
    expect(cache.removePreviewCache).toHaveBeenCalledWith(document.assets['photo-0'])
    expect(register).toHaveBeenCalledWith(
      'photo-0',
      registry.getBlob('photo-0'),
      'hash-0',
      document.assets['photo-0'],
      undefined,
      undefined,
      expect.any(Function),
    )
  })
})
