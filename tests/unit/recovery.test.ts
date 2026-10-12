import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecoveryController, type RecoveryState } from '../../src/lib/app/recovery'
import { createProject } from '../../src/lib/domain/factories'
import type { AssetRegistry } from '../../src/lib/render/assetRegistry'

const autosaveMocks = vi.hoisted(() => ({
  saveRecovery: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/lib/persistence/autosave', () => autosaveMocks)

type ChannelMessage = {
  type: string
  projectId: string
  sender: string
  target?: string
  startedAt: number
}

class FakeBroadcastChannel {
  static latest?: FakeBroadcastChannel
  readonly messages: ChannelMessage[] = []
  private listener?: (event: MessageEvent<ChannelMessage>) => void

  constructor() {
    FakeBroadcastChannel.latest = this
  }

  addEventListener(_type: string, listener: (event: MessageEvent<ChannelMessage>) => void) {
    this.listener = listener
  }

  removeEventListener() {
    this.listener = undefined
  }

  postMessage(message: ChannelMessage) {
    this.messages.push(message)
  }

  close() {}

  emit(message: ChannelMessage) {
    this.listener?.({ data: message } as MessageEvent<ChannelMessage>)
  }
}

describe('recovery reload protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    FakeBroadcastChannel.latest = undefined
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel as unknown as typeof BroadcastChannel)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('refuses to report unsaved work as preserved when another tab owns recovery', async () => {
    const document = createProject()
    document.updatedAt = new Date(Date.parse(document.createdAt) + 1_000).toISOString()
    let state: RecoveryState | undefined
    const controller = new RecoveryController({
      document: () => document,
      registry: () => ({}) as AssetRegistry,
      installDocument: async () => true,
      onRestored: () => undefined,
      onState: (nextState) => (state = nextState),
      announce: () => undefined,
    })

    await controller.initialize(document.projectId)
    const channel = FakeBroadcastChannel.latest
    const probe = channel?.messages.find((message) => message.type === 'probe')
    expect(probe).toBeDefined()
    channel?.emit({
      type: 'owner',
      projectId: document.projectId,
      sender: 'other-tab',
      target: probe!.sender,
      startedAt: probe!.startedAt - 1,
    })

    await expect(controller.flushNow()).resolves.toBe(false)
    expect(autosaveMocks.saveRecovery).not.toHaveBeenCalled()
    expect(state?.status).toBe('conflict')
    controller.cleanup()
  })
})
