import type { AssetId } from '../domain/types'
import { convertHeicForDisplay, isHeicBlob } from '../domain/heic'

export class AssetRegistry {
  private readonly blobs = new Map<AssetId, Blob>()
  private readonly activeHashes = new Map<AssetId, string>()
  private readonly images = new Map<AssetId, HTMLImageElement>()
  private readonly imageLoads = new Map<AssetId, Promise<HTMLImageElement>>()
  private readonly objectUrls = new Map<AssetId, string>()
  private readonly renderableBlobs = new Map<AssetId, Blob>()
  private readonly thumbnailUrls = new Map<AssetId, string>()
  private readonly retained = new Map<string, Blob>()
  private retainedBytes = 0
  private readonly retainedLimit = 256 * 1024 * 1024
  private readonly thumbnailEdge = 256

  async register(
    assetId: AssetId,
    blob: Blob,
    sha256?: string,
    dimensions?: { width: number; height: number },
    displayBlob?: Blob,
  ): Promise<void> {
    this.release(assetId)
    const { renderableBlob, thumbnail } = await this.createRenderableThumbnail(
      blob,
      dimensions,
      displayBlob,
    )
    const objectUrl = URL.createObjectURL(renderableBlob)
    try {
      this.blobs.set(assetId, blob)
      this.renderableBlobs.set(assetId, renderableBlob)
      if (sha256) this.activeHashes.set(assetId, sha256)
      this.objectUrls.set(assetId, objectUrl)
      this.thumbnailUrls.set(assetId, URL.createObjectURL(thumbnail))
    } catch (error) {
      URL.revokeObjectURL(objectUrl)
      throw error
    }
  }

  private async createRenderableThumbnail(
    blob: Blob,
    dimensions?: { width: number; height: number },
    displayBlob?: Blob,
  ): Promise<{ renderableBlob: Blob; thumbnail: Blob }> {
    const renderableBlob = displayBlob ?? blob
    try {
      return {
        renderableBlob,
        thumbnail: await this.createThumbnail(renderableBlob, dimensions),
      }
    } catch (error) {
      if (displayBlob || !isHeicBlob(blob)) throw error
      const fallbackBlob = await convertHeicForDisplay(blob, 'Stored HEIC/HEIF image')
      return {
        renderableBlob: fallbackBlob,
        thumbnail: await this.createThumbnail(fallbackBlob, dimensions),
      }
    }
  }

