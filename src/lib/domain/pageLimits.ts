export const minPageDimension = 64
export const maxPageDimension = 16_384
export const maxPagePixels = 64_000_000

export function pageDimensionError(width: number, height: number): string | undefined {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < minPageDimension ||
    height < minPageDimension
  )
    return `Page dimensions must be at least ${minPageDimension} px`
  if (width > maxPageDimension || height > maxPageDimension)
    return `Page dimensions must be ${maxPageDimension.toLocaleString('en-US')} px or smaller`
  if (width * height > maxPagePixels) return 'Page dimensions must total 64 megapixels or fewer'
}

export function assertPageDimensions(width: number, height: number): void {
  const error = pageDimensionError(width, height)
  if (error) throw new Error(error)
}
