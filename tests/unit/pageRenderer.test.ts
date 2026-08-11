import { describe, expect, it } from 'vitest'
import { createPage } from '../../src/lib/domain/factories'
import { createPageRenderModel } from '../../src/lib/render/pageRenderer'

describe('page render model', () => {
  it('uses the same resolved geometry as the document model', () => {
    const page = createPage('Page', 'layout-4-001')
    const model = createPageRenderModel(page)
    expect(model.frames).toHaveLength(4)
    expect(model.frames[0]).toMatchObject({ x: 30, y: 30, width: 755, height: 555 })
  })
})
