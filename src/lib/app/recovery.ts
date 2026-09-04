import type { CollageDocumentV1 } from '../domain/types'
import type { AssetRegistry } from '../render/assetRegistry'

export async function persistRecovery(
  document: CollageDocumentV1,
  registry: AssetRegistry,
): Promise<void> {
  const { saveRecovery } = await import('../persistence/autosave')
  await saveRecovery(document, registry)
}

export async function restoreLatestRecovery(currentProjectId: string): Promise<
  | {
      document: CollageDocumentV1
      assets: Map<string, Blob>
    }
  | undefined
> {
  const { loadLatestRecovery, loadRecoveryAssets } = await import('../persistence/autosave')
  const document = await loadLatestRecovery().catch(() => undefined)
  if (!document || document.projectId === currentProjectId) return undefined
  const assets = await loadRecoveryAssets(document)
  const embedded = Object.values(document.assets).filter(
    (asset) => asset.storage.kind === 'embedded',
  )
  if (embedded.some((asset) => !assets.has(asset.id))) return undefined
  return { document, assets }
}

interface RecoveryControllerHost {
  document: () => CollageDocumentV1
  registry: () => AssetRegistry
  installDocument: (document: CollageDocumentV1, assets: Map<string, Blob>) => Promise<void>
  onRestored: (document: CollageDocumentV1) => void
  announce: (message: string) => void
}

export class RecoveryController {
  private timer: ReturnType<typeof setTimeout> | undefined
  private ready = false

  constructor(private readonly host: RecoveryControllerHost) {}

  schedule(document: CollageDocumentV1) {
    if (!this.ready) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(
      () =>
        persistRecovery(document, this.host.registry()).catch(() =>
          this.host.announce('Local recovery save failed.'),
        ),
      1000,
    )
  }

  async restore(currentProjectId: string) {
    try {
      const recovery = await restoreLatestRecovery(currentProjectId)
      if (!recovery) return
      await this.host.installDocument(recovery.document, recovery.assets)
      this.host.onRestored(recovery.document)
      this.host.announce('Local recovery restored.')
    } finally {
      this.ready = true
      this.schedule(this.host.document())
    }
  }

  cleanup() {
    if (this.timer) clearTimeout(this.timer)
  }
}
