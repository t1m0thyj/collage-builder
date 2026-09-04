import type { CollageDocumentV1 } from '../domain/types'
import type { RecoveryManagementSnapshot } from '../persistence/autosave'
import type { AssetRegistry } from '../render/assetRegistry'
import { createId } from '../utils/ids'

export type RecoveryStateStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'failed' | 'conflict'

export interface RecoveryState {
  status: RecoveryStateStatus
  message: string
  detail?: string
  savedAt?: string
}

export async function persistRecovery(
  document: CollageDocumentV1,
  registry: AssetRegistry,
): Promise<void> {
  const { saveRecovery } = await import('../persistence/autosave')
  await saveRecovery(document, registry)
}

async function loadRestorableRecovery(projectId?: string): Promise<
  | {
      document: CollageDocumentV1
      assets: Map<string, Blob>
    }
  | undefined
> {
  const { loadLatestRecovery, loadRecovery, loadRecoveryAssets } =
    await import('../persistence/autosave')
  const document = await (projectId ? loadRecovery(projectId) : loadLatestRecovery()).catch(
    () => undefined,
  )
  if (!document) return undefined
  const assets = await loadRecoveryAssets(document)
  const embedded = Object.values(document.assets).filter(
    (asset) => asset.storage.kind === 'embedded',
  )
  if (embedded.some((asset) => !assets.has(asset.id))) return undefined
  return { document, assets }
}

export async function restoreLatestRecovery(currentProjectId: string): Promise<
  | {
      document: CollageDocumentV1
      assets: Map<string, Blob>
    }
  | undefined
> {
  const recovery = await loadRestorableRecovery()
  return recovery?.document.projectId === currentProjectId ? undefined : recovery
}

interface RecoveryControllerHost {
  document: () => CollageDocumentV1
  registry: () => AssetRegistry
  installDocument: (document: CollageDocumentV1, assets: Map<string, Blob>) => Promise<void>
  onRestored: (document: CollageDocumentV1) => void
  onState: (state: RecoveryState) => void
  announce: (message: string) => void
}

type CoordinationMessage = {
  type: 'probe' | 'owner' | 'claim' | 'takeover' | 'release'
  projectId: string
  sender: string
  target?: string
  startedAt: number
}

class ProjectTabCoordinator {
  private readonly instanceId = createId()
  private readonly channel?: BroadcastChannel
  private projectId?: string
  private startedAt = 0
  private owner = false
  private settling?: ReturnType<typeof setTimeout>

  constructor(private readonly onConflictChange: (conflict: boolean) => void) {
    if (typeof globalThis.BroadcastChannel !== 'function') {
      this.owner = true
      return
    }
    this.channel = new BroadcastChannel('collage-builder:project-ownership')
    this.channel.addEventListener('message', this.onMessage)
  }

  activate(projectId: string): void {
    if (projectId === this.projectId) return
    this.release()
    this.projectId = projectId
    this.startedAt = Date.now()
    this.owner = !this.channel
    this.onConflictChange(false)
    if (!this.channel) return
    this.post('probe')
    this.settling = setTimeout(() => {
      this.settling = undefined
      if (!this.projectId) return
      this.owner = true
      this.onConflictChange(false)
      this.post('claim')
    }, 160)
  }

  takeOver(): void {
    if (!this.projectId) return
    if (this.settling) clearTimeout(this.settling)
    this.settling = undefined
    this.startedAt = 0
    this.owner = true
    this.onConflictChange(false)
    this.post('takeover')
  }

  close(): void {
    this.release()
    this.channel?.removeEventListener('message', this.onMessage)
    this.channel?.close()
  }

  private release(): void {
    if (this.settling) clearTimeout(this.settling)
    this.settling = undefined
    if (this.owner && this.projectId) this.post('release')
    this.owner = false
    this.projectId = undefined
  }

  private post(type: CoordinationMessage['type'], target?: string): void {
    if (!this.channel || !this.projectId) return
    this.channel.postMessage({
      type,
      projectId: this.projectId,
      sender: this.instanceId,
      target,
      startedAt: this.startedAt,
    } satisfies CoordinationMessage)
  }

  private incomingHasPriority(message: CoordinationMessage): boolean {
    return (
      message.startedAt < this.startedAt ||
      (message.startedAt === this.startedAt && message.sender < this.instanceId)
    )
  }

  private loseOwnership(): void {
    if (this.settling) clearTimeout(this.settling)
    this.settling = undefined
    this.owner = false
    this.onConflictChange(true)
  }

