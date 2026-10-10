import type { AssetId } from '../domain/types'
import type { CollageDocumentV1 } from '../domain/types'
import { maxProjectBytes } from '../persistence/limits'
import { convertHeicForDisplay, isHeicBlob } from '../domain/heic'

export interface PreparedAssetImages {
  preview: Blob
  thumbnail: Blob
  /** A converted, full-resolution display image for a HEIC/HEIF original when needed. */
  displayBlob?: Blob
}

export function decodedImageBudgetForDevice(deviceMemory?: number): number {
  const mebibyte = 1024 * 1024
  if (deviceMemory !== undefined && deviceMemory >= 8) return 256 * mebibyte
  if (deviceMemory !== undefined && deviceMemory >= 4) return 128 * mebibyte
  return 64 * mebibyte
}

export class AssetRegistry {
  private readonly blobs = new Map<AssetId, Blob>()
  private readonly activeHashes = new Map<AssetId, string>()
  private readonly images = new Map<AssetId, HTMLImageElement>()
  private readonly imageLoads = new Map<AssetId, Promise<HTMLImageElement>>()
  private readonly thumbnailImages = new Map<AssetId, HTMLImageElement>()
  private readonly thumbnailLoads = new Map<AssetId, Promise<HTMLImageElement>>()
  private readonly objectUrls = new Map<AssetId, string>()
  private readonly renderableBlobs = new Map<AssetId, Blob>()
  private readonly thumbnailUrls = new Map<AssetId, string>()
  private readonly previewBlobs = new Map<AssetId, Blob>()
  private readonly thumbnailBlobs = new Map<AssetId, Blob>()
  private readonly displayBlobs = new Map<AssetId, Blob>()
  private readonly registrations = new Map<AssetId, Promise<boolean>>()
  private readonly retained = new Map<string, Blob>()
  private retainedBytes = 0
  private readonly retainedLimit = maxProjectBytes
  private readonly thumbnailEdge = 256
  private readonly previewEdge = 2048
  // Thumbnails provide a quick canvas preview without keeping every full-size photo decoded.
  private readonly decodedThumbnailLimit = 128
  private readonly decodedImageBudget = decodedImageBudgetForDevice(
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  )

  async register(
    assetId: AssetId,
    blob: Blob,
    sha256?: string,
    dimensions?: { width: number; height: number },
    displayBlob?: Blob,
    isCurrent: () => boolean = () => true,
  ): Promise<boolean> {
    return this.startRegistration(assetId, () =>
      this.registerUncached(assetId, blob, sha256, dimensions, displayBlob, isCurrent),
    )
  }

  private async registerUncached(
    assetId: AssetId,
    blob: Blob,
    sha256?: string,
    dimensions?: { width: number; height: number },
    displayBlob?: Blob,
    isCurrent: () => boolean = () => true,
  ): Promise<boolean> {
    const { renderableBlob, preview, thumbnail } = await this.createRenderableThumbnail(
      blob,
      dimensions,
      displayBlob,
    )
    if (!isCurrent()) return false
    return this.commitPrepared(
      assetId,
      blob,
      sha256,
      renderableBlob,
      { preview, thumbnail, displayBlob: renderableBlob === blob ? undefined : renderableBlob },
      isCurrent,
    )
  }

  /** Keeps verified original bytes available while a derived preview is prepared later. */
  bindOriginal(assetId: AssetId, blob: Blob, sha256?: string): void {
    this.release(assetId)
    this.blobs.set(assetId, blob)
    if (sha256) this.activeHashes.set(assetId, sha256)
  }

  /** Installs validated derived images without decoding or encoding the original again. */
  async registerPrepared(
    assetId: AssetId,
    blob: Blob,
    sha256: string | undefined,
    prepared: PreparedAssetImages,
    isCurrent: () => boolean = () => true,
  ): Promise<boolean> {
    return this.startRegistration(assetId, async () =>
      this.commitPrepared(assetId, blob, sha256, prepared.displayBlob ?? blob, prepared, isCurrent),
    )
  }

