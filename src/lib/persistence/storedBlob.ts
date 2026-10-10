// Store bytes rather than Blob/File objects so recovery also works in browsers
// whose IndexedDB Blob serialization fails. Existing Blob records remain readable.
export interface StoredBlob {
  bytes: ArrayBuffer
  type: string
}

export async function encodeStoredBlob(blob: Blob): Promise<StoredBlob> {
  return { bytes: await blob.arrayBuffer(), type: blob.type }
}

export function decodeStoredBlob(value: unknown): Blob | undefined {
  if (value instanceof Blob) return value
  if (
    typeof value === 'object' &&
    value !== null &&
    'bytes' in value &&
    value.bytes instanceof ArrayBuffer &&
    'type' in value &&
    typeof value.type === 'string'
  ) {
    return new Blob([value.bytes], { type: value.type })
  }
  return undefined
}
