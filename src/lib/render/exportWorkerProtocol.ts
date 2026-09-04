import type { AssetRecordV1, PageV1 } from '../domain/types'
import type { ExportFormat } from './exportPng'

export interface ExportWorkerRequest {
  id: number
  page: PageV1
  assets: Record<string, AssetRecordV1>
  images: Array<{ assetId: string; blob: Blob }>
  width: number
  height: number
  format: ExportFormat
  quality: number
}

export type ExportWorkerResponse = { id: number; blob: Blob } | { id: number; error: string }
