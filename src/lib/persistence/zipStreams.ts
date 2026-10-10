import {
  AsyncInflate,
  Unzip,
  UnzipPassThrough,
  Zip,
  ZipPassThrough,
  type ZipInputFile,
} from 'fflate'

export interface ZipBlobEntry {
  name: string
  blob: Blob
  /** Only original photo bytes contribute to save progress. */
  trackProgress?: boolean
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
const maxZipInputChunkBytes = 256 * 1024

interface ZipChecksum {
  crc32: number
  byteLength: number
}

// Blob contents are immutable. Identity-based metadata is deliberately conservative:
// a replacement Blob computes a fresh checksum even when it has identical bytes.
const checksums = new WeakMap<Blob, ZipChecksum>()

export interface ZipSink {
  write(chunk: Uint8Array): Promise<void>
}

export interface WriteZipOptions {
  onProgress?: (progress: ZipProgress) => void
  /** Reports original-photo bytes that needed a fresh CRC-32 pass. */
  onChecksum?: (bytes: number) => void
  signal?: AbortSignal
}

class StoredZipBlob implements ZipInputFile {
  compression = 0
  ondata?: (error: Error | null, data: Uint8Array, final: boolean) => void

  constructor(
    readonly filename: string,
    readonly size: number,
    readonly crc: number,
  ) {}

  push(chunk: Uint8Array, final: boolean): void {
    this.ondata?.(null, chunk, final)
  }
}

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

type ZipSource = ZipPassThrough | StoredZipBlob

async function pushBlob(
  file: ZipSource,
  blob: Blob,
  flush: () => Promise<void>,
  report?: (bytes: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!blob.size) {
    file.push(new Uint8Array(), true)
    await flush()
    return
  }
  for (let offset = 0; offset < blob.size; offset += maxZipInputChunkBytes) {
    if (signal?.aborted) throw new DOMException('Project save cancelled', 'AbortError')
    const end = Math.min(blob.size, offset + maxZipInputChunkBytes)
    // Blob slices bound a pending source read independently of producer chunk
    // sizes, so a slow destination cannot make us read the rest of a photo.
    const chunk = new Uint8Array(await blob.slice(offset, end).arrayBuffer())
    if (signal?.aborted) throw new DOMException('Project save cancelled', 'AbortError')
    file.push(chunk, end === blob.size)
    await flush()
    report?.(chunk.byteLength)
  }
}

/**
 * Writes a store-only ZIP while holding only output generated from one bounded
 * input chunk. ZIP callbacks are synchronous, so each captured batch is
 * drained before another source chunk is read.
 */
export async function writeZip(
  entries: Iterable<ZipBlobEntry> | AsyncIterable<ZipBlobEntry>,
  sink: ZipSink,
  options: WriteZipOptions = {},
): Promise<void> {
  const list = isAsyncIterable(entries) ? undefined : [...entries]
  const source = list ?? entries
  const total = list?.reduce(
    (sum, entry) => sum + (entry.trackProgress === false ? 0 : entry.blob.size),
    0,
  )
  const output: Uint8Array[] = []
  let callbackError: Error | null = null
  const archive = new Zip((error, chunk, final) => {
    if (error) {
      callbackError = error
      return
    }
    if (chunk.byteLength) output.push(chunk)
    void final
  })
  const flush = async () => {
    if (callbackError) throw callbackError
    while (output.length) {
      if (options.signal?.aborted) throw new DOMException('Project save cancelled', 'AbortError')
      const chunk = output.shift()!
      await sink.write(chunk)
    }
    if (callbackError) throw callbackError
  }
  try {
    let completed = 0
    options.onProgress?.({ completed, total })
    for await (const entry of source) {
      if (options.signal?.aborted) throw new DOMException('Project save cancelled', 'AbortError')
      const known = checksums.get(entry.blob)
      const file: ZipSource =
        known && known.byteLength === entry.blob.size
          ? new StoredZipBlob(entry.name, known.byteLength, known.crc32)
          : new ZipPassThrough(entry.name)
      archive.add(file)
      await pushBlob(
        file,
        entry.blob,
        flush,
        (bytes) => {
          if (entry.trackProgress === false) return
          completed += bytes
          options.onProgress?.({ completed, total })
        },
        options.signal,
      )
      if (!known && file instanceof ZipPassThrough) {
        checksums.set(entry.blob, { crc32: file.crc, byteLength: file.size })
        if (entry.trackProgress !== false) options.onChecksum?.(file.size)
      }
    }
    archive.end()
    await flush()
    options.onProgress?.({ completed, total })
  } catch (error) {
    archive.terminate()
    throw error
  }
}

/** Builds a Blob for downloads and callers that genuinely need the complete archive. */
export async function zipBlobs(
  entries: Iterable<ZipBlobEntry> | AsyncIterable<ZipBlobEntry>,
  type: string,
  options: WriteZipOptions = {},
): Promise<Blob> {
  const chunks: BlobPart[] = []
  await writeZip(
    entries,
    {
      async write(chunk) {
        // fflate owns its output buffers; collector callers retain their own copy.
        chunks.push(chunk.slice())
      },
    },
    options,
  )
  return new Blob(chunks, { type })
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
