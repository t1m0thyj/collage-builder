import type { AssetId } from '../domain/types'

export class AssetRegistry {
  private readonly blobs = new Map<AssetId, Blob>()
  private readonly activeHashes = new Map<AssetId, string>()
  private readonly images = new Map<AssetId, HTMLImageElement>()
  private readonly objectUrls = new Map<AssetId, string>()
  private readonly retained = new Map<string, Blob>()
  private retainedBytes = 0
  private readonly retainedLimit = 64 * 1024 * 1024

  async register(assetId: AssetId, blob: Blob, sha256?: string): Promise<HTMLImageElement> {
    this.release(assetId)
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    this.blobs.set(assetId, blob)
    if (sha256) this.activeHashes.set(assetId, sha256)
    this.objectUrls.set(assetId, objectUrl)
    this.images.set(assetId, image)
    return image
  }

  getImage(assetId: AssetId): HTMLImageElement | undefined { return this.images.get(assetId) }
  getBlob(assetId: AssetId): Blob | undefined { return this.blobs.get(assetId) }
  getObjectUrl(assetId: AssetId): string | undefined { return this.objectUrls.get(assetId) }
  hasRetained(assetId: AssetId, sha256: string): boolean { return this.retained.has(`${assetId}:${sha256}`) }

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

  async restoreRetained(assetId: AssetId, sha256: string): Promise<boolean> {
    if (this.activeHashes.get(assetId) === sha256) return true
    const blob = this.retained.get(`${assetId}:${sha256}`)
    if (!blob) return false
    const activeHash = this.activeHashes.get(assetId)
    if (activeHash) this.retain(assetId, activeHash)
    await this.register(assetId, blob, sha256)
    return true
  }

  release(assetId: AssetId): void {
    const objectUrl = this.objectUrls.get(assetId)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    this.objectUrls.delete(assetId)
    this.images.delete(assetId)
    this.blobs.delete(assetId)
    this.activeHashes.delete(assetId)
  }

  clear(): void { [...this.objectUrls.keys()].forEach((assetId) => this.release(assetId)); this.retained.clear(); this.retainedBytes = 0 }
}
