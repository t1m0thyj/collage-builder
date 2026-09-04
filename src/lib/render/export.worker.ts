import { drawExportPage } from './exportCanvas'
import type { ExportWorkerRequest, ExportWorkerResponse } from './exportWorkerProtocol'

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ExportWorkerRequest>) => void) | null
  postMessage: (message: ExportWorkerResponse) => void
}

workerScope.onmessage = (event) => {
  void render(event.data)
}

async function render(request: ExportWorkerRequest): Promise<void> {
  const bitmaps = new Map<string, ImageBitmap>()
  try {
    for (const { assetId, blob } of request.images)
      bitmaps.set(assetId, await createImageBitmap(blob))
    const canvas = new OffscreenCanvas(request.width, request.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas rendering is unavailable')
    drawExportPage(
      context,
      request.page,
      request.assets,
      (assetId) => bitmaps.get(assetId),
      request.width,
      request.format,
    )
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
  } finally {
    for (const bitmap of bitmaps.values()) bitmap.close()
  }
}