  private onMessage = (event: MessageEvent<CoordinationMessage>) => {
    const message = event.data
    if (!message || message.sender === this.instanceId || message.projectId !== this.projectId)
      return
    if (message.type === 'probe') {
      if (this.owner) this.post('owner', message.sender)
      return
    }
    if (message.type === 'owner' && message.target === this.instanceId) {
      this.loseOwnership()
      return
    }
    if (message.type === 'claim') {
      if (this.incomingHasPriority(message)) this.loseOwnership()
      else if (this.owner) this.post('owner', message.sender)
      return
    }
    if (message.type === 'takeover') this.loseOwnership()
  }
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return 'an unknown amount'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = units[0]
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024
    unit = units[index]
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`
}

async function persistenceFailureDetail(error: unknown): Promise<string> {
  const { getRecoveryStorageEstimate } = await import('../persistence/autosave')
  const storage = await getRecoveryStorageEstimate().catch(
    (): RecoveryManagementSnapshot['storage'] => ({ persistenceSupported: false }),
  )
  const usage = formatBytes(storage.usage)
  const quota = formatBytes(storage.quota)
  if (error instanceof DOMException && error.name === 'QuotaExceededError')
    return `Browser storage is full (${usage} used of ${quota}). Download a project file, then remove older local recoveries.`
  if (error instanceof Error && error.message) return error.message
  return 'The browser did not accept the local recovery data.'
}

export class RecoveryController {
  private timer: ReturnType<typeof setTimeout> | undefined
  private ready = false
  private conflict = false
  private revision = 0
  private persistenceRequested = false
  private currentDocument?: CollageDocumentV1
  private writeChain: Promise<void> = Promise.resolve()
  private readonly coordinator: ProjectTabCoordinator

  constructor(private readonly host: RecoveryControllerHost) {
    this.coordinator = new ProjectTabCoordinator((conflict) => {
      const changed = this.conflict !== conflict
      this.conflict = conflict
      if (conflict) {
        if (this.timer) clearTimeout(this.timer)
        this.timer = undefined
        this.host.onState({
          status: 'conflict',
          message: 'Autosave paused',
          detail: 'This project is being edited in another tab.',
        })
        if (changed)
          this.host.announce('Autosave paused because this project is open in another tab.')
      } else if (changed && this.ready && this.currentDocument) {
        this.schedule(this.currentDocument)
      }
    })
  }

  schedule(document: CollageDocumentV1): void {
    this.currentDocument = document
    this.coordinator.activate(document.projectId)
    if (!this.ready || this.conflict) return
    if (this.timer) clearTimeout(this.timer)
    const revision = ++this.revision
    this.host.onState({ status: 'pending', message: 'Autosave pending' })
    this.timer = setTimeout(() => void this.queuePersist(document, revision), 1000)
  }

  async restore(currentProjectId: string): Promise<void> {
    try {
      const recovery = await restoreLatestRecovery(currentProjectId)
      if (!recovery) return
      await this.installRecovery(recovery)
    } finally {
      this.ready = true
      this.schedule(this.host.document())
    }
  }

  async restoreProject(projectId: string): Promise<void> {
    if (projectId === this.host.document().projectId) return
    await this.flush()
    const recovery = await loadRestorableRecovery(projectId)
    if (!recovery)
      throw new Error('That local recovery is incomplete or corrupt and cannot be restored.')
    await this.installRecovery(recovery)
    this.schedule(this.host.document())
  }

  async managementSnapshot(): Promise<RecoveryManagementSnapshot> {
    const { getRecoveryManagementSnapshot } = await import('../persistence/autosave')
    return getRecoveryManagementSnapshot()
  }

  async deleteProject(projectId: string): Promise<void> {
    if (projectId === this.currentDocument?.projectId) this.cancelPendingWrite()
    await this.writeChain
    const { deleteRecovery } = await import('../persistence/autosave')
    await deleteRecovery(projectId)
    if (projectId === this.currentDocument?.projectId && !this.conflict)
      this.host.onState({ status: 'idle', message: 'Recovery removed' })
  }

  async clearProjects(): Promise<void> {
    this.cancelPendingWrite()
    await this.writeChain
    const { clearRecoveries } = await import('../persistence/autosave')
    await clearRecoveries()
    if (!this.conflict) this.host.onState({ status: 'idle', message: 'Recoveries removed' })
  }

  async requestPersistence(): Promise<boolean | undefined> {
    this.persistenceRequested = true
    const { requestPersistentStorage } = await import('../persistence/autosave')
    return requestPersistentStorage()
  }

  takeOver(): void {
    this.coordinator.takeOver()
    this.host.announce('Autosave is now active in this tab.')
  }

  cleanup(): void {
    if (this.timer) clearTimeout(this.timer)
    this.coordinator.close()
  }

  private async installRecovery(recovery: {
    document: CollageDocumentV1
    assets: Map<string, Blob>
  }): Promise<void> {
    await this.host.installDocument(recovery.document, recovery.assets)
    this.host.onRestored(recovery.document)
    this.host.announce('Local recovery restored.')
  }

  private async flush(): Promise<void> {
    if (!this.ready || this.conflict || !this.currentDocument) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    await this.queuePersist(this.currentDocument, ++this.revision)
  }

  private cancelPendingWrite(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.revision += 1
  }

  private queuePersist(document: CollageDocumentV1, revision: number): Promise<void> {
    const write = this.writeChain.then(() => this.persist(document, revision))
    this.writeChain = write.catch(() => undefined)
    return write
  }

  private async persist(document: CollageDocumentV1, revision: number): Promise<void> {
    this.timer = undefined
    if (this.conflict || document.projectId !== this.host.document().projectId) return
    this.host.onState({ status: 'saving', message: 'Saving locally…' })
    try {
      await persistRecovery(document, this.host.registry())
      if (revision === this.revision)
        this.host.onState({
          status: 'saved',
          message: 'Saved locally',
          savedAt: new Date().toISOString(),
        })
      if (
        !this.persistenceRequested &&
        (document.updatedAt !== document.createdAt || Object.keys(document.assets).length > 0)
      ) {
        this.persistenceRequested = true
        try {
          const { getRecoveryStorageEstimate, requestPersistentStorage } =
            await import('../persistence/autosave')
          const storage = await getRecoveryStorageEstimate()
          if (storage.persistenceSupported && !storage.persisted) await requestPersistentStorage()
        } catch {
          // The recovery is safely stored even if the optional persistence request fails.
        }
      }
    } catch (error) {
      const detail = await persistenceFailureDetail(error)
      if (revision === this.revision) {
        this.host.onState({ status: 'failed', message: 'Autosave failed', detail })
        this.host.announce(`Local recovery save failed. ${detail}`)
      }
    }
  }
}
