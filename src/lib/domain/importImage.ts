import { createId } from '../utils/ids'
import type { AssetRecordV1 } from './types'

const supportedMediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const extensionByMediaType: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const maxImportFileBytes = 50 * 1024 * 1024

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function decodedImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try { const image = new Image(); image.src = url; await image.decode(); return image } finally { URL.revokeObjectURL(url) }
}

export async function validateImportedImage(file: File): Promise<{ asset: AssetRecordV1; file: File }> {
  if (!supportedMediaTypes.has(file.type)) throw new Error(`${file.name}: use a PNG, JPEG, or WebP image`)
  if (file.size === 0) throw new Error(`${file.name}: file is empty`)
  if (file.size > maxImportFileBytes) throw new Error(`${file.name}: files must be 50 MB or smaller`)
  const image = await decodedImage(file).catch(() => { throw new Error(`${file.name}: image data could not be decoded`) })
  const id = createId()
  const extension = extensionByMediaType[file.type]
  return { file, asset: { id, originalName: file.name || `image.${extension}`, mediaType: file.type as AssetRecordV1['mediaType'], byteLength: file.size, width: image.naturalWidth, height: image.naturalHeight, sha256: await sha256(file), storage: { kind: 'embedded', archivePath: `assets/${id}.${extension}` } } }
}
