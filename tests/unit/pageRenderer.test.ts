import { describe, expect, it } from 'vitest'
import { createPage } from '../../src/lib/domain/factories'
import { createPageRenderModel } from '../../src/lib/render/pageRenderer'

describe('page render model', () => {
  it('uses the same resolved geometry as the document model', () => {
    const page = createPage('Page', 'grid-2x2')
    const model = createPageRenderModel(page)
    expect(model.frames).toHaveLength(4)
    expect(model.frames[0]).toMatchObject({ x: 48, y: 48, width: 742, height: 542 })
  })
})