  private startRegistration(assetId: AssetId, operation: () => Promise<boolean>): Promise<boolean> {
    const pending = this.registrations.get(assetId)
    if (pending) return pending
    const registration = operation()
    this.registrations.set(assetId, registration)
    void registration.then(
      () => {
        if (this.registrations.get(assetId) === registration) this.registrations.delete(assetId)
      },
      () => {
        if (this.registrations.get(assetId) === registration) this.registrations.delete(assetId)
      },
    )
    return registration
  }

  private commitPrepared(
    assetId: AssetId,
    blob: Blob,
    sha256: string | undefined,
    renderableBlob: Blob,
    prepared: PreparedAssetImages,
    isCurrent: () => boolean,
  ): boolean {
    if (!isCurrent()) return false
    const objectUrl = URL.createObjectURL(prepared.preview)
    const thumbnailUrl = URL.createObjectURL(prepared.thumbnail)
    try {
      if (!isCurrent()) return false
      this.release(assetId)
      this.blobs.set(assetId, blob)
      this.renderableBlobs.set(assetId, renderableBlob)
      this.previewBlobs.set(assetId, prepared.preview)
      this.thumbnailBlobs.set(assetId, prepared.thumbnail)
      if (prepared.displayBlob) this.displayBlobs.set(assetId, prepared.displayBlob)
      if (sha256) this.activeHashes.set(assetId, sha256)
      this.objectUrls.set(assetId, objectUrl)
      this.thumbnailUrls.set(assetId, thumbnailUrl)
      return true
    } catch (error) {
      URL.revokeObjectURL(objectUrl)
      URL.revokeObjectURL(thumbnailUrl)
      throw error
    } finally {
      if (!this.objectUrls.has(assetId) || this.objectUrls.get(assetId) !== objectUrl) {
        URL.revokeObjectURL(objectUrl)
        URL.revokeObjectURL(thumbnailUrl)
      }
    }
  }

  private async createRenderableThumbnail(
    blob: Blob,
    dimensions?: { width: number; height: number },
    displayBlob?: Blob,
  ): Promise<{ renderableBlob: Blob; preview: Blob; thumbnail: Blob }> {
    const renderableBlob = displayBlob ?? blob
    try {
      return await this.createPreviews(renderableBlob, dimensions)
    } catch (error) {
      if (displayBlob || !isHeicBlob(blob)) throw error
      const fallbackBlob = await convertHeicForDisplay(blob, 'Stored HEIC/HEIF image')
      return this.createPreviews(fallbackBlob, dimensions)
    }
  }

  private async createPreviews(
    renderableBlob: Blob,
    dimensions?: { width: number; height: number },
  ): Promise<{ renderableBlob: Blob; preview: Blob; thumbnail: Blob }> {
    const needsPreview =
      !dimensions || Math.max(dimensions.width, dimensions.height) > this.previewEdge
    const bitmap = await createImageBitmap(
      renderableBlob,
      this.thumbnailOptions(dimensions, needsPreview ? this.previewEdge : this.thumbnailEdge),
    )
    try {
      const [preview, thumbnail] = await Promise.all([
        needsPreview ? this.encodeThumbnail(bitmap, this.previewEdge) : renderableBlob,
        this.encodeThumbnail(bitmap, this.thumbnailEdge),
      ])
      return { renderableBlob, preview, thumbnail }
    } finally {
      bitmap.close()
    }
  }

  private async encodeThumbnail(bitmap: ImageBitmap, edge: number): Promise<Blob> {
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
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
  }

  private thumbnailOptions(
    dimensions?: { width: number; height: number },
    edge = this.thumbnailEdge,
  ): ImageBitmapOptions {
    if (!dimensions) return {}
    const scale = Math.min(1, edge / Math.max(dimensions.width, dimensions.height))
    return {
      resizeWidth: Math.max(1, Math.round(dimensions.width * scale)),
      resizeHeight: Math.max(1, Math.round(dimensions.height * scale)),
      resizeQuality: 'high',
    }
  }

