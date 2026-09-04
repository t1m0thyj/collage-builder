import type { AssetRecordV1, PageV1 } from '../domain/types'
import type { ExportFormat } from './exportPng'
import type { ExportWorkerRequest, ExportWorkerResponse } from './exportWorkerProtocol'

let nextRequestId = 1
let worker: Worker | undefined
let workerUnavailable = false
const pending = new Map<number, { resolve: (blob: Blob) => void; reject: (error: Error) => void }>()

export function supportsWorkerExport(): boolean {
  return (
    !workerUnavailable &&
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
  )
}

function rejectPending(error: Error): void {
  for (const request of pending.values()) request.reject(error)
  pending.clear()
}

function disableWorker(): void {
  workerUnavailable = true
  worker?.terminate()
  worker = undefined
  rejectPending(new Error('Background image rendering is unavailable'))
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
    const request = pending.get(event.data.id)
    if (!request) return
    pending.delete(event.data.id)
    if ('error' in event.data) request.reject(new Error(event.data.error))
    else request.resolve(event.data.blob)
  }
  worker.onerror = disableWorker
  worker.onmessageerror = disableWorker
  return worker
}

export function renderPageInWorker(
  page: PageV1,
  assets: Record<string, AssetRecordV1>,
  images: Array<{ assetId: string; blob: Blob }>,
  width: number,
  height: number,
  format: ExportFormat,
  quality: number,
): Promise<Blob> {
  if (!supportsWorkerExport()) return Promise.reject(new Error('Background rendering unavailable'))
  const id = nextRequestId++
  const request: ExportWorkerRequest = { id, page, assets, images, width, height, format, quality }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    try {
      getWorker().postMessage(request)
    } catch (error) {
      pending.delete(id)
      reject(error instanceof Error ? error : new Error('Unable to start background rendering'))
    }
  })
}
