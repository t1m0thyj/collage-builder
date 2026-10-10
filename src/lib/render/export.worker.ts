import { resolveLayout } from '../domain/geometry'
import { drawExportFrameImage, prepareExportPage } from './exportCanvas'
import type { ExportWorkerRequest, ExportWorkerResponse } from './exportWorkerProtocol'

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ExportWorkerRequest>) => void) | null
  postMessage: (message: ExportWorkerResponse) => void
}

workerScope.onmessage = (event) => {
  void render(event.data)
}

async function render(request: ExportWorkerRequest): Promise<void> {
  try {
    const imageBlobs = new Map(request.images.map((image) => [image.assetId, image.blob]))
    const canvas = new OffscreenCanvas(request.width, request.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas rendering is unavailable')
    prepareExportPage(context, request.page, request.width, request.format)
    const frames = resolveLayout(request.page)
    const remainingUses = new Map<string, number>()
    for (const frame of frames) {
      const assetId = request.page.slots[frame.slotId]?.assetId
      if (assetId) remainingUses.set(assetId, (remainingUses.get(assetId) ?? 0) + 1)
    }
    const reusableBitmaps = new Map<string, ImageBitmap>()
    let reusableBytes = 0
    const reusableBudget = 64 * 1024 * 1024
    try {
      for (const frame of frames) {
        const content = request.page.slots[frame.slotId]
        if (!content) continue
        const asset = request.assets[content.assetId]
        const imageBlob = imageBlobs.get(content.assetId)
        if (!asset || !imageBlob) throw new Error('An image is not available for export')
        let bitmap = reusableBitmaps.get(content.assetId)
        let reusable = !!bitmap
        if (!bitmap) {
          bitmap = await createImageBitmap(imageBlob)
          const bitmapBytes = bitmap.width * bitmap.height * 4
          if (
            (remainingUses.get(content.assetId) ?? 0) > 1 &&
            reusableBytes + bitmapBytes <= reusableBudget
          ) {
            reusableBitmaps.set(content.assetId, bitmap)
            reusableBytes += bitmapBytes
            reusable = true
          }
        }
        try {
          drawExportFrameImage(context, request.page, frame, asset, bitmap)
        } finally {
          const usesLeft = (remainingUses.get(content.assetId) ?? 1) - 1
          remainingUses.set(content.assetId, usesLeft)
          if (reusable && usesLeft === 0) {
            reusableBitmaps.delete(content.assetId)
            reusableBytes -= bitmap.width * bitmap.height * 4
            bitmap.close()
          } else if (!reusable) bitmap.close()
        }
      }
    } finally {
      for (const bitmap of reusableBitmaps.values()) bitmap.close()
    }
    const blob = await canvas.convertToBlob({
      type: request.format === 'jpeg' ? 'image/jpeg' : 'image/png',
      quality: request.format === 'jpeg' ? request.quality : undefined,
    })
    workerScope.postMessage({ id: request.id, blob })
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : 'Image rendering failed',
    })
  }
}
