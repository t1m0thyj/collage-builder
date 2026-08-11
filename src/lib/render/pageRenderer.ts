import { resolveLayout } from '../domain/geometry'
import type { PageV1, ResolvedFrame } from '../domain/types'

export interface PageRenderModel {
  page: PageV1
  frames: ResolvedFrame[]
  cornerRadius: number
}

export function createPageRenderModel(page: PageV1): PageRenderModel {
  return {
    page,
    frames: resolveLayout(page),
    cornerRadius: Math.min(page.style.cornerRadius, page.width / 2, page.height / 2),
  }
}
