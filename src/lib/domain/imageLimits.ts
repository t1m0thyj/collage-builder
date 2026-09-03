export const maxImageDimension = 32_768
export const maxImagePixels = 100_000_000

export function assertImageDimensions(width: number, height: number, name = 'Image'): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > maxImageDimension ||
    height > maxImageDimension ||
    width * height > maxImagePixels
  )
    throw new Error(
      `${name}: decoded dimensions exceed the ${maxImageDimension}px / 100 megapixel limit`,
    )
}
