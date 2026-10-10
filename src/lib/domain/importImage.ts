import { createId } from '../utils/ids'
import type { AssetRecordV1 } from './types'
import { assertImageDimensions } from './imageLimits'
import { convertHeicForDisplay, heicMediaType } from './heic'

const supportedMediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const extensionByMediaType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}
export const maxImportFileBytes = 50 * 1024 * 1024

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function decodedImage(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob)
}

export interface ValidatedImportedImage {
  asset: AssetRecordV1
  file: File
  displayBlob?: Blob
  /** Caller-owned; close after registration, cancellation, or failure. */
  decodedSource?: ImageBitmap
}

export async function validateImportedImage(
  file: File,
  knownHashes?: ReadonlySet<string>,
  retainDecodedSource = true,
): Promise<ValidatedImportedImage> {
  const detectedHeicType = heicMediaType(file)
  if (!supportedMediaTypes.has(file.type) && !detectedHeicType)
    throw new Error(`${file.name}: use a PNG, JPEG, WebP, HEIC, or HEIF image`)
  if (file.size === 0) throw new Error(`${file.name}: file is empty`)
  if (file.size > maxImportFileBytes)
    throw new Error(`${file.name}: files must be 50 MB or smaller`)
  const normalizedFile = detectedHeicType
    ? new File([file], file.name, { type: detectedHeicType, lastModified: file.lastModified })
    : file
  const hash = await sha256(normalizedFile)
  if (knownHashes?.has(hash))
    throw new Error(`${file.name}: this exact image is already in the project`)
  let displayBlob: Blob | undefined
  let image: ImageBitmap
  if (detectedHeicType) {
    try {
      image = await decodedImage(normalizedFile)
    } catch {
      displayBlob = await convertHeicForDisplay(normalizedFile, file.name)
      image = await decodedImage(displayBlob).catch(() => {
        throw new Error(
          `${file.name}: this HEIC/HEIF image could not be decoded. Convert it to JPEG or PNG and try again.`,
        )
      })
    }
  } else {
    image = await decodedImage(normalizedFile).catch(() => {
      throw new Error(`${file.name}: image data could not be decoded`)
    })
  }
  try {
    assertImageDimensions(image.width, image.height, file.name)
    const id = createId()
    const mediaType = detectedHeicType ?? file.type
    const extension = extensionByMediaType[mediaType]
    const validated: ValidatedImportedImage = {
      file: normalizedFile,
      displayBlob,
      asset: {
        id,
        originalName: file.name || `image.${extension}`,
        mediaType: mediaType as AssetRecordV1['mediaType'],
        byteLength: file.size,
        width: image.width,
        height: image.height,
        sha256: hash,
        storage: { kind: 'embedded', archivePath: `assets/${id}.${extension}` },
      },
      decodedSource: retainDecodedSource ? image : undefined,
    }
    if (!retainDecodedSource) image.close()
    return validated
  } catch (error) {
    image.close()
    throw error
  }
}
