export type HeicMediaType = 'image/heic' | 'image/heif'

const heicExtensions: ReadonlyMap<string, HeicMediaType> = new Map([
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
])

const heicMediaTypes = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

export function heicMediaType(file: Pick<File, 'name' | 'type'>): HeicMediaType | undefined {
  const normalizedType = file.type.toLocaleLowerCase()
  if (heicMediaTypes.has(normalizedType))
    return normalizedType.includes('heif') ? 'image/heif' : 'image/heic'
  const extension = file.name.split('.').pop()?.toLocaleLowerCase()
  return extension ? heicExtensions.get(extension) : undefined
}

export function isHeicBlob(blob: Blob): boolean {
  return heicMediaTypes.has(blob.type.toLocaleLowerCase())
}

export async function convertHeicForDisplay(blob: Blob, name: string): Promise<Blob> {
  try {
    const { heicTo } = await import('heic-to')
    return await heicTo({ blob, type: 'image/jpeg', quality: 0.95 })
  } catch {
    throw new Error(
      `${name}: this HEIC/HEIF image could not be decoded. Convert it to JPEG or PNG and try again.`,
    )
  }
}
