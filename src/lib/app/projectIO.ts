import type { AssetRecordV1, CollageDocumentV1 } from '../domain/types'
import { collageMimeType, linkedProjectMimeType } from '../persistence/formats'
import type { LinkedAssetMatch } from '../persistence/linkedAssets'
import type { AssetRegistry } from '../render/assetRegistry'

export type ProjectSaveFormat = 'embedded' | 'linked'
export type SaveTarget = { format: ProjectSaveFormat; handle?: FileSystemFileHandle }

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
  } = {},
) {
  if (target.handle) {
    const writable = await target.handle.createWritable()
    const reader = blob.stream().getReader()
    let completed = 0
    options.onProgress?.(completed, blob.size)
    try {
      while (true) {
        if (options.signal?.aborted) throw new DOMException('Project save cancelled', 'AbortError')
        const chunk = await reader.read()
        if (chunk.done) break
        await writable.write(chunk.value)
        completed += chunk.value.byteLength
        options.onProgress?.(completed, blob.size)
      }
      options.onFinalizing?.()
      await writable.close()
    } catch (error) {
      await reader.cancel().catch(() => undefined)
      await writable.abort().catch(() => undefined)
      throw error
    }
    return
  }
  const link = globalThis.document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
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
  return createArchive(document, { get: (assetId) => registry.getBlob(assetId) }, options)
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
): Promise<Map<string, LinkedAssetMatch>> {
  const { matchLinkedAssets } = await import('../persistence/linkedAssets')
  return matchLinkedAssets(assets, files)
}

export type { LinkedAssetMatch }
