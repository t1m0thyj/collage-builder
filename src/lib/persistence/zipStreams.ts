import { AsyncUnzipInflate, Unzip, UnzipPassThrough, Zip, ZipPassThrough } from 'fflate'

export interface ZipBlobEntry {
  name: string
  blob: Blob
}

export interface BoundedUnzipOptions {
  maxEntries: number
  maxEntryBytes: number
  maxExpandedBytes: number
  validateName: (name: string) => void
}

async function pushBlob(file: ZipPassThrough, blob: Blob): Promise<void> {
  const reader = blob.stream().getReader()
  let current = await reader.read()
  if (current.done) {
    file.push(new Uint8Array(), true)
    return
  }
  while (!current.done) {
    const next = await reader.read()
    file.push(current.value, next.done)
    current = next
  }
}

/** Builds a store-only ZIP incrementally so already-compressed photos are not copied repeatedly. */
export async function zipBlobs(entries: Iterable<ZipBlobEntry>, type: string): Promise<Blob> {
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
    for (const entry of entries) {
      const file = new ZipPassThrough(entry.name)
      archive.add(file)
      await pushBlob(file, entry.blob)
    }
    archive.end()
    await complete
    return new Blob(chunks, { type })
  } catch (error) {
    archive.terminate()
    throw error
  }
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
    const seenNames = new Set<string>()

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
    archive.register(AsyncUnzipInflate)

    void (async () => {
      const reader = blob.stream().getReader()
      try {
        let current = await reader.read()
        if (current.done) {
          archive.push(new Uint8Array(), true)
        } else {
          while (!current.done && !failed) {
            const next = await reader.read()
            archive.push(current.value, next.done)
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