  async ensureImage(assetId: AssetId): Promise<HTMLImageElement> {
    const existing = this.images.get(assetId)
    if (existing) {
      this.images.delete(assetId)
      this.images.set(assetId, existing)
      return existing
    }
    const pending = this.imageLoads.get(assetId)
    if (pending) return pending
    const objectUrl = this.objectUrls.get(assetId)
    if (!objectUrl) throw new Error(`Missing original bytes for asset ${assetId}`)
    const load = this.decodeImage(objectUrl)
      .then((image) => {
        if (this.objectUrls.get(assetId) === objectUrl) this.images.set(assetId, image)
        return image
      })
      .catch(async (error) => {
        if (this.objectUrls.get(assetId) !== objectUrl) throw error
        const originalBlob = this.blobs.get(assetId)
        if (!originalBlob || !isHeicBlob(originalBlob)) throw error
        const fallbackBlob = await convertHeicForDisplay(originalBlob, 'Stored HEIC/HEIF image')
        const fallbackUrl = URL.createObjectURL(fallbackBlob)
        try {
          const image = await this.decodeImage(fallbackUrl)
          if (this.objectUrls.get(assetId) !== objectUrl) throw error
          this.objectUrls.set(assetId, fallbackUrl)
          URL.revokeObjectURL(objectUrl)
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
      if (this.imageLoads.get(assetId) === load) this.imageLoads.delete(assetId)
    }
  }

  private async decodeImage(url: string): Promise<HTMLImageElement> {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  }

  async ensureThumbnailImages(assetIds: Iterable<AssetId>): Promise<boolean> {
    const uniqueAssetIds = [...new Set(assetIds)]
    for (const assetId of uniqueAssetIds) {
      const cached = this.thumbnailImages.get(assetId)
      if (cached) {
        this.thumbnailImages.delete(assetId)
        this.thumbnailImages.set(assetId, cached)
      }
    }
    const missing = uniqueAssetIds.filter(
      (assetId) => !this.images.has(assetId) && !this.thumbnailImages.has(assetId),
    )
    await Promise.all(
      missing.map(async (assetId) => {
        const pending = this.thumbnailLoads.get(assetId)
        if (pending) return pending
        const url = this.thumbnailUrls.get(assetId)
        if (!url) return
        const load = this.decodeImage(url).then((image) => {
          if (this.thumbnailUrls.get(assetId) === url) {
            this.thumbnailImages.set(assetId, image)
            while (this.thumbnailImages.size > this.decodedThumbnailLimit)
              this.thumbnailImages.delete(this.thumbnailImages.keys().next().value!)
          }
          return image
        })
        this.thumbnailLoads.set(assetId, load)
        try {
          await load
        } finally {
          if (this.thumbnailLoads.get(assetId) === load) this.thumbnailLoads.delete(assetId)
        }
      }),
    )
    return missing.length > 0
  }

  async ensureImages(
    assetIds: Iterable<AssetId>,
    isCurrent: () => boolean = () => true,
    onImageReady: () => void = () => undefined,
  ): Promise<boolean> {
    const uniqueAssetIds = [...new Set(assetIds)]
    for (const assetId of uniqueAssetIds) {
      const cached = this.images.get(assetId)
      if (cached) {
        this.images.delete(assetId)
        this.images.set(assetId, cached)
      }
    }
    const missingAssetIds = uniqueAssetIds.filter((assetId) => !this.images.has(assetId))
    // Serial decoding avoids a transient full-page spike while several large
    // browser image decoders allocate their pixel buffers at once.
    for (const assetId of missingAssetIds) {
      if (!isCurrent()) break
      await this.ensureImage(assetId)
      if (isCurrent()) {
        this.retainDecodedForPage(uniqueAssetIds)
        onImageReady()
      }
    }
    return missingAssetIds.length > 0
  }

  get decodedImageBytes(): number {
    let bytes = 0
    for (const image of this.images.values()) bytes += image.naturalWidth * image.naturalHeight * 4
    return bytes
  }

  retainDecodedForPage(assetIds: Iterable<AssetId>): void {
    const active = new Set(assetIds)
    let bytes = this.decodedImageBytes
    for (const [assetId, image] of this.images) {
      if (bytes <= this.decodedImageBudget) break
      if (active.has(assetId)) continue
      this.images.delete(assetId)
      bytes -= image.naturalWidth * image.naturalHeight * 4
    }
    for (const [assetId, image] of this.images) {
      if (bytes <= this.decodedImageBudget) break
      this.images.delete(assetId)
      bytes -= image.naturalWidth * image.naturalHeight * 4
    }
  }

  getImage(assetId: AssetId): HTMLImageElement | undefined {
    return this.images.get(assetId) ?? this.thumbnailImages.get(assetId)
  }
  getBlob(assetId: AssetId): Blob | undefined {
    return this.blobs.get(assetId)
  }
  getRenderableBlob(assetId: AssetId): Blob | undefined {
    return this.renderableBlobs.get(assetId)
  }
  getPreparedImages(assetId: AssetId): PreparedAssetImages | undefined {
    const preview = this.previewBlobs.get(assetId)
    const thumbnail = this.thumbnailBlobs.get(assetId)
    if (!preview || !thumbnail) return undefined
    return { preview, thumbnail, displayBlob: this.displayBlobs.get(assetId) }
  }
  getObjectUrl(assetId: AssetId): string | undefined {
    return this.objectUrls.get(assetId)
  }
  getThumbnailUrl(assetId: AssetId, _revision?: number): string | undefined {
    void _revision
    return this.thumbnailUrls.get(assetId)
  }
  hasActive(assetId: AssetId, sha256: string): boolean {
    return this.activeHashes.get(assetId) === sha256
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
  }

  get isOverRetainedLimit(): boolean {
    return this.retainedBytes > this.retainedLimit
  }

  /** Release retained versions no longer reachable through document history. */
  reconcileRetainedHistory(documents: Iterable<CollageDocumentV1>): void {
    const referenced = new Set<string>()
    for (const document of documents)
      for (const asset of Object.values(document.assets))
        referenced.add(`${asset.id}:${asset.sha256}`)
    for (const [key, blob] of this.retained)
      if (!referenced.has(key)) {
        this.retained.delete(key)
        this.retainedBytes -= blob.size
      }
  }

  async restoreRetained(
    assetId: AssetId,
    sha256: string,
    dimensions?: { width: number; height: number },
    isCurrent: () => boolean = () => true,
  ): Promise<boolean> {
    if (!isCurrent()) return false
    if (this.activeHashes.get(assetId) === sha256) return true
    const blob = this.retained.get(`${assetId}:${sha256}`)
    if (!blob) return false
    const activeHash = this.activeHashes.get(assetId)
    if (activeHash) this.retain(assetId, activeHash)
    return this.register(assetId, blob, sha256, dimensions, undefined, isCurrent)
  }

  release(assetId: AssetId): void {
    const objectUrl = this.objectUrls.get(assetId)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    const thumbnailUrl = this.thumbnailUrls.get(assetId)
    if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl)
    this.objectUrls.delete(assetId)
    this.thumbnailUrls.delete(assetId)
    this.imageLoads.delete(assetId)
    this.thumbnailLoads.delete(assetId)
    this.images.delete(assetId)
    this.thumbnailImages.delete(assetId)
    this.blobs.delete(assetId)
    this.renderableBlobs.delete(assetId)
    this.previewBlobs.delete(assetId)
    this.thumbnailBlobs.delete(assetId)
    this.displayBlobs.delete(assetId)
    this.activeHashes.delete(assetId)
  }

  clear(): void {
    ;[...this.objectUrls.keys()].forEach((assetId) => this.release(assetId))
    this.retained.clear()
    this.registrations.clear()
    this.retainedBytes = 0
  }
}
