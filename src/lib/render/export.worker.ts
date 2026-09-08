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
    // Decode one source at a time so worker export does not hold a second complete
    // set of full-resolution page images alongside the editor's active-page images.
    for (const frame of resolveLayout(request.page)) {
      const content = request.page.slots[frame.slotId]
      if (!content) continue
      const asset = request.assets[content.assetId]
      const imageBlob = imageBlobs.get(content.assetId)
      if (!asset || !imageBlob) throw new Error('An image is not available for export')
      const bitmap = await createImageBitmap(imageBlob)
      try {
        drawExportFrameImage(context, request.page, frame, asset, bitmap)
      } finally {
        bitmap.close()
      }
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
