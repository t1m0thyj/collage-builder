import { describe, expect, it, vi } from 'vitest'
import { preparePageImages, replaceProjectDocument } from '../../src/lib/app/imageSession'
import { createPage, createProject, defaultPlacement } from '../../src/lib/domain/factories'
import type { PageV1 } from '../../src/lib/domain/types'
import { AssetRegistry } from '../../src/lib/render/assetRegistry'
import { ProjectStore } from '../../src/lib/state/projectStore'

function page(id: string, assetId: string): PageV1 {
  return {
    id,
    name: id,
    width: 100,
    height: 100,
    layout: {
      presetId: 'test',
      root: { kind: 'leaf', slotId: 'slot' },
    },
    slots: { slot: { assetId, placement: { zoom: 1, positionX: 0.5, positionY: 0.5 } } },
    style: { backgroundColor: '#ffffff', padding: 0, gap: 0, cornerRadius: 0, shadow: null },
  }
}

describe('page image session', () => {
  it('prepares up to three project photos concurrently before replacing the document', async () => {
    const project = new ProjectStore(createProject('Before open'))
    const document = createProject('After open')
    document.pages = Array.from({ length: 5 }, (_, index) => createPage(`Page ${index + 1}`))
    const blobs = new Map<string, Blob>()
    const gates = new Map<string, () => void>()
    for (let index = 0; index < 5; index += 1) {
      const id = `asset-${index}`
      document.assets[id] = {
        id,
        originalName: `${id}.png`,
        mediaType: 'image/png',
        byteLength: 1,
        width: 1,
        height: 1,
        sha256: `hash-${index}`,
        storage: { kind: 'embedded', archivePath: `assets/${id}` },
      }
      blobs.set(id, new Blob(['x']))
      const firstSlot = Object.keys(document.pages[index].slots)[0]
      document.pages[index].slots[firstSlot] = { assetId: id, placement: defaultPlacement() }
    }
    let active = 0
    let peak = 0
    const started: string[] = []
    const progress: Array<[number, number]> = []
    const visiblePages: string[][] = []
    const register = vi
      .spyOn(AssetRegistry.prototype, 'register')
      .mockImplementation(async (id) => {
        active += 1
        peak = Math.max(peak, active)
        started.push(id)
        await new Promise<void>((resolve) => gates.set(id, resolve))
        active -= 1
        return true
      })
    const currentRegistry = new AssetRegistry()
    let installedRegistry = currentRegistry
    try {
      const opening = replaceProjectDocument(
        project,
        currentRegistry,
        document,
        blobs,
        (registry) => (installedRegistry = registry),
        () => true,
        (completed, total, readyPages) => {
          progress.push([completed, total])
          visiblePages.push(readyPages.map((page) => page.name))
        },
      )
      expect(started).toEqual(['asset-0', 'asset-1', 'asset-2'])
      expect(project.snapshot().title).toBe('Before open')
      gates.get('asset-0')?.()
      await vi.waitFor(() => expect(started).toHaveLength(4))
      gates.get('asset-1')?.()
      await vi.waitFor(() => expect(started).toHaveLength(5))
      gates.get('asset-2')?.()
      gates.get('asset-3')?.()
      gates.get('asset-4')?.()
      await expect(opening).resolves.toBe(true)
      expect(peak).toBe(3)
      expect(progress).toEqual([
        [0, 5],
        [1, 5],
        [2, 5],
        [3, 5],
        [4, 5],
        [5, 5],
      ])
      expect(visiblePages).toEqual([
        [],
        ['Page 1'],
        ['Page 1', 'Page 2'],
        ['Page 1', 'Page 2', 'Page 3'],
        ['Page 1', 'Page 2', 'Page 3', 'Page 4'],
        ['Page 1', 'Page 2', 'Page 3', 'Page 4', 'Page 5'],
      ])
      expect(project.snapshot().title).toBe('After open')
      expect(installedRegistry).not.toBe(currentRegistry)
    } finally {
      register.mockRestore()
    }
  })

  it('keeps the current project when one concurrent photo preparation fails', async () => {
    const project = new ProjectStore(createProject('Current project'))
    const document = createProject('Broken project')
    document.pages = [createPage('Ready page'), createPage('Broken page')]
    const blobs = new Map<string, Blob>()
    for (let index = 0; index < 4; index += 1) {
      const id = `asset-${index}`
      document.assets[id] = {
        id,
        originalName: `${id}.png`,
        mediaType: 'image/png',
        byteLength: 1,
        width: 1,
        height: 1,
        sha256: `hash-${index}`,
        storage: { kind: 'embedded', archivePath: `assets/${id}` },
      }
      blobs.set(id, new Blob(['x']))
      if (index < 2) {
        const firstSlot = Object.keys(document.pages[index].slots)[0]
        document.pages[index].slots[firstSlot] = { assetId: id, placement: defaultPlacement() }
      }
    }
    let finishFirst: (() => void) | undefined
    const first = new Promise<void>((resolve) => (finishFirst = resolve))
    let failSecond: (() => void) | undefined
    const second = new Promise<void>((resolve) => (failSecond = resolve))
    let finishOther: (() => void) | undefined
    const other = new Promise<void>((resolve) => (finishOther = resolve))
    const register = vi
      .spyOn(AssetRegistry.prototype, 'register')
      .mockImplementation(async (id) => {
        if (id === 'asset-0') await first
        else if (id === 'asset-1') {
          await second
          throw new Error('Cannot decode photo')
        } else await other
        return true
      })
    const clear = vi.spyOn(AssetRegistry.prototype, 'clear')
    const currentRegistry = new AssetRegistry()
    let installedRegistry = currentRegistry
    const visiblePages: string[][] = []
    try {
      const opening = replaceProjectDocument(
        project,
        currentRegistry,
        document,
        blobs,
        (registry) => {
          installedRegistry = registry
        },
        () => true,
        (_completed, _total, readyPages) => visiblePages.push(readyPages.map((page) => page.name)),
      )
      finishFirst?.()
      await vi.waitFor(() => expect(visiblePages).toContainEqual(['Ready page']))
      expect(project.snapshot().title).toBe('Current project')
      failSecond?.()
      finishOther?.()
      await expect(opening).rejects.toThrow('Cannot decode photo')
      expect(register).toHaveBeenCalledTimes(4)
      expect(clear).toHaveBeenCalledTimes(1)
      expect(project.snapshot().title).toBe('Current project')
      expect(installedRegistry).toBe(currentRegistry)
    } finally {
      register.mockRestore()
      clear.mockRestore()
    }
  })

  it('installs the remembered page before secondary pages prepare in the background', async () => {
    const project = new ProjectStore(createProject('Before open'))
    const document = createProject('After open')
    document.pages = [
      page('Page 1', 'asset-0'),
      page('Page 2', 'asset-1'),
      page('Page 3', 'asset-2'),
    ]
    const blobs = new Map<string, Blob>()
    for (let index = 0; index < 3; index += 1) {
      const id = `asset-${index}`
      document.assets[id] = {
        id,
        originalName: `${id}.png`,
        mediaType: 'image/png',
        byteLength: 1,
        width: 1,
        height: 1,
        sha256: `hash-${index}`,
        storage: { kind: 'embedded', archivePath: `assets/${id}` },
      }
      blobs.set(id, new Blob(['x']))
    }
    const gates = new Map<string, () => void>()
    const started: string[] = []
    const register = vi
      .spyOn(AssetRegistry.prototype, 'register')
      .mockImplementation(async (id) => {
        started.push(id)
        await new Promise<void>((resolve) => gates.set(id, resolve))
        return true
      })
    const currentRegistry = new AssetRegistry()
    let installedRegistry = currentRegistry
    try {
      const opening = replaceProjectDocument(
        project,
        currentRegistry,
        document,
        blobs,
        (registry) => (installedRegistry = registry),
        () => true,
        () => undefined,
        true,
        'Page 2',
        (registry) => registry === installedRegistry,
      )
      await vi.waitFor(() => expect(started).toEqual(['asset-1']))
      gates.get('asset-1')?.()
      await expect(opening).resolves.toBe(true)
      expect(project.snapshot().title).toBe('After open')
      await vi.waitFor(() => expect(started).toContain('asset-0'))
      gates.get('asset-0')?.()
      await vi.waitFor(() => expect(started).toContain('asset-2'))
      gates.get('asset-2')?.()
    } finally {
      register.mockRestore()
    }
  })

  it('shows decoded thumbnails before the full page images finish loading', async () => {
    let finishFullLoad: (() => void) | undefined
    const fullLoad = new Promise<void>((resolve) => (finishFullLoad = resolve))
    const events: string[] = []
    const registry = {
      getBlob: () => new Blob(['image']),
      ensureThumbnailImages: async () => {
        events.push('thumbnails')
        return true
      },
      ensureImages: async () => {
        await fullLoad
        events.push('full images')
        return true
      },
      retainDecodedForPage: vi.fn(),
    } as unknown as AssetRegistry

    const loading = preparePageImages(
      page('a', 'asset-a'),
      registry,
      () => true,
      () => events.push('preview ready'),
    )
    await vi.waitFor(() => expect(events).toContain('preview ready'))
    expect(events).toEqual(['thumbnails', 'preview ready'])
    finishFullLoad?.()
    await loading
    expect(events).toEqual(['thumbnails', 'preview ready', 'full images'])
  })

  it('does not let a stale page request clean up the active page images', async () => {
    let resolveFirstLoad: (() => void) | undefined
    const firstLoad = new Promise<void>((resolve) => (resolveFirstLoad = resolve))
    const registry = {
      getBlob: () => new Blob(['image']),
      ensureThumbnailImages: vi.fn().mockResolvedValue(false),
      ensureImages: vi
        .fn()
        .mockImplementationOnce(() => firstLoad.then(() => true))
        .mockResolvedValueOnce(true),
      retainDecodedForPage: vi.fn(),
    } as unknown as AssetRegistry
    let activePageId = 'a'

    const loadingA = preparePageImages(page('a', 'asset-a'), registry, () => activePageId === 'a')
    await Promise.resolve()
    activePageId = 'b'
    await preparePageImages(page('b', 'asset-b'), registry, () => activePageId === 'b')
    resolveFirstLoad?.()
    await loadingA

    expect(registry.retainDecodedForPage).toHaveBeenCalledTimes(1)
    expect(registry.retainDecodedForPage).toHaveBeenCalledWith(['asset-b'])
  })
})
