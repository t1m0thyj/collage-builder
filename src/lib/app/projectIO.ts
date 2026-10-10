import type { AssetRecordV1, CollageDocumentV1 } from '../domain/types'
import { collageMimeType, linkedProjectMimeType } from '../persistence/formats'
import type { LinkedAssetMatch, LinkedAssetMatchOptions } from '../persistence/linkedAssets'
import type { AssetRegistry } from '../render/assetRegistry'
import type { PreparedArchive } from '../persistence/archive'

export type ProjectSaveFormat = 'embedded' | 'linked'
export type SaveTarget = { format: ProjectSaveFormat; handle?: FileSystemFileHandle }

function fileWriteChunk(chunk: Uint8Array): Uint8Array<ArrayBuffer> {
  if (chunk.buffer instanceof ArrayBuffer)
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  // File System Access excludes SharedArrayBuffer-backed views. This copy is
  // only needed for that uncommon case; normal fflate output stays zero-copy.
  return Uint8Array.from(chunk)
}

type SavePickerWindow = Window &
  typeof globalThis & {
    showSaveFilePicker?: (options: {
      suggestedName?: string
      excludeAcceptAllOption?: boolean
      types?: Array<{ description: string; accept: Record<string, string[]> }>
    }) => Promise<FileSystemFileHandle>
  }

export function formatFromProjectFilename(name: string): ProjectSaveFormat {
  const normalized = name.toLocaleLowerCase()
  if (normalized.endsWith('.collage.json')) return 'linked'
  if (normalized.endsWith('.collage')) return 'embedded'
  throw new Error('Choose either .collage or .collage.json')
}

export async function chooseSaveTarget(
  projectTitle: string,
  preferredFormat: ProjectSaveFormat,
  chooseFallback: () => Promise<ProjectSaveFormat | null>,
): Promise<SaveTarget | null> {
  const pickerWindow = globalThis as unknown as SavePickerWindow
  if (!pickerWindow.showSaveFilePicker) {
    const format = await chooseFallback()
    return format ? { format } : null
  }
  try {
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName: `${projectTitle || 'collage'}${
        preferredFormat === 'linked' ? '.collage.json' : '.collage'
      }`,
      excludeAcceptAllOption: true,
      types: [
        {
          description: 'Collage archive — embedded images',
          accept: { [collageMimeType]: ['.collage'] },
        },
        {
          description: 'Linked collage project — needs photo folder',
          accept: { [linkedProjectMimeType]: ['.collage.json'] },
        },
      ],
    })
    return { format: formatFromProjectFilename(handle.name), handle }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

export async function writeProjectBlob(
  target: SaveTarget,
  blob: Blob,
  filename: string,
  options: {
    onProgress?: (completed: number, total: number) => void
    onFinalizing?: () => void
    signal?: AbortSignal
    isCurrent?: () => boolean
  } = {},
): Promise<'native' | 'download'> {
  const assertCurrent = () => {
    if (options.signal?.aborted) throw new DOMException('Project save cancelled', 'AbortError')
    if (options.isCurrent && !options.isCurrent())
      throw new Error('Project save is no longer current')
  }
  assertCurrent()
  if (target.handle) {
    const writable = await target.handle.createWritable({ keepExistingData: false })
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let completed = 0
    try {
      reader = blob.stream().getReader()
      options.onProgress?.(completed, blob.size)
      while (true) {
        assertCurrent()
        const chunk = await reader.read()
        if (chunk.done) break
        assertCurrent()
        await writable.write(fileWriteChunk(chunk.value))
        completed += chunk.value.byteLength
        options.onProgress?.(completed, blob.size)
      }
      assertCurrent()
      options.onFinalizing?.()
      assertCurrent()
      await writable.close()
    } catch (error) {
      await reader?.cancel().catch(() => undefined)
      await writable.abort().catch(() => undefined)
      throw error
    } finally {
      reader?.releaseLock()
    }
    return 'native'
  }
  const link = globalThis.document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
  return 'download'
}

