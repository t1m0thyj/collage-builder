import { AsyncInflate, Unzip, UnzipPassThrough, Zip, ZipPassThrough } from 'fflate'

export interface ZipBlobEntry {
  name: string
  blob: Blob
}
export interface ZipProgress {
  completed: number
  total?: number
}

export interface BoundedUnzipOptions {
  maxEntries: number
  maxEntryBytes: number
  maxExpandedBytes: number
  validateName: (name: string) => void
  onInputProgress?: (completed: number, total: number) => void
}

// A DEFLATE stream can expand by a little over 1,000x in a single input byte.
// Keep every decoder push small enough that an adversarial entry cannot make
// fflate materialize a large output chunk before our ondata limit check runs.
const maxDeflateExpansionPerInputByte = 1_100

/** Unlike fflate's AsyncUnzipInflate, this always uses a worker. */
class WorkerUnzipInflate {
  static compression = 8
  ondata!: (error: Error | null, chunk: Uint8Array, final: boolean) => void
  private readonly inflater: AsyncInflate

  constructor() {
    this.inflater = new AsyncInflate((error, chunk, final) => this.ondata(error, chunk, final))
  }

  push(chunk: Uint8Array, final: boolean): void {
    // AsyncInflate transfers its input buffer, so do not transfer Blob stream
    // views that may be shared with the stream implementation.
    this.inflater.push(chunk.slice(), final)
  }

  terminate(): void {
    this.inflater.terminate()
  }
}

