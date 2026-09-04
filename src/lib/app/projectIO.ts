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
          description: 'Collage project — linked images',
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

export async function writeProjectBlob(target: SaveTarget, blob: Blob, filename: string) {
  if (target.handle) {
    const writable = await target.handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return
  }
  const link = globalThis.document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export async function openProjectFile(file: File) {
  const format = formatFromProjectFilename(file.name)
  if (format === 'embedded') {
    const { openArchive } = await import('../persistence/archive')
    return { format, opened: await openArchive(file) }
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
): Promise<Blob> {
  const { createArchive } = await import('../persistence/archive')
  return createArchive(document, { get: (assetId) => registry.getBlob(assetId) })
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
