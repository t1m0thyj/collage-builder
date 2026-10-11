import { describe, expect, it, vi } from 'vitest'
import { createPage, createProject } from '../../src/lib/domain/factories'
import type { AssetRegistry } from '../../src/lib/render/assetRegistry'
import { renderProjectExport } from '../../src/lib/app/exportProject'

const exportMocks = vi.hoisted(() => ({
  renderPageImage: vi.fn(async () => new Blob(['rendered page'])),
  renderCountsAtZipConsumption: [] as number[],
  names: [] as string[],
}))

vi.mock('../../src/lib/render/exportPng', () => ({
  renderPageImage: exportMocks.renderPageImage,
  zipImages: async (
    pages: AsyncIterable<{ name: string; blob: Blob }> | Iterable<{ name: string; blob: Blob }>,
  ) => {
    for await (const page of pages) {
      exportMocks.names.push(page.name)
      exportMocks.renderCountsAtZipConsumption.push(exportMocks.renderPageImage.mock.calls.length)
      await page.blob.arrayBuffer()
    }
    return new Blob(['zip'])
  },
}))

describe('project export', () => {
  it('renders the next page only after the ZIP writer consumes the current page', async () => {
    exportMocks.renderPageImage.mockClear()
    exportMocks.renderCountsAtZipConsumption.length = 0
    exportMocks.names.length = 0
    const document = createProject()
    document.pages.push(createPage(), createPage())
    const registry = {
      getImage: () => undefined,
      getRenderableBlob: () => undefined,
      ensureImages: async () => false,
      retainDecodedForPage: vi.fn(),
    } as unknown as AssetRegistry

    const result = await renderProjectExport({
      document,
      registry,
      activePageId: document.pages[0].id,
      scope: 'all',
      range: '',
      longSide: 800,
      format: 'png',
      quality: 90,
      baseName: 'test',
      isCancelled: () => false,
      onProgress: () => undefined,
    })

    expect(result).toMatchObject({ filename: 'test-pages.zip', pageCount: 3 })
    expect(exportMocks.renderCountsAtZipConsumption).toEqual([1, 2, 3])
    expect(exportMocks.names).toEqual(['test-01.png', 'test-02.png', 'test-03.png'])
    expect(registry.retainDecodedForPage).toHaveBeenCalledTimes(3)
  })

  it('uses the template for a range ZIP and rejects duplicate names before any render', async () => {
    const document = createProject()
    document.pages.push(createPage(), createPage())
    document.pages[1].name = 'Beach'
    document.pages[2].name = 'Sunset'
    const registry = {
      getImage: () => undefined,
      getRenderableBlob: () => undefined,
      ensureImages: async () => false,
      retainDecodedForPage: vi.fn(),
    } as unknown as AssetRegistry
    const request = {
      document,
      registry,
      activePageId: document.pages[0].id,
      scope: 'range' as const,
      range: '2-3',
      longSide: 800,
      format: 'jpeg' as const,
      quality: 90,
      baseName: 'Summer',
      filenameTemplate: 'Photo-{number}-{title}',
      isCancelled: () => false,
      onProgress: () => undefined,
    }
    exportMocks.names.length = 0
    await renderProjectExport(request)
    expect(exportMocks.names).toEqual(['Photo-02-Beach.jpg', 'Photo-03-Sunset.jpg'])
    exportMocks.renderPageImage.mockClear()
    await expect(
      renderProjectExport({ ...request, filenameTemplate: 'same-name' }),
    ).rejects.toThrow('different filename')
    expect(exportMocks.renderPageImage).not.toHaveBeenCalled()
  })
})
