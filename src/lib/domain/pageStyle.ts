import { resolveLayout } from './geometry'
import type { PageV1 } from './types'

/** Largest whole-pixel values leaving every frame with positive area. */
export function pageSpacingLimits(page: PageV1): { padding: number; gap: number } {
  const maximum = (control: 'padding' | 'gap') => {
    let low = 0
    let high = 120
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      try {
        resolveLayout({ ...page, style: { ...page.style, [control]: middle } })
        low = middle
      } catch {
        high = middle - 1
      }
    }
    return low
  }
  return { padding: maximum('padding'), gap: maximum('gap') }
}
