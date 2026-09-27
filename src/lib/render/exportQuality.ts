import { resolveCoverPlacement } from '../domain/crop'
import { resolveLayout } from '../domain/geometry'
import type { AssetRecordV1, PageV1 } from '../domain/types'

export function resolveExportRange(
  scope: 'current' | 'all' | 'range',
  currentIndex: number,
  pageCount: number,
  range = '',
): number[] {
  if (scope === 'current') return [currentIndex]
  if (scope === 'all') return Array.from({ length: pageCount }, (_, index) => index)
  const match = range.trim().match(/^(\d+)\s*-\s*(\d+)$/)
  if (!match) throw new Error('Use a page range like 1-3')
  const start = Number(match[1]) - 1
  const end = Number(match[2]) - 1
  if (start < 0 || end < start || end >= pageCount)
    throw new Error(`Choose pages between 1 and ${pageCount}`)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export function countUpscaledPlacements(
  page: PageV1,
  assets: Record<string, AssetRecordV1>,
  longSide: number,
): number {
  const scale = exportDimensions(page, longSide).width / page.width
  return resolveLayout(page).filter((frame) => {
    const content = page.slots[frame.slotId]
    if (!content) return false
    const asset = assets[content.assetId]
    if (!asset) return false
    const placement = resolveCoverPlacement(
      frame.width,
      frame.height,
      asset.width,
      asset.height,
      content.placement,
    )
    return placement.width * scale > asset.width || placement.height * scale > asset.height
  }).length
}

export function exportDimensions(
  page: PageV1,
  longSide: number,
): { width: number; height: number } {
  if (!Number.isInteger(longSide) || longSide < 1 || longSide > 8192)
    throw new Error('Export size exceeds the 8192 px / 64 megapixel limit')
  const scale = longSide / Math.max(page.width, page.height)
  const width = Math.round(page.width * scale)
  const height = Math.round(page.height * scale)
  if (width < 1 || height < 1 || width * height > 64_000_000)
    throw new Error('Export size exceeds the 8192 px / 64 megapixel limit')
  return { width, height }
}