async function pushBlob(
  file: ZipPassThrough,
  blob: Blob,
  report?: (bytes: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = blob.stream().getReader()
  let current = await reader.read()
  if (current.done) {
    file.push(new Uint8Array(), true)
    return
  }
  while (!current.done) {
    if (signal?.aborted) throw new DOMException('Project save cancelled', 'AbortError')
    const next = await reader.read()
    file.push(current.value, next.done)
    report?.(current.value.byteLength)
    current = next
  }
}

/** Builds a store-only ZIP incrementally so already-compressed photos are not copied repeatedly. */
export async function zipBlobs(
  entries: Iterable<ZipBlobEntry> | AsyncIterable<ZipBlobEntry>,
  type: string,
  options: { onProgress?: (progress: ZipProgress) => void; signal?: AbortSignal } = {},
): Promise<Blob> {
  const chunks: BlobPart[] = []
  let resolveComplete: (() => void) | undefined
  let rejectComplete: ((error: Error) => void) | undefined
  const complete = new Promise<void>((resolve, reject) => {
    resolveComplete = resolve
    rejectComplete = reject
  })
  const archive = new Zip((error, chunk, final) => {
    if (error) {
      rejectComplete?.(error)
      return
    }
    const copy = new Uint8Array(chunk.byteLength)
    copy.set(chunk)
    chunks.push(copy)
    if (final) resolveComplete?.()
  })
  try {
    const total = isAsyncIterable(entries)
      ? undefined
      : [...entries].reduce((sum, entry) => sum + entry.blob.size, 0)
    let completed = 0
    options.onProgress?.({ completed, total })
    for await (const entry of entries) {
      if (options.signal?.aborted) throw new DOMException('Project save cancelled', 'AbortError')
      const file = new ZipPassThrough(entry.name)
      archive.add(file)
      await pushBlob(
        file,
        entry.blob,
        (bytes) => {
          completed += bytes
          options.onProgress?.({ completed, total })
        },
        options.signal,
      )
    }
    archive.end()
    await complete
    return new Blob(chunks, { type })
  } catch (error) {
    archive.terminate()
    throw error
  }
}

function isAsyncIterable(
  entries: Iterable<ZipBlobEntry> | AsyncIterable<ZipBlobEntry>,
): entries is AsyncIterable<ZipBlobEntry> {
  return Symbol.asyncIterator in entries
}

/** Expands entries incrementally and stops as soon as a declared or actual limit is exceeded. */
export async function unzipBlobBounded(
  blob: Blob,
  options: BoundedUnzipOptions,
): Promise<Record<string, Blob>> {
  return new Promise((resolve, reject) => {
    const entries: Record<string, Blob> = {}
    let entryCount = 0
    let declaredExpandedBytes = 0
    let actualExpandedBytes = 0
    let pendingFiles = 0
    let inputFinished = false
    let failed = false
    let consumedInputBytes = 0
    let lastProgressAt = 0
    const seenNames = new Set<string>()
    const maxInputChunkBytes = Math.max(
      1,
      Math.floor(
        Math.min(options.maxEntryBytes, options.maxExpandedBytes) / maxDeflateExpansionPerInputByte,
      ),
    )
    const reportInputProgress = (force = false) => {
      const now = performance.now()
      if (!force && now - lastProgressAt < 100) return
      lastProgressAt = now
      options.onInputProgress?.(consumedInputBytes, blob.size)
    }
    reportInputProgress(true)

    const fail = (error: unknown) => {
      if (failed) return
      failed = true
      reject(error instanceof Error ? error : new Error('Unable to expand project archive'))
    }
    const finishIfReady = () => {
      if (!failed && inputFinished && pendingFiles === 0) resolve(entries)
    }

    const archive = new Unzip((file) => {
      if (failed) return
      try {
        entryCount += 1
        if (entryCount > options.maxEntries)
          throw new Error('Project archive contains too many entries')
        options.validateName(file.name)
        if (seenNames.has(file.name))
          throw new Error(`Project archive contains a duplicate entry: ${file.name}`)
        seenNames.add(file.name)
        if (file.originalSize !== undefined) {
          if (file.originalSize > options.maxEntryBytes)
            throw new Error(`Project archive entry is too large: ${file.name}`)
          declaredExpandedBytes += file.originalSize
          if (declaredExpandedBytes > options.maxExpandedBytes)
            throw new Error('Project archive expands beyond the safety limit')
        }
      } catch (error) {
        file.terminate()
        fail(error)
        return
      }

      pendingFiles += 1
      const chunks: BlobPart[] = []
      let entryBytes = 0
      file.ondata = (error, chunk, final) => {
        if (failed) return
        if (error) {
          fail(error)
          return
        }
        entryBytes += chunk.byteLength
        actualExpandedBytes += chunk.byteLength
        if (entryBytes > options.maxEntryBytes || actualExpandedBytes > options.maxExpandedBytes) {
          file.terminate()
          fail(
            new Error(
              entryBytes > options.maxEntryBytes
                ? `Project archive entry is too large: ${file.name}`
                : 'Project archive expands beyond the safety limit',
            ),
          )
          return
        }
        if (chunk.byteLength) chunks.push(chunk)
        if (final) {
          entries[file.name] = new Blob(chunks)
          pendingFiles -= 1
          finishIfReady()
        }
      }
      file.start()
    })
    archive.register(UnzipPassThrough)
    archive.register(WorkerUnzipInflate)

    void (async () => {
      const reader = blob.stream().getReader()
      try {
        let current = await reader.read()
        if (current.done) {
          archive.push(new Uint8Array(), true)
        } else {
          while (!current.done && !failed) {
            const next = await reader.read()
            // fflate instantiates the decoder as soon as it receives an entry's
            // data. Splitting the archive input bounds that decoder's output
            // allocation even if a ZIP header understates the expanded size.
            for (
              let offset = 0;
              offset < current.value.byteLength && !failed;
              offset += maxInputChunkBytes
            ) {
              const end = Math.min(current.value.byteLength, offset + maxInputChunkBytes)
              archive.push(
                current.value.subarray(offset, end),
                next.done && end === current.value.byteLength,
              )
            }
            consumedInputBytes += current.value.byteLength
            reportInputProgress(next.done)
            current = next
          }
        }
        inputFinished = true
        finishIfReady()
      } catch (error) {
        fail(error)
      } finally {
        if (failed) await reader.cancel().catch(() => undefined)
      }
    })()
  })
}