  private async createThumbnail(
    blob: Blob,
    dimensions?: { width: number; height: number },
  ): Promise<Blob> {
    const bitmap = await createImageBitmap(blob, this.thumbnailOptions(dimensions))
    try {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, this.thumbnailEdge / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Thumbnail rendering is unavailable')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const thumbnail = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.82),
      )
      if (thumbnail) return thumbnail
      const fallback = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      )
      if (!fallback) throw new Error('Thumbnail rendering failed')
      return fallback
    } finally {
      bitmap.close()
    }
  }

  private thumbnailOptions(dimensions?: { width: number; height: number }): ImageBitmapOptions {
    if (!dimensions) return {}
    const scale = Math.min(1, this.thumbnailEdge / Math.max(dimensions.width, dimensions.height))
    return {
      resizeWidth: Math.max(1, Math.round(dimensions.width * scale)),
      resizeHeight: Math.max(1, Math.round(dimensions.height * scale)),
      resizeQuality: 'high',
    }
  }

  async ensureImage(assetId: AssetId): Promise<HTMLImageElement> {
    const existing = this.images.get(assetId)
    if (existing) return existing
    const pending = this.imageLoads.get(assetId)
    if (pending) return pending
    const objectUrl = this.objectUrls.get(assetId)
    if (!objectUrl) throw new Error(`Missing original bytes for asset ${assetId}`)
    const load = this.decodeImage(objectUrl)
      .then((image) => {
        this.images.set(assetId, image)
        return image
      })
      .catch(async (error) => {
        const originalBlob = this.blobs.get(assetId)
        if (!originalBlob || !isHeicBlob(originalBlob)) throw error
        const fallbackBlob = await convertHeicForDisplay(originalBlob, 'Stored HEIC/HEIF image')
        const fallbackUrl = URL.createObjectURL(fallbackBlob)
        try {
          const image = await this.decodeImage(fallbackUrl)
          const staleUrl = this.objectUrls.get(assetId)
          this.objectUrls.set(assetId, fallbackUrl)
          if (staleUrl) URL.revokeObjectURL(staleUrl)
          this.images.set(assetId, image)
          return image
        } catch (fallbackError) {
          URL.revokeObjectURL(fallbackUrl)
          throw fallbackError
        }
      })
    this.imageLoads.set(assetId, load)
    try {
      return await load
    } finally {
      this.imageLoads.delete(assetId)
    }
  }

  private async decodeImage(url: string): Promise<HTMLImageElement> {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  }

  async ensureImages(assetIds: Iterable<AssetId>): Promise<boolean> {
    const uniqueAssetIds = [...new Set(assetIds)]
    const missingAssetIds = uniqueAssetIds.filter((assetId) => !this.images.has(assetId))
    await Promise.all(missingAssetIds.map((assetId) => this.ensureImage(assetId)))
    return missingAssetIds.length > 0
  }

  releaseDecodedExcept(assetIds: Iterable<AssetId>): void {
    const retained = new Set(assetIds)
    for (const assetId of this.images.keys())
      if (!retained.has(assetId)) this.images.delete(assetId)
  }

  getImage(assetId: AssetId): HTMLImageElement | undefined {
    return this.images.get(assetId)
  }
  getBlob(assetId: AssetId): Blob | undefined {
    return this.blobs.get(assetId)
  }
  getRenderableBlob(assetId: AssetId): Blob | undefined {
    return this.renderableBlobs.get(assetId)
  }
  getObjectUrl(assetId: AssetId): string | undefined {
    return this.objectUrls.get(assetId)
  }
  getThumbnailUrl(assetId: AssetId): string | undefined {
    return this.thumbnailUrls.get(assetId)
  }
  hasRetained(assetId: AssetId, sha256: string): boolean {
    return this.retained.has(`${assetId}:${sha256}`)
  }

  retain(assetId: AssetId, sha256: string): void {
    const blob = this.blobs.get(assetId)
    const key = `${assetId}:${sha256}`
    if (!blob || this.retained.has(key)) return
    this.retained.set(key, blob)
    this.retainedBytes += blob.size
    while (this.retainedBytes > this.retainedLimit) {
      const oldest = this.retained.entries().next().value as [string, Blob] | undefined
      if (!oldest) break
      this.retained.delete(oldest[0])
      this.retainedBytes -= oldest[1].size
    }
  }

  async restoreRetained(
    assetId: AssetId,
    sha256: string,
    dimensions?: { width: number; height: number },
  ): Promise<boolean> {
    if (this.activeHashes.get(assetId) === sha256) return true
    const blob = this.retained.get(`${assetId}:${sha256}`)
    if (!blob) return false
    const activeHash = this.activeHashes.get(assetId)
    if (activeHash) this.retain(assetId, activeHash)
    await this.register(assetId, blob, sha256, dimensions)
    return true
  }

  release(assetId: AssetId): void {
    const objectUrl = this.objectUrls.get(assetId)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    const thumbnailUrl = this.thumbnailUrls.get(assetId)
    if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl)
    this.objectUrls.delete(assetId)
    this.thumbnailUrls.delete(assetId)
    this.imageLoads.delete(assetId)
    this.images.delete(assetId)
    this.blobs.delete(assetId)
    this.renderableBlobs.delete(assetId)
    this.activeHashes.delete(assetId)
  }

  clear(): void {
    ;[...this.objectUrls.keys()].forEach((assetId) => this.release(assetId))
    this.retained.clear()
    this.retainedBytes = 0
  }
}
