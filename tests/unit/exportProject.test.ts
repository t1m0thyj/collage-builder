import { describe, expect, it, vi } from 'vitest'
import { createPage, createProject } from '../../src/lib/domain/factories'
import type { AssetRegistry } from '../../src/lib/render/assetRegistry'
import { renderProjectExport } from '../../src/lib/app/exportProject'

const exportMocks = vi.hoisted(() => ({
  renderPageImage: vi.fn(async () => new Blob(['rendered page'])),
  renderCountsAtZipConsumption: [] as number[],
}))

vi.mock('../../src/lib/render/exportPng', () => ({
  renderPageImage: exportMocks.renderPageImage,
  zipImages: async (
    pages: AsyncIterable<{ name: string; blob: Blob }> | Iterable<{ name: string; blob: Blob }>,
  ) => {
    for await (const page of pages) {
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
    expect(registry.retainDecodedForPage).toHaveBeenCalledTimes(3)
  })
})