export async function openProjectFile(
  file: File,
  options: {
    onProgress?: (
      phase: 'Reading project' | 'Checking photos',
      completed: number,
      total: number,
    ) => void
  } = {},
) {
  const format = formatFromProjectFilename(file.name)
  if (format === 'embedded') {
    const { openArchive } = await import('../persistence/archive')
    return { format, opened: await openArchive(file, options) }
  }
  const { openLinkedProject } = await import('../persistence/linkedAssets')
  return {
    format,
    opened: {
      document: await openLinkedProject(file),
      assets: new Map<string, Blob>(),
      missingAssetIds: [] as string[],
    },
  }
}

export async function createEmbeddedProject(
  document: CollageDocumentV1,
  registry: AssetRegistry,
  options: { onProgress?: (completed: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<Blob> {
  const { createArchive } = await import('../persistence/archive')
  return createArchive(
    document,
    {
      get: (assetId) => registry.getBlob(assetId),
      hasActive: (assetId, sha256) => registry.hasActive(assetId, sha256),
    },
    options,
  )
}

export async function prepareEmbeddedProject(
  document: CollageDocumentV1,
  registry: AssetRegistry,
): Promise<PreparedArchive> {
  const { prepareArchive } = await import('../persistence/archive')
  return prepareArchive(document, {
    get: (assetId) => registry.getBlob(assetId),
    hasActive: (assetId, sha256) => registry.hasActive(assetId, sha256),
  })
}

/**
 * Native handles receive ZIP chunks directly. The download path deliberately
 * collects a Blob because the browser download API only accepts a URL.
 */
export async function writeEmbeddedProject(
  target: SaveTarget,
  archive: PreparedArchive,
  filename: string,
  options: {
    onProgress?: (completed: number, total: number) => void
    onFinalizing?: () => void
    signal?: AbortSignal
    isCurrent?: () => boolean
  } = {},
): Promise<'native' | 'download'> {
  const assertCurrent = () => {
    if (options.signal?.aborted) throw new DOMException('Project save cancelled', 'AbortError')
    if (options.isCurrent && !options.isCurrent())
      throw new Error('Project save is no longer current')
  }
  if (!target.handle) {
    const { archiveBlob } = await import('../persistence/archive')
    const blob = await archiveBlob(archive, {
      signal: options.signal,
      onProgress: ({ completed, total }) => options.onProgress?.(completed, total ?? 0),
    })
    assertCurrent()
    return writeProjectBlob(target, blob, filename, {
      onFinalizing: options.onFinalizing,
      signal: options.signal,
    })
  }

  const { writeArchive } = await import('../persistence/archive')
  assertCurrent()
  const writable = await target.handle.createWritable({ keepExistingData: false })
  let closed = false
  try {
    await writeArchive(
      archive,
      {
        async write(chunk) {
          assertCurrent()
          await writable.write(fileWriteChunk(chunk))
        },
      },
      {
        signal: options.signal,
        onProgress: ({ completed, total }) => options.onProgress?.(completed, total ?? 0),
      },
    )
    assertCurrent()
    options.onFinalizing?.()
    assertCurrent()
    await writable.close()
    closed = true
    return 'native'
  } catch (error) {
    if (!closed) await writable.abort().catch(() => undefined)
    throw error
  }
}

export async function createLinkedProjectFile(
  document: CollageDocumentV1,
  matches: Map<string, LinkedAssetMatch>,
): Promise<Blob> {
  const { createLinkedProject } = await import('../persistence/linkedAssets')
  return createLinkedProject(document, matches)
}

export async function matchProjectAssets(
  assets: Record<string, AssetRecordV1>,
  files: FileList,
  options: LinkedAssetMatchOptions = {},
): Promise<Map<string, LinkedAssetMatch>> {
  const { matchLinkedAssets } = await import('../persistence/linkedAssets')
  return matchLinkedAssets(assets, files, options)
}

export type { LinkedAssetMatch }
