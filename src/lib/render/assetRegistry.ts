import type { AssetId } from '../domain/types'

export class AssetRegistry {
  private readonly blobs = new Map<AssetId, Blob>()
  private readonly images = new Map<AssetId, HTMLImageElement>()
  private readonly objectUrls = new Map<AssetId, string>()

  async register(assetId: AssetId, blob: Blob): Promise<HTMLImageElement> {
    this.release(assetId)
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    this.blobs.set(assetId, blob)
    this.objectUrls.set(assetId, objectUrl)
    this.images.set(assetId, image)
    return image
  }

  getImage(assetId: AssetId): HTMLImageElement | undefined { return this.images.get(assetId) }
  getBlob(assetId: AssetId): Blob | undefined { return this.blobs.get(assetId) }

  release(assetId: AssetId): void {
    const objectUrl = this.objectUrls.get(assetId)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    this.objectUrls.delete(assetId)
    this.images.delete(assetId)
    this.blobs.delete(assetId)
  }

  clear(): void { [...this.objectUrls.keys()].forEach((assetId) => this.release(assetId)) }
}
