<script lang="ts">
  import { createProject } from './lib/domain/factories'
  import { resolveLayout } from './lib/domain/geometry'
  import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    FileImage,
    Files,
    FolderOpen,
    Grid2X2,
    ImageIcon,
    Link2,
    Link2Off,
    List,
    Minus,
    MoreHorizontal,
    Palette,
    Plus,
    Redo2,
    RefreshCw,
    SlidersHorizontal,
    Sparkles,
    Undo2,
    Upload,
    X,
    Trash2,
  } from '@lucide/svelte'
  import PageActions from './lib/components/PageActions.svelte'
  import type { PageV1, SlotContentV1 } from './lib/domain/types'
  import CanvasEditor from './lib/components/editor/CanvasEditor.svelte'
  import { validateImportedImage } from './lib/domain/importImage'
  import { layoutCatalog } from './lib/layouts/catalog'
  import { previewFrames, previewFrameStyle } from './lib/layouts/preview'
  import { ProjectStore } from './lib/state/projectStore'
  import { AssetRegistry } from './lib/render/assetRegistry'
  import { onMount } from 'svelte'
  import * as Collapsible from '$lib/components/ui/collapsible'
  import Button from '$lib/components/ui/button/button.svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import Input from '$lib/components/ui/input/input.svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import * as Popover from '$lib/components/ui/popover'
  import * as Select from '$lib/components/ui/select'
  import * as Slider from '$lib/components/ui/slider'
  import * as Switch from '$lib/components/ui/switch'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import { renderPagePng, resolveExportRange, zipPngs } from './lib/render/exportPng'
  import {
    collageMimeType,
    createArchive,
    maxProjectBytes,
    openArchive,
  } from './lib/persistence/archive'
  import { loadLatestRecovery, loadRecoveryAssets, saveRecovery } from './lib/persistence/autosave'
  import {
    createLinkedProject,
    linkedProjectMimeType,
    matchLinkedAssets,
    openLinkedProject,
  } from './lib/persistence/linkedAssets'

  type SidebarTab = 'layouts' | 'images'
  type ProjectSaveFormat = 'embedded' | 'linked'
  type SaveTarget = { format: ProjectSaveFormat; handle?: FileSystemFileHandle }
  type SavePickerWindow = Window &
    typeof globalThis & {
      showSaveFilePicker?: (options: {
        suggestedName?: string
        excludeAcceptAllOption?: boolean
        types?: Array<{ description: string; accept: Record<string, string[]> }>
      }) => Promise<FileSystemFileHandle>
    }
  const minSidebarWidth = 210
  const defaultSidebarWidth = 255
  const maxSidebarWidth = 360
  const sidebarWidthsStorageKey = 'collage-builder:sidebar-widths'
  const recentColorsStorageKey = 'collage-builder:recent-custom-colors'

  const project = new ProjectStore(createProject())
  const assetRegistry = new AssetRegistry()
  const colorPresets = [
    '#2507B3', '#4F37C1', '#9D8AF6',
    '#377A00', '#67BA24', '#A5E06C',
    '#0071AF', '#1792D5', '#5DC1F2',
    '#A30022', '#CF153C', '#F3718D',
    '#BF4800', '#E7691D', '#FDA857',
    '#A77500', '#E5AB26', '#FDDA5A',
    '#000000', '#505050', '#808080', '#C0C0C0', '#E6E6E6', '#FFFFFF',
  ]
  const layoutGroups = [...new Set(layoutCatalog.map((layout) => Math.min(layout.frameCount, 11)))]
    .filter((frameCount) => frameCount > 1)
    .sort((left, right) => left - right)
    .map((frameCount) => ({
      frameCount,
      label: frameCount === 11 ? '11+' : String(frameCount),
      layouts: layoutCatalog
        .filter((layout) =>
          frameCount === 11 ? layout.frameCount >= 11 : layout.frameCount === frameCount,
        )
        .sort((left, right) => (frameCount === 11 ? left.frameCount - right.frameCount : 0)),
    }))
  let document = project.snapshot()
  let recentColors: string[] = []
  let activePageId = document.pages[0].id
  let activePage: PageV1 = document.pages[0]
  let selectedSlotId: string | null = null
  function rememberColor(color: string) {
    const normalized = color.slice(0, 7).toUpperCase()
    recentColors = [normalized, ...recentColors.filter((candidate) => candidate !== normalized)].slice(0, 4)
    try {
      globalThis.localStorage.setItem(recentColorsStorageKey, JSON.stringify(recentColors))
    } catch {
      // Color selection should still work when persistent storage is unavailable.
    }
  }
  function setBackgroundColor(color: string, rememberCustom = false) {
    if (rememberCustom) rememberColor(color)
    updateStyle({ backgroundColor: `${color.slice(0, 7).toUpperCase()}FF` })
  }
  function setShadowColor(color: string, rememberCustom = false) {
    const normalized = color.slice(0, 7).toUpperCase()
    if (rememberCustom) rememberColor(normalized)
    updateStyle({ shadow: { ...activePage.style.shadow, color: normalized } })
  }
  let libraryTargetSlotId: string | null = null
  let uploadInput: HTMLInputElement
  let cropZoom = 1
  let imageListOverflows = false
  let layoutListOverflows = false
  let pageAspectLinked = false
  let viewportZoom = 1
  let isViewportFit = true
  let fittedViewportZoom = 1
  let leftSidebarWidth = defaultSidebarWidth
  let rightSidebarWidth = defaultSidebarWidth
  let sidebarResize: { side: 'left' | 'right'; startX: number; startWidth: number } | null =
    null
  let cropModeSlotId: string | null = null
  let cropOrigin: { pageId: string; slotId: string; placement: SlotContentV1['placement'] } | null =
    null
  let selectedAssetId: string | null = null
  let isPageMenuOpen = false
  let pendingNavigation: 'new' | 'open' | null = null
  let expandedLayoutCount: number | null = null
  let layoutAccordionPageId: string | null = null
  let replaceInput: HTMLInputElement
  let relinkInput: HTMLInputElement
  let openInput: HTMLInputElement
  let linkedFolderInput: HTMLInputElement
  let linkedFolderResolver: ((files: FileList | null) => void) | null = null
  let pendingLinkedDocument: typeof document | null = null
  let isSaveFormatOpen = false
  let saveFormatResolver: ((format: ProjectSaveFormat | null) => void) | null = null
  let currentSaveTarget: SaveTarget | null = null
  let currentSaveFormat: ProjectSaveFormat = 'embedded'
  let hasSavedProject = false
  let linkedSaveMatches = new Map<string, { file: File; relativePath: string }>()
  let assetFilter: 'all' | 'used' | 'unused' | 'missing' = 'all'
  let assetQuery = ''
  let assetSort: 'import' | 'name' | 'size' | 'usage' = 'import'
  let selectedAssetIds: string[] = []
  let imageManagerView: 'grid' | 'list' = 'grid'
  let pendingRemovalAssetIds: string[] | null = null
  let isExportOpen = false
  let exportScope: 'current' | 'all' | 'range' = 'current'
  let exportRange = '1-1'
  let exportWidth = 3840
  let isExporting = false
  let exportProgress = ''
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined
  let recoveryReady = false
  let isDirty = false
  let recoveredOnly = false
  let missingAssetIds = new Set<string>()
  let prefersDark = false

  function applySystemTheme(systemPrefersDark: boolean) {
    prefersDark = systemPrefersDark
    globalThis.document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light'
  }
  function scheduleRecovery(value: typeof document) {
    if (!recoveryReady) return
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(
      () => saveRecovery(value, assetRegistry).catch(() => announce('Local recovery save failed.')),
      1000,
    )
  }
  project.document.subscribe((value) => {
    document = value
    for (const asset of Object.values(value.assets)) {
      if (assetRegistry.hasRetained(asset.id, asset.sha256))
        void assetRegistry.restoreRetained(asset.id, asset.sha256)
    }
    scheduleRecovery(value)
  })
  project.isDirty.subscribe((value) => (isDirty = value))

  onMount(() => {
    restoreSidebarWidths()
    restoreRecentColors()
    const darkMedia = globalThis.matchMedia('(prefers-color-scheme: dark)')
    const syncDarkMode = () => applySystemTheme(darkMedia.matches)
    syncDarkMode()
    darkMedia.addEventListener('change', syncDarkMode)
    void (async () => {
      try {
        const recovery = await loadLatestRecovery().catch(() => undefined)
        if (!recovery || recovery.projectId === document.projectId) return
        const blobs = await loadRecoveryAssets(recovery)
        const embedded = Object.values(recovery.assets).filter(
          (asset) => asset.storage.kind === 'embedded',
        )
        if (embedded.some((asset) => !blobs.has(asset.id))) return
        assetRegistry.clear()
        for (const [assetId, blob] of blobs)
          await assetRegistry.register(assetId, blob, recovery.assets[assetId]?.sha256)
        project.replaceDocument(recovery)
        recoveredOnly = true
        activePageId = recovery.pages[0].id
        projectTitle = recovery.title
        announce('Local recovery restored.')
      } finally {
        recoveryReady = true
        scheduleRecovery(document)
      }
    })()
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select')) return
      if (event.key === 'Escape' && pendingNavigation) {
        pendingNavigation = null
        event.preventDefault()
        return
      }
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveProject(event.shiftKey)
        return
      }
      if (modifier && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        requestOpen()
        return
      }
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) project.redo()
        else project.undo()
        return
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        project.redo()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedSlotId) {
        project.clearSlot(activePage.id, selectedSlotId)
        return
      }
      if (event.key === 'Enter' && selectedContent && selectedSlotId) {
        beginCrop(selectedSlotId)
        return
      }
      if (event.key === 'Escape') {
        if (cropOrigin) {
          project.cancelCrop(cropOrigin.pageId, cropOrigin.slotId, cropOrigin.placement)
        }
        cropOrigin = null
        cropModeSlotId = null
        selectedAssetId = null
        return
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const frames = resolveLayout(activePage)
        const index = frames.findIndex((frame) => frame.slotId === selectedSlotId)
        const next =
          frames[
            index < 0
              ? 0
              : (index +
                  (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) +
                  frames.length) %
                frames.length
          ]
        selectedSlotId = next.slotId
        event.preventDefault()
      }
    }
    globalThis.addEventListener('keydown', keyboard)
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    globalThis.addEventListener('beforeunload', beforeUnload)
    return () => {
      if (autosaveTimer) clearTimeout(autosaveTimer)
      globalThis.removeEventListener('keydown', keyboard)
      globalThis.removeEventListener('beforeunload', beforeUnload)
      darkMedia.removeEventListener('change', syncDarkMode)
    }
  })

  let activeTab: SidebarTab = 'layouts'
  let isImageManagerOpen = false
  let toast = ''
  let projectTitle = document.title

  $: activePage = document.pages.find((page) => page.id === activePageId) ?? document.pages[0]
  $: syncLayoutAccordion(activePage.id, Object.keys(activePage.slots).length)
  $: selectedLayoutGroup = layoutGroups.find((group) => group.frameCount === expandedLayoutCount)
  $: selectedContent = selectedSlotId ? activePage.slots[selectedSlotId] : null
  $: if (selectedContent) cropZoom = selectedContent.placement.zoom
  $: assets = Object.values(document.assets)
  $: assetLibraryBytes = assets.reduce((total, asset) => total + asset.byteLength, 0)
  $: unusedAssetIds = assets.filter((asset) => assetUsage(asset.id) === 0).map((asset) => asset.id)
  $: filteredAssets = assets
    .filter(
      (asset) =>
        (assetFilter === 'all' || assetFilter === 'missing'
          ? assetFilter === 'all' || missingAssetIds.has(asset.id)
          : assetFilter === 'used'
            ? assetUsage(asset.id) > 0
            : assetUsage(asset.id) === 0) &&
        asset.originalName.toLocaleLowerCase().includes(assetQuery.trim().toLocaleLowerCase()),
    )
    .sort((left, right) =>
      assetSort === 'name'
        ? left.originalName.localeCompare(right.originalName)
        : assetSort === 'size'
          ? right.byteLength - left.byteLength
          : assetSort === 'usage'
            ? assetUsage(right.id) - assetUsage(left.id)
            : 0,
    )

  function announce(message: string) {
    toast = message
    globalThis.setTimeout(() => {
      if (toast === message) toast = ''
    }, 3200)
  }

  function selectLayout(presetId: string) {
    project.changeLayout(activePage.id, presetId)
    announce(`${layoutCatalog.find((preset) => preset.id === presetId)?.name} layout selected.`)
  }
  function selectLayoutGroup(frameCount: number) {
    expandedLayoutCount = frameCount
  }
  function syncLayoutAccordion(pageId: string, frameCount: number) {
    if (layoutAccordionPageId === pageId) return
    expandedLayoutCount = Math.min(frameCount, 11)
    layoutAccordionPageId = pageId
  }

  function renameProject() {
    project.renameProject(projectTitle)
    projectTitle = document.title
  }

  function requestImageForSlot(slotId: string) {
    selectedSlotId = slotId
    libraryTargetSlotId = slotId
    activeTab = 'images'
    announce('Choose an image from the library, or upload one to add it to the collection.')
  }
  function dropImages(event: DragEvent) {
    event.preventDefault()
    void importFiles(event.dataTransfer?.files ?? null)
  }

  function beginCrop(slotId: string) {
    if (cropModeSlotId && cropModeSlotId !== slotId) finishCrop()
    const content = activePage.slots[slotId]
    selectedSlotId = slotId
    if (!content) {
      cropModeSlotId = null
      cropOrigin = null
      return
    }
    if (cropModeSlotId !== slotId)
      cropOrigin = { pageId: activePage.id, slotId, placement: structuredClone(content.placement) }
    cropModeSlotId = slotId
  }

  function selectCanvasFrame(slotId: string) {
    if (selectedAssetId) {
      project.assignAsset(activePage.id, slotId, selectedAssetId)
      selectedSlotId = slotId
      cropModeSlotId = null
      cropOrigin = null
      return
    }
    if (cropModeSlotId && cropModeSlotId !== slotId) finishCrop()
    selectedSlotId = slotId
  }

  function finishCrop() {
    if (cropOrigin) project.commitCrop(cropOrigin.pageId, cropOrigin.slotId, cropOrigin.placement)
    cropModeSlotId = null
    cropOrigin = null
  }

  function updateCropZoom(zoom: number) {
    if (!selectedSlotId || !selectedContent) return
    const content = { ...selectedContent, placement: { ...selectedContent.placement, zoom } }
    if (cropModeSlotId === selectedSlotId)
      project.previewSlotContent(activePage.id, selectedSlotId, content)
    else project.setSlotContent(activePage.id, selectedSlotId, content)
  }

  function setViewportZoom(zoom: number) {
    isViewportFit = false
    viewportZoom = Math.min(2, Math.max(0.5, zoom))
  }

  function stepViewportZoom(delta: number) {
    setViewportZoom((isViewportFit ? fittedViewportZoom : viewportZoom) + delta)
  }

  function applyViewportWheelZoom(factor: number) {
    setViewportZoom((isViewportFit ? fittedViewportZoom : viewportZoom) * factor)
  }

  function clampSidebarWidth(width: number) {
    return Math.min(maxSidebarWidth, Math.max(minSidebarWidth, Math.round(width)))
  }
  function restoreSidebarWidths() {
    try {
      const stored = JSON.parse(globalThis.localStorage.getItem(sidebarWidthsStorageKey) ?? '{}') as {
        left?: unknown
        right?: unknown
      }
      if (
        typeof stored.left === 'number' &&
        Number.isFinite(stored.left) &&
        stored.left > defaultSidebarWidth
      )
        leftSidebarWidth = clampSidebarWidth(stored.left)
      if (
        typeof stored.right === 'number' &&
        Number.isFinite(stored.right) &&
        stored.right > defaultSidebarWidth
      )
        rightSidebarWidth = clampSidebarWidth(stored.right)
    } catch {
      // Local storage may be unavailable or contain stale data.
    }
  }
  function restoreRecentColors() {
    try {
      const stored = JSON.parse(globalThis.localStorage.getItem(recentColorsStorageKey) ?? '[]')
      if (!Array.isArray(stored)) return
      recentColors = [...new Set(
        stored
          .filter((color): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
          .map((color) => color.toUpperCase()),
      )].slice(0, 4)
    } catch {
      // Ignore stale or unavailable local storage.
    }
  }
  function persistSidebarWidths() {
    try {
      globalThis.localStorage.setItem(
        sidebarWidthsStorageKey,
        JSON.stringify({
          left: leftSidebarWidth > defaultSidebarWidth ? leftSidebarWidth : undefined,
          right: rightSidebarWidth > defaultSidebarWidth ? rightSidebarWidth : undefined,
        }),
      )
    } catch {
      // Resizing should still work when persistent storage is unavailable.
    }
  }

  function startSidebarResize(side: 'left' | 'right', event: PointerEvent) {
    if (event.button !== 0) return
    const target = event.currentTarget as HTMLElement
    sidebarResize = {
      side,
      startX: event.clientX,
      startWidth: side === 'left' ? leftSidebarWidth : rightSidebarWidth,
    }
    target.setPointerCapture(event.pointerId)
  }
  function resetSidebarWidth(side: 'left' | 'right') {
    if (side === 'left') leftSidebarWidth = defaultSidebarWidth
    else rightSidebarWidth = defaultSidebarWidth
    persistSidebarWidths()
  }

  function resizeSidebar(event: PointerEvent) {
    if (!sidebarResize) return
    const delta = event.clientX - sidebarResize.startX
    const width = Math.min(
      maxSidebarWidth,
      Math.max(
        minSidebarWidth,
        sidebarResize.startWidth + (sidebarResize.side === 'left' ? delta : -delta),
      ),
    )
    if (sidebarResize.side === 'left') leftSidebarWidth = width
    else rightSidebarWidth = width
  }

  function stopSidebarResize(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
    if (sidebarResize) persistSidebarWidths()
    sidebarResize = null
  }

  function resizeSidebarWithKeyboard(side: 'left' | 'right', event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const current = side === 'left' ? leftSidebarWidth : rightSidebarWidth
    const direction = side === 'left' ? 1 : -1
    const next =
      event.key === 'Home'
        ? minSidebarWidth
        : event.key === 'End'
          ? maxSidebarWidth
          : Math.min(
              maxSidebarWidth,
              Math.max(minSidebarWidth, current + (event.key === 'ArrowRight' ? 12 : -12) * direction),
            )
    if (side === 'left') leftSidebarWidth = next
    else rightSidebarWidth = next
    persistSidebarWidths()
    event.preventDefault()
  }

  function updateCropPosition(axis: 'positionX' | 'positionY', percent: number) {
    if (!selectedSlotId || !selectedContent) return
    const content = {
      ...selectedContent,
      placement: { ...selectedContent.placement, [axis]: Math.min(1, Math.max(0, percent / 100)) },
    }
    if (cropModeSlotId === selectedSlotId)
      project.previewSlotContent(activePage.id, selectedSlotId, content)
    else project.setSlotContent(activePage.id, selectedSlotId, content)
  }

  function commitCropPan(
    slotId: string,
    placement: NonNullable<typeof selectedContent>['placement'],
  ) {
    const content = activePage.slots[slotId]
    if (content) project.previewSlotContent(activePage.id, slotId, { ...content, placement })
  }

  function updateStyle(patch: Partial<PageV1['style']>) {
    project.setPageStyle(activePage.id, patch)
  }
  function shadowDistance() {
    return Math.round(Math.hypot(activePage.style.shadow.offsetX, activePage.style.shadow.offsetY))
  }
  function shadowAngle() {
    return Math.round(
      ((Math.atan2(activePage.style.shadow.offsetY, activePage.style.shadow.offsetX) * 180) /
        Math.PI -
        135 +
        360) %
        360,
    )
  }
  function updateShadowPolar(distance = shadowDistance(), angle = shadowAngle()) {
    const radians = ((angle + 135) * Math.PI) / 180
    updateStyle({
      shadow: {
        ...activePage.style.shadow,
        offsetX: Math.round(Math.cos(radians) * distance * 100) / 100,
        offsetY: Math.round(Math.sin(radians) * distance * 100) / 100,
      },
    })
  }
  function resizeActivePage(axis: 'width' | 'height', value: number) {
    if (!Number.isFinite(value)) return
    const aspectRatio = activePage.width / activePage.height
    const width =
      axis === 'width'
        ? value
        : pageAspectLinked
          ? Math.round(value * aspectRatio)
          : activePage.width
    const height =
      axis === 'height'
        ? value
        : pageAspectLinked
          ? Math.round(value / aspectRatio)
          : activePage.height
    try {
      project.resizePage(activePage.id, width, height)
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to resize page')
    }
  }

  function addPage() {
    project.addPage(activePage.id)
    activePageId = document.pages[document.pages.length - 1].id
  }
  function renameActivePage() {
    const name = globalThis.prompt('Page name', activePage.name)
    if (name !== null) project.renamePage(activePage.id, name)
  }
  function newProject() {
    const next = createProject('Untitled collage')
    assetRegistry.clear()
    missingAssetIds = new Set()
    currentSaveTarget = null
    currentSaveFormat = 'embedded'
    hasSavedProject = false
    linkedSaveMatches = new Map()
    recoveredOnly = false
    project.replaceDocument(next)
    projectTitle = next.title
    activePageId = next.pages[0].id
    selectedSlotId = null
    selectedAssetId = null
    cropModeSlotId = null
    announce('New blank project created.')
  }
  function requestNew() {
    if (isDirty || recoveredOnly) pendingNavigation = 'new'
    else newProject()
  }
  function requestOpen() {
    if (isDirty || recoveredOnly) pendingNavigation = 'open'
    else openInput.click()
  }
  function continueNavigation() {
    const action = pendingNavigation
    pendingNavigation = null
    if (action === 'new') newProject()
    else if (action === 'open') openInput.click()
  }
  async function saveThenContinue() {
    if (await saveProject()) continueNavigation()
  }
  function assetUsage(assetId: string) {
    return document.pages
      .flatMap((page) => Object.values(page.slots))
      .filter((content) => content?.assetId === assetId).length
  }
  function formatBytes(bytes: number) {
    const units = ['B', 'KB', 'MB', 'GB']
    let value = Math.max(0, bytes)
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex += 1
    }
    const decimals = unitIndex === 0 ? 0 : value < 10 ? 1 : 0
    return `${value.toFixed(decimals)} ${units[unitIndex]}`
  }
  function selectAsset(assetId: string, multi = false) {
    selectedAssetId = assetId
    selectedAssetIds = multi
      ? selectedAssetIds.includes(assetId)
        ? selectedAssetIds.filter((id) => id !== assetId)
        : [...selectedAssetIds, assetId]
      : [assetId]
    if (!multi && libraryTargetSlotId) {
      project.assignAsset(activePage.id, libraryTargetSlotId, assetId)
      selectedSlotId = libraryTargetSlotId
      libraryTargetSlotId = null
      announce('Image added to frame.')
    }
  }
  function addAssetToActivePage(assetId: string) {
    if (missingAssetIds.has(assetId)) {
      announce('Locate this image before adding it to a page.')
      return
    }
    const targetSlotId =
      (selectedSlotId && !activePage.slots[selectedSlotId] ? selectedSlotId : undefined) ??
      Object.entries(activePage.slots).find(([, content]) => !content)?.[0]
    if (!targetSlotId) {
      announce('This page has no empty frames. Drag the image onto a frame to replace it.')
      return
    }
    project.assignAsset(activePage.id, targetSlotId, assetId)
    selectedSlotId = targetSlotId
    selectedAssetId = assetId
    selectedAssetIds = [assetId]
    announce('Image added to page.')
  }
  function startAssetDrag(event: DragEvent, assetId: string) {
    event.dataTransfer?.setData('application/x-collage-asset', assetId)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  }
  function trackImageListOverflow(element: HTMLElement) {
    const update = () => {
      imageListOverflows = element.scrollHeight > element.clientHeight + 1
      element.style.setProperty(
        '--image-list-scrollbar-width',
        `${Math.max(0, element.offsetWidth - element.clientWidth)}px`,
      )
    }
    const resizeObserver = new ResizeObserver(update)
    const mutationObserver = new MutationObserver(update)
    resizeObserver.observe(element)
    mutationObserver.observe(element, { childList: true, subtree: true })
    requestAnimationFrame(update)
    return {
      destroy() {
        resizeObserver.disconnect()
        mutationObserver.disconnect()
      },
    }
  }
  function trackLayoutListOverflow(element: HTMLElement) {
    const update = () => {
      layoutListOverflows = element.scrollHeight > element.clientHeight + 1
      element.style.setProperty(
        '--layout-list-scrollbar-width',
        `${Math.max(0, element.offsetWidth - element.clientWidth)}px`,
      )
    }
    const resizeObserver = new ResizeObserver(update)
    const mutationObserver = new MutationObserver(update)
    resizeObserver.observe(element)
    mutationObserver.observe(element, { childList: true, subtree: true })
    requestAnimationFrame(update)
    return {
      destroy() {
        resizeObserver.disconnect()
        mutationObserver.disconnect()
      },
    }
  }
  function requestRemoveAssets(assetIds: string[]) {
    const removable = [...new Set(assetIds)].filter((assetId) => document.assets[assetId])
    if (!removable.length) return
    if (removable.some((assetId) => assetUsage(assetId) > 0)) {
      pendingRemovalAssetIds = removable
      return
    }
    removeAssets(removable)
  }
  function removeAssets(assetIds: string[]) {
    assetIds.forEach((assetId) => {
      assetRegistry.retain(assetId, document.assets[assetId].sha256)
      project.removeAsset(assetId)
      assetRegistry.release(assetId)
    })
    selectedAssetId = null
    selectedAssetIds = []
    pendingRemovalAssetIds = null
    announce(`${assetIds.length} image(s) removed from project.`)
  }
  function previousPage() {
    const index = document.pages.findIndex((page) => page.id === activePageId)
    if (index > 0) {
      activePageId = document.pages[index - 1].id
      selectedSlotId = null
    }
  }
  function nextPage() {
    const index = document.pages.findIndex((page) => page.id === activePageId)
    if (index < document.pages.length - 1) {
      activePageId = document.pages[index + 1].id
      selectedSlotId = null
    }
  }
  async function exportPages() {
    try {
      isExporting = true
      const indices = resolveExportRange(
        exportScope,
        document.pages.findIndex((page) => page.id === activePageId),
        document.pages.length,
        exportRange,
      )
      const rendered: Array<{ name: string; blob: Blob }> = []
      for (const [position, index] of indices.entries()) {
        exportProgress = `Rendering page ${position + 1} of ${indices.length}…`
        rendered.push({
          name: `${projectTitle || 'collage'}-${String(index + 1).padStart(2, '0')}.png`,
          blob: await renderPagePng(
            document.pages[index],
            document.assets,
            (assetId) => assetRegistry.getImage(assetId),
            exportWidth,
          ),
        })
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))
      }
      exportProgress = rendered.length > 1 ? 'Packaging ZIP…' : 'Preparing download…'
      const blob = rendered.length === 1 ? rendered[0].blob : await zipPngs(rendered)
      const link = globalThis.document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download =
        rendered.length === 1 ? rendered[0].name : `${projectTitle || 'collage'}-pages.zip`
      link.click()
      URL.revokeObjectURL(link.href)
      isExportOpen = false
      announce(`Exported ${rendered.length} page${rendered.length === 1 ? '' : 's'}.`)
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Export failed')
    } finally {
      isExporting = false
      exportProgress = ''
    }
  }
  function chooseExport(scope: typeof exportScope) {
    exportScope = scope
    isExportOpen = true
  }
  function formatFromProjectFilename(name: string): ProjectSaveFormat {
    const normalized = name.toLocaleLowerCase()
    if (normalized.endsWith('.collage.json')) return 'linked'
    if (normalized.endsWith('.collage')) return 'embedded'
    throw new Error('Choose either .collage or .collage.json')
  }
  function resolveSaveFormat(format: ProjectSaveFormat | null) {
    const resolve = saveFormatResolver
    saveFormatResolver = null
    isSaveFormatOpen = false
    resolve?.(format)
  }
  function chooseFallbackSaveFormat(): Promise<ProjectSaveFormat | null> {
    isSaveFormatOpen = true
    return new Promise((resolve) => (saveFormatResolver = resolve))
  }
  async function chooseSaveTarget(preferredFormat: ProjectSaveFormat): Promise<SaveTarget | null> {
    const pickerWindow = globalThis as unknown as SavePickerWindow
    if (!pickerWindow.showSaveFilePicker) {
      const format = await chooseFallbackSaveFormat()
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
  function finishLinkedFolderSelection(files: FileList | null) {
    const resolve = linkedFolderResolver
    linkedFolderResolver = null
    resolve?.(files?.length ? files : null)
  }
  function chooseLinkedFolderFiles(): Promise<FileList | null> {
    linkedFolderInput.value = ''
    return new Promise((resolve) => {
      linkedFolderResolver = resolve
      linkedFolderInput.click()
    })
  }
  function downloadBlob(blob: Blob, filename: string) {
    const link = globalThis.document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
    URL.revokeObjectURL(link.href)
  }
  async function writeProjectBlob(target: SaveTarget, blob: Blob, filename: string) {
    if (target.handle) {
      const writable = await target.handle.createWritable()
      await writable.write(blob)
      await writable.close()
    } else downloadBlob(blob, filename)
  }
  async function linkedMatchesForSave(forceChooseFolder: boolean) {
    const assetIds = Object.keys(document.assets)
    if (!assetIds.length) return new Map<string, { file: File; relativePath: string }>()
    const cachedMatchesAreComplete = assetIds.every((assetId) => linkedSaveMatches.has(assetId))
    if (!forceChooseFolder && cachedMatchesAreComplete) return linkedSaveMatches
    const files = await chooseLinkedFolderFiles()
    if (!files) return null
    const matches = await matchLinkedAssets(document.assets, files)
    linkedSaveMatches = matches
    return matches
  }
  async function saveProject(saveAs = false): Promise<boolean> {
    try {
      const choosingDestination = saveAs || !hasSavedProject
      const target = choosingDestination
        ? await chooseSaveTarget(currentSaveFormat)
        : currentSaveTarget ?? { format: currentSaveFormat }
      if (!target) return false
      const baseName = projectTitle || 'collage'
      if (target.format === 'embedded') {
        const archive = await createArchive(document, {
          get: (assetId) => assetRegistry.getBlob(assetId),
        })
        await writeProjectBlob(target, archive, `${baseName}.collage`)
      } else {
        const matches = await linkedMatchesForSave(choosingDestination)
        if (!matches) return false
        const linkedProject = createLinkedProject(document, matches)
        await writeProjectBlob(target, linkedProject, `${baseName}.collage.json`)
      }
      currentSaveTarget = target.handle ? target : null
      currentSaveFormat = target.format
      hasSavedProject = true
      project.markClean()
      recoveredOnly = false
      announce(
        target.format === 'embedded'
          ? 'Embedded project saved.'
          : 'Linked project saved. Images remain in the chosen folder.',
      )
      return true
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to save project')
      return false
    }
  }
  function saveAsModifierPressed(event: MouseEvent) {
    const platform = globalThis.navigator.platform
    const isApplePlatform = /Mac|iPhone|iPad|iPod/.test(platform)
    return isApplePlatform ? event.altKey : event.shiftKey
  }
  async function requestLinkedFolder() {
    const target = pendingLinkedDocument
    if (!target) return
    const files = await chooseLinkedFolderFiles()
    if (!files) return
    try {
      const matches = await matchLinkedAssets(target.assets, files)
      linkedSaveMatches = matches
      for (const [assetId, match] of matches)
        await assetRegistry.register(assetId, match.file, target.assets[assetId]?.sha256)
      missingAssetIds = new Set([...missingAssetIds].filter((assetId) => !matches.has(assetId)))
      pendingLinkedDocument = null
      announce(
        matches.size === Object.keys(target.assets).length
          ? 'Linked images loaded.'
          : `${matches.size} linked image(s) found; the rest still need relinking.`,
      )
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to use the selected asset folder')
    }
  }
  async function openProject(file: File | undefined) {
    if (!file) return
    try {
      const format = formatFromProjectFilename(file.name)
      const opened =
        format === 'embedded'
          ? await openArchive(file)
          : { document: await openLinkedProject(file), assets: new Map<string, Blob>(), missingAssetIds: [] }
      assetRegistry.clear()
      for (const [assetId, blob] of opened.assets)
        await assetRegistry.register(assetId, blob, opened.document.assets[assetId]?.sha256)
      const linkedIds = format === 'linked' ? Object.keys(opened.document.assets) : []
      currentSaveTarget = null
      currentSaveFormat = format
      hasSavedProject = false
      linkedSaveMatches = new Map()
      missingAssetIds = new Set([...opened.missingAssetIds, ...linkedIds])
      pendingLinkedDocument = linkedIds.length ? opened.document : null
      recoveredOnly = false
      project.replaceDocument(opened.document)
      activePageId = opened.document.pages[0].id
      selectedSlotId = null
      projectTitle = opened.document.title
      announce(
        opened.missingAssetIds.length || linkedIds.length
          ? `Project opened with ${opened.missingAssetIds.length + linkedIds.length} image(s) to locate.`
          : 'Project opened.',
      )
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to open project')
    } finally {
      openInput.value = ''
    }
  }
  async function replaceSelected(file: File | undefined) {
    if (!file || !selectedAssetId) return
    try {
      const { asset } = await validateImportedImage(file)
      const target = selectedAssetId
      assetRegistry.retain(target, document.assets[target].sha256)
      await assetRegistry.register(target, file, asset.sha256)
      project.replaceAsset(target, {
        ...asset,
        id: target,
        storage: {
          kind: 'embedded',
          archivePath:
            asset.storage.kind === 'embedded'
              ? asset.storage.archivePath.replace(asset.id, target)
              : asset.storage.displayHint,
        },
      })
      announce('Original image replaced everywhere it is used.')
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to replace image')
    } finally {
      replaceInput.value = ''
    }
  }
  async function relinkSelected(file: File | undefined) {
    if (!file || !selectedAssetId || !missingAssetIds.has(selectedAssetId)) return
    try {
      const { asset } = await validateImportedImage(file)
      const target = selectedAssetId
      const original = document.assets[target]
      if (
        original.sha256 !== asset.sha256 &&
        !globalThis.confirm(
          'This file differs from the missing original. Use it for this image anyway?',
        )
      )
        return
      await assetRegistry.register(target, file, asset.sha256)
      project.replaceAsset(target, {
        ...asset,
        id: target,
        storage: {
          kind: 'embedded',
          archivePath:
            asset.storage.kind === 'embedded'
              ? asset.storage.archivePath.replace(asset.id, target)
              : asset.storage.displayHint,
        },
      })
      missingAssetIds = new Set([...missingAssetIds].filter((id) => id !== target))
      announce('Image relinked everywhere it is used.')
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to relink image')
    } finally {
      relinkInput.value = ''
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return
    const existingBytes = Object.values(document.assets).reduce(
      (total, asset) => total + asset.byteLength,
      0,
    )
    if (
      existingBytes + [...files].reduce((total, file) => total + file.size, 0) >
      maxProjectBytes
    ) {
      announce('This import would exceed the 1 GB project asset limit.')
      return
    }
    let added = 0
    for (const file of files) {
      try {
        const { asset } = await validateImportedImage(file)
        await assetRegistry.register(asset.id, file, asset.sha256)
        try {
          project.addAsset(asset)
        } catch (error) {
          assetRegistry.release(asset.id)
          throw error
        }
        added += 1
      } catch (error) {
        announce(error instanceof Error ? error.message : 'Unable to import image')
      }
    }
    if (added) announce(`${added} image${added === 1 ? '' : 's'} added to this project.`)
    if (uploadInput) uploadInput.value = ''
  }
</script>

<svelte:head>
  <title>{projectTitle} — Collage Builder</title>
  <meta name="description" content="A local-first collage editor." />
</svelte:head>

<main class="app-shell" data-theme={prefersDark ? 'dark' : 'light'}>
  <input
    class="sr-only"
    bind:this={uploadInput}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    multiple
    onchange={(event) => importFiles(event.currentTarget.files)}
  />
  <input
    class="sr-only"
    bind:this={replaceInput}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    onchange={(event) => replaceSelected(event.currentTarget.files?.[0])}
  />
  <input
    class="sr-only"
    bind:this={relinkInput}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    onchange={(event) => relinkSelected(event.currentTarget.files?.[0])}
  />
  <input
    class="sr-only"
    bind:this={openInput}
    type="file"
    accept=".collage,.collage.json,application/vnd.collage-builder+zip,application/json"
    onchange={(event) => openProject(event.currentTarget.files?.[0])}
  />
  <input
    class="sr-only"
    bind:this={linkedFolderInput}
    type="file"
    multiple
    webkitdirectory
    onchange={(event) => finishLinkedFolderSelection(event.currentTarget.files)}
    oncancel={() => finishLinkedFolderSelection(null)}
  />
  <header class="topbar" aria-label="Project controls">
    <div class="toolbar-group">
      <Button class="button button-primary" onclick={requestNew}>New</Button>
      <Button class="button" variant="outline" onclick={requestOpen}>Open</Button>
      <Button
        class="button"
        variant="outline"
        title="Save (Ctrl/Cmd+S) · Save As (Ctrl/Cmd+Shift+S, Option-click on Apple devices, Shift-click elsewhere)"
        onclick={(event) => void saveProject(saveAsModifierPressed(event))}>Save</Button
      >
    </div>
    <div class="toolbar-group history-controls" aria-label="History">
      <Button
        class="icon-button"
        variant="ghost"
        size="icon"
        aria-label="Undo"
        title="Undo"
        disabled={!project.canUndo}
        onclick={() => project.undo()}><Undo2 size={15}></Undo2></Button
      >
      <Button
        class="icon-button"
        variant="ghost"
        size="icon"
        aria-label="Redo"
        title="Redo"
        disabled={!project.canRedo}
        onclick={() => project.redo()}><Redo2 size={15}></Redo2></Button
      >
    </div>
    <div class="toolbar-group editor-zoom" aria-label="Canvas zoom">
      <Button
        class="icon-button"
        variant="ghost"
        size="icon"
        aria-label="Zoom out"
        disabled={(isViewportFit ? fittedViewportZoom : viewportZoom) <= 0.5}
        onclick={() => stepViewportZoom(-0.1)}><Minus size={15}></Minus></Button
      ><DropdownMenu.Root
        ><DropdownMenu.Trigger
          class="zoom-menu-trigger"
          aria-label={`Canvas zoom: ${isViewportFit ? 'Fit' : `${Math.round(viewportZoom * 100)}%`}`}
          >{isViewportFit ? 'Fit' : `${Math.round(viewportZoom * 100)}%`} <ChevronDown
            size={13}
            aria-hidden="true"
          ></ChevronDown></DropdownMenu.Trigger
        ><DropdownMenu.Content class="zoom-menu-content" align="center"
          ><DropdownMenu.Item onclick={() => (isViewportFit = true)}>Fit</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => setViewportZoom(0.5)}>50%</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => setViewportZoom(0.75)}>75%</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => setViewportZoom(1)}>100%</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => setViewportZoom(1.25)}>125%</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => setViewportZoom(1.5)}>150%</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => setViewportZoom(2)}>200%</DropdownMenu.Item
        ></DropdownMenu.Content
      ></DropdownMenu.Root
      ><Button
        class="icon-button"
        variant="ghost"
        size="icon"
        aria-label="Zoom in"
        disabled={!isViewportFit && viewportZoom >= 2}
        onclick={() => stepViewportZoom(0.1)}><Plus size={15}></Plus></Button
      >
    </div>
    <label class="project-title">
      <span class="sr-only">Project title</span>
      <Input bind:value={projectTitle} aria-label="Project title" onblur={renameProject} />
    </label>
    <div class="toolbar-group topbar-end">
      <span class="save-status"
        ><span class:dirty={isDirty || recoveredOnly} class="status-dot"></span>{isDirty
          ? 'Unsaved changes'
          : recoveredOnly
            ? 'Recovered locally'
            : 'Saved'}</span
      >
      <DropdownMenu.Root>
        <div class="export-menu">
        <Button class="button button-primary" onclick={() => chooseExport('current')}
          >Export PNG</Button
        ><DropdownMenu.Trigger
          class="button button-primary export-caret"
          aria-label="Choose export scope"><ChevronDown size={14}></ChevronDown></DropdownMenu.Trigger
        ><DropdownMenu.Content class="export-menu-popover" align="end"
          ><DropdownMenu.Item onclick={() => chooseExport('current')}><FileImage size={14}></FileImage>
            Current page</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => chooseExport('all')}><Files size={14}></Files>
            All pages (ZIP)</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => chooseExport('range')}><Files size={14}></Files>
            Page range…</DropdownMenu.Item
        ></DropdownMenu.Content>
        </div>
      </DropdownMenu.Root>
    </div>
  </header>

  <section
    class="workspace"
    aria-label="Collage editor"
    style={`--left-sidebar-width:${leftSidebarWidth}px;--right-sidebar-width:${rightSidebarWidth}px`}
  >
    <aside class="sidebar left-panel" aria-label="Layouts and images">
      <div class="panel-tabs" role="tablist" aria-label="Editor panel">
        <button
          class:active={activeTab === 'layouts'}
          role="tab"
          aria-selected={activeTab === 'layouts'}
          onclick={() => (activeTab = 'layouts')}>Layouts</button
        >
        <button
          class:active={activeTab === 'images'}
          role="tab"
          aria-selected={activeTab === 'images'}
          onclick={() => (activeTab = 'images')}>Images</button
        >
      </div>

      {#if activeTab === 'layouts'}
        <div class="panel-body layout-panel">
          <p class="eyebrow">Choose a layout</p>
          <p class="panel-copy">Pick a preset grid for your page.</p>
          <div class="layout-count-tabs" role="tablist" aria-label="Photo count">
            {#each layoutGroups as group (group.frameCount)}<button
                class:active={expandedLayoutCount === group.frameCount}
                role="tab"
                aria-selected={expandedLayoutCount === group.frameCount}
                onclick={() => selectLayoutGroup(group.frameCount)}
                >{group.label}</button
              >{/each}
          </div>
          {#if selectedLayoutGroup}<div
              use:trackLayoutListOverflow
              class:layout-list-overflow={layoutListOverflows}
              class="layout-options"
            >
              {#each selectedLayoutGroup.layouts as layout (layout.id)}
                {@const frames = previewFrames(layout, 80, 80)}
                <button
                  class:selected={layout.id === activePage.layout.presetId}
                  class="layout-card"
                  title={layout.name}
                  aria-label={layout.name}
                  onclick={() => selectLayout(layout.id)}
                >
                  <span class="layout-preview" aria-hidden="true"
                    >{#each frames as frame (frame.slotId)}<i
                        style={previewFrameStyle(frame, 80, 80)}
                      ></i>{/each}</span
                  >
                </button>
              {/each}
            </div>{/if}
        </div>
      {:else}
        <div
          class="panel-body image-panel"
          role="region"
          aria-label="Image collection drop zone"
          ondragover={(event) => event.preventDefault()}
          ondrop={dropImages}
        >
          <p class="eyebrow">Project collection</p>
          {#if libraryTargetSlotId}<p class="library-target">
              Choose an image for the selected frame.
            </p>{/if}
          {#if assets.length}
            <ToggleGroup.Root
              class="asset-filters"
              type="single"
              value={assetFilter}
              onValueChange={(value) => {
                if (value) assetFilter = value as typeof assetFilter
              }}
              aria-label="Filter images"
              ><ToggleGroup.Item value="all">All</ToggleGroup.Item><ToggleGroup.Item value="used"
                >Used</ToggleGroup.Item
              ><ToggleGroup.Item value="unused">Unused</ToggleGroup.Item><ToggleGroup.Item
                value="missing">Missing ({missingAssetIds.size})</ToggleGroup.Item
              ></ToggleGroup.Root
            >
            <div class="asset-tools">
              <div class="asset-search-wrap">
                <Input
                  class="asset-search"
                  aria-label="Search images"
                  bind:value={assetQuery}
                  placeholder={`Search ${assets.length} image${assets.length === 1 ? '' : 's'}`}
                /><DropdownMenu.Root
                  ><DropdownMenu.Trigger
                    class="asset-sort-menu"
                    aria-label={`Sort images: ${
                      assetSort === 'import'
                        ? 'Import order'
                        : assetSort === 'name'
                          ? 'Filename'
                          : assetSort === 'size'
                            ? 'File size'
                            : 'Usage'
                    }`}
                    title="Sort images"
                    ><SlidersHorizontal size={15} strokeWidth={2}></SlidersHorizontal></DropdownMenu.Trigger
                  ><DropdownMenu.Content class="asset-menu asset-sort-menu-content" align="end"
                    ><DropdownMenu.Item onclick={() => (assetSort = 'import')}
                      >Import order</DropdownMenu.Item
                    ><DropdownMenu.Item onclick={() => (assetSort = 'name')}
                      >Filename</DropdownMenu.Item
                    ><DropdownMenu.Item onclick={() => (assetSort = 'size')}
                      >File size</DropdownMenu.Item
                    ><DropdownMenu.Item onclick={() => (assetSort = 'usage')}
                      >Usage</DropdownMenu.Item
                    ></DropdownMenu.Content
                  ></DropdownMenu.Root
                >
              </div>
            </div>
            <div
              use:trackImageListOverflow
              class:image-list-overflow={imageListOverflows}
              class="asset-list"
            >
              {#each filteredAssets as asset (asset.id)}<div class="sidebar-asset-card">
                  <button
                    draggable={!missingAssetIds.has(asset.id)}
                    class:selected-asset={selectedAssetIds.includes(asset.id)}
                    class="asset-row"
                    title={`${asset.originalName} · ${asset.width} × ${asset.height} · ${
                      missingAssetIds.has(asset.id)
                        ? 'Missing — relink required'
                        : `${formatBytes(asset.byteLength)} · ${assetUsage(asset.id)} use${assetUsage(asset.id) === 1 ? '' : 's'}`
                    }`}
                    ondragstart={(event) => startAssetDrag(event, asset.id)}
                    onclick={(event) => selectAsset(asset.id, event.ctrlKey || event.metaKey)}
                    >{#if assetRegistry.getObjectUrl(asset.id)}<img
                        class="asset-thumb"
                        src={assetRegistry.getObjectUrl(asset.id)}
                        alt=""
                      />{:else}<span class="asset-thumb"><ImageIcon size={20}></ImageIcon></span>{/if}<span
                      ><strong
                        class:asset-unused={assetUsage(asset.id) === 0}
                        class:asset-missing={missingAssetIds.has(asset.id)}
                        >{asset.originalName}</strong
                      ><small
                        >{missingAssetIds.has(asset.id)
                          ? 'Missing — relink required'
                          : `${asset.width} × ${asset.height} · ${assetUsage(asset.id)} use${assetUsage(asset.id) === 1 ? '' : 's'}`}</small
                      ></span
                    ></button
                  ><DropdownMenu.Root
                    ><DropdownMenu.Trigger
                      class="asset-overflow"
                      aria-label={`Actions for ${asset.originalName}`}><MoreHorizontal size={17}></MoreHorizontal></DropdownMenu.Trigger
                    ><DropdownMenu.Content class="asset-menu" align="end"
                      ><DropdownMenu.Item onclick={() => addAssetToActivePage(asset.id)}
                        ><Plus size={14}></Plus> Add to page</DropdownMenu.Item
                      >{#if missingAssetIds.has(asset.id)}<DropdownMenu.Item
                          onclick={() => {
                            selectedAssetId = asset.id
                            relinkInput.click()
                          }}><FolderOpen size={14}></FolderOpen> Locate image</DropdownMenu.Item
                        >{:else}<DropdownMenu.Item
                          onclick={() => {
                            selectedAssetId = asset.id
                            replaceInput.click()
                          }}><RefreshCw size={14}></RefreshCw> Replace original</DropdownMenu.Item
                        >{/if}<DropdownMenu.Item variant="destructive" onclick={() => requestRemoveAssets([asset.id])}
                        ><Trash2 size={14}></Trash2> Remove from project</DropdownMenu.Item
                      ></DropdownMenu.Content
                    ></DropdownMenu.Root
                  >
                </div>{/each}
            </div>
            {#if selectedAssetIds.length > 1}<button
                class="text-button danger"
                onclick={() => requestRemoveAssets(selectedAssetIds)}
              >Remove selected ({selectedAssetIds.length})</button
              >{/if}
          {:else}
            <div class="empty-library">
              <div class="image-icon" aria-hidden="true"><ImageIcon size={30}></ImageIcon></div>
              <p>Upload photos to use them across every page in this project.</p>
            </div>
          {/if}
          <div class="image-panel-actions">
            <button class="button button-primary" onclick={() => uploadInput.click()}
              >Upload images</button
            >
            <button class="button" onclick={() => (isImageManagerOpen = true)}>Manage images</button>
          </div>
        </div>
      {/if}
    </aside>
    <button
      class:active-resizer={sidebarResize?.side === 'left'}
      class="sidebar-resizer sidebar-resizer-left"
      type="button"
      role="slider"
      aria-label="Resize layouts and images sidebar"
      aria-orientation="vertical"
      aria-valuemin="210"
      aria-valuemax="360"
      aria-valuenow={leftSidebarWidth}
      tabindex="0"
      onpointerdown={(event) => startSidebarResize('left', event)}
      onpointermove={resizeSidebar}
      onpointerup={stopSidebarResize}
      onpointercancel={stopSidebarResize}
      ondblclick={() => resetSidebarWidth('left')}
      onkeydown={(event) => resizeSidebarWithKeyboard('left', event)}
    ></button>

    <section class="editor-column">
      <section class="canvas-area" aria-label="Canvas preview">
        <div class="pasteboard">
          <CanvasEditor
            page={activePage}
            assets={document.assets}
            {selectedSlotId}
            cropSlotId={cropModeSlotId}
            {viewportZoom}
            fitToViewport={isViewportFit}
            darkMode={prefersDark}
            onfitzoomchange={(zoom) => (fittedViewportZoom = zoom)}
            getImage={(assetId) => assetRegistry.getImage(assetId)}
            onselect={selectCanvasFrame}
            onrequestcrop={beginCrop}
            onexitcrop={() => {
              if (cropModeSlotId) finishCrop()
              selectedSlotId = null
            }}
            onrequestimage={requestImageForSlot}
            onplacementchange={commitCropPan}
            onassetdrop={(assetId, slotId) => {
              project.assignAsset(activePage.id, slotId, assetId)
              libraryTargetSlotId = null
            }}
            onframeswap={(sourceSlotId, targetSlotId) =>
              project.moveOrSwapSlots(activePage.id, sourceSlotId, targetSlotId)}
            onwheelzoom={(slotId, factor) => {
              const content = activePage.slots[slotId]
              if (content) updateCropZoom(Math.min(8, Math.max(1, content.placement.zoom * factor)))
            }}
            onviewportzoom={applyViewportWheelZoom}
            ondividerchange={(changes) => project.adjustDividers(activePage.id, changes)}
          />
        </div>
      </section>
      <footer class="pagebar" aria-label="Pages">
        {#if document.pages.length > 4}
          <button
            class="icon-button"
            aria-label="Previous page"
            disabled={document.pages.findIndex((page) => page.id === activePageId) === 0}
            onclick={previousPage}><ChevronLeft size={17}></ChevronLeft></button
          >
        {/if}
        {#if document.pages.length <= 4}
          {#each document.pages as page (page.id)}
            <div class:active-tab-action={page.id === activePageId} class="page-tab-with-actions">
              <div class="page-tab-preview" role="tooltip">
                <strong>{page.name}</strong>
                <div
                  class="page-tab-preview-canvas"
                  style={`aspect-ratio: ${page.width} / ${page.height}; background: ${page.style.transparentBackground ? 'transparent' : page.style.backgroundColor}`}
                >{#each resolveLayout(page) as frame (frame.slotId)}
                    {@const content = page.slots[frame.slotId]}
                    <i
                      class:populated={Boolean(content)}
                      style={`left:${(frame.x / page.width) * 100}%;top:${(frame.y / page.height) * 100}%;width:${(frame.width / page.width) * 100}%;height:${(frame.height / page.height) * 100}%;border-radius:${Math.min(page.style.cornerRadius / Math.max(page.width, page.height), 0.1) * 100}%`}
                    >{#if content && assetRegistry.getObjectUrl(content.assetId)}<img
                          src={assetRegistry.getObjectUrl(content.assetId)}
                          alt=""
                          style={`object-position:${content.placement.positionX * 100}% ${content.placement.positionY * 100}%;transform:scale(${content.placement.zoom});transform-origin:${content.placement.positionX * 100}% ${content.placement.positionY * 100}%`}
                        />{/if}</i
                    >{/each}
                </div>
              </div>
              <button
                class:active={page.id === activePageId}
                class="page-tab"
                aria-current={page.id === activePageId ? 'page' : undefined}
                onclick={() => {
                  activePageId = page.id
                  selectedSlotId = null
                }}>{page.name}</button
              >
              {#if page.id === activePageId}
                <PageActions
                  bind:open={isPageMenuOpen}
                  pageIndex={document.pages.findIndex((candidate) => candidate.id === activePageId)}
                  pageCount={document.pages.length}
                  onRename={renameActivePage}
                  onDuplicate={() => project.duplicatePage(activePageId)}
                  onMoveLeft={() => project.movePage(activePageId, -1)}
                  onMoveRight={() => project.movePage(activePageId, 1)}
                  onClear={() => project.clearPage(activePageId)}
                  onDelete={() => {
                    project.deletePage(activePageId)
                    activePageId = document.pages[0].id
                  }}
                />
              {/if}
            </div>
          {/each}
        {:else}
          <div class="page-picker-with-actions">
            <Select.Root
              type="single"
              value={activePageId}
              onValueChange={(value) => {
                if (value) {
                  activePageId = value
                  selectedSlotId = null
                }
              }}
              ><Select.Trigger class="page-picker" aria-label="Choose page"
                ><span>{activePage.name}</span></Select.Trigger
              ><Select.Content class="asset-sort-content"
                >{#each document.pages as page (page.id)}<Select.Item value={page.id}
                    >{page.name}</Select.Item
                  >{/each}</Select.Content
              ></Select.Root
            >
            <PageActions
              bind:open={isPageMenuOpen}
              pageIndex={document.pages.findIndex((page) => page.id === activePageId)}
              pageCount={document.pages.length}
              onRename={renameActivePage}
              onDuplicate={() => project.duplicatePage(activePageId)}
              onMoveLeft={() => project.movePage(activePageId, -1)}
              onMoveRight={() => project.movePage(activePageId, 1)}
              onClear={() => project.clearPage(activePageId)}
              onDelete={() => {
                project.deletePage(activePageId)
                activePageId = document.pages[0].id
              }}
            />
          </div>
        {/if}
        <button class="add-page" onclick={addPage} aria-label="Add page"><Plus size={16}></Plus></button>
        {#if document.pages.length > 4}
          <button
            class="icon-button"
            aria-label="Next page"
            disabled={document.pages.findIndex((page) => page.id === activePageId) ===
              document.pages.length - 1}
            onclick={nextPage}><ChevronRight size={17}></ChevronRight></button
          >
        {/if}
      </footer>
    </section>

    <button
      class:active-resizer={sidebarResize?.side === 'right'}
      class="sidebar-resizer sidebar-resizer-right"
      type="button"
      role="slider"
      aria-label="Resize properties sidebar"
      aria-orientation="vertical"
      aria-valuemin="210"
      aria-valuemax="360"
      aria-valuenow={rightSidebarWidth}
      tabindex="0"
      onpointerdown={(event) => startSidebarResize('right', event)}
      onpointermove={resizeSidebar}
      onpointerup={stopSidebarResize}
      onpointercancel={stopSidebarResize}
      ondblclick={() => resetSidebarWidth('right')}
      onkeydown={(event) => resizeSidebarWithKeyboard('right', event)}
    ></button>
    <aside class="sidebar right-panel" aria-label="Properties">
      <div class="panel-heading">
        <p class="eyebrow">
          Properties{selectedSlotId
            ? ` · Frame ${Object.keys(activePage.slots).indexOf(selectedSlotId) + 1}`
            : ''}
        </p>
      </div>
      <div class="property-groups">
        <Collapsible.Root class="property-group page-properties" open
          ><div class="property-group-heading">
            <Collapsible.Trigger>Page setup <ChevronDown size={14} aria-hidden="true"></ChevronDown></Collapsible.Trigger>
          </div>
          <Collapsible.Content
            ><div class="property-list">
              <div class="page-dimensions">
                <label>
                  <span>Width</span><input
                    aria-label="Page width"
                    type="number"
                    min="64"
                    value={activePage.width}
                    onchange={(event) => resizeActivePage('width', Number(event.currentTarget.value))}
                  />
                </label>
                <label>
                  <span>Height</span><input
                    aria-label="Page height"
                    type="number"
                    min="64"
                    value={activePage.height}
                    onchange={(event) =>
                      resizeActivePage('height', Number(event.currentTarget.value))}
                  />
                </label>
                <button
                  class:active={pageAspectLinked}
                  class="aspect-ratio-toggle"
                  type="button"
                  aria-label={pageAspectLinked ? 'Unlock page aspect ratio' : 'Lock page aspect ratio'}
                  aria-pressed={pageAspectLinked}
                  title={pageAspectLinked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                  onclick={() => (pageAspectLinked = !pageAspectLinked)}
                  >{#if pageAspectLinked}<Link2 size={15}></Link2>{:else}<Link2Off size={15}></Link2Off>{/if}</button
                >
              </div>
              <div>
                <span>Transparent background</span><Switch.Root
                  class="switch"
                  aria-label="Transparent background"
                  checked={activePage.style.transparentBackground}
                  onCheckedChange={(transparentBackground) => updateStyle({ transparentBackground })}
                />
              </div>
            </div></Collapsible.Content
          ></Collapsible.Root
        >
        <Collapsible.Root class="property-group appearance-properties" open
          ><div class="property-group-heading">
            <Collapsible.Trigger
              >Frame appearance <ChevronDown size={14} aria-hidden="true"></ChevronDown></Collapsible.Trigger
            >
          </div>
          <Collapsible.Content
            ><div class="property-list">
              <div>
                <span>Background</span><Popover.Root
                  ><Popover.Trigger
                    class="color-trigger"
                    aria-label="Choose background color"
                    disabled={activePage.style.transparentBackground}
                    ><i style={`background:${activePage.style.backgroundColor.slice(0, 7)}`}
                    ></i><span>{activePage.style.backgroundColor.slice(0, 7)}</span
                    ></Popover.Trigger
                  ><Popover.Content class="color-popover"
                    ><p class="color-popover-label">Presets</p>
                    <div class="color-presets" aria-label="Background color presets">
                      {#each colorPresets as color (color)}<button
                          class:active={activePage.style.backgroundColor.slice(0, 7) === color}
                          class="color-preset"
                          aria-label={`Set background to ${color}`}
                          title={color}
                          style={`background:${color}`}
                          onclick={() => setBackgroundColor(color)}
                        ></button>{/each}
                    </div>
                    <div class="color-picker-footer">
                      <div class="color-recents" aria-label="Recently used background colors">
                        {#each recentColors as color (color)}<button
                            class="color-preset"
                            aria-label={`Set background to recent ${color}`}
                            title={color}
                            style={`background:${color}`}
                            onclick={() => setBackgroundColor(color)}
                          ></button>{/each}
                      </div>
                      <label class="color-custom"
                        ><Palette size={15} aria-hidden="true" /><span>Custom</span><input
                        aria-label="Background color"
                        type="color"
                        value={activePage.style.backgroundColor.slice(0, 7)}
                        onchange={(event) => setBackgroundColor(event.currentTarget.value, true)}
                      /></label
                    ></div></Popover.Content
                  ></Popover.Root
                >
              </div>
              <div>
                <span>Outer margin</span>
                <div class="inspector-slider">
                  <Slider.Root
                    class="inspector-slider-root"
                    aria-label="Outer margin"
                    type="single"
                    min={0}
                    max={120}
                    step={1}
                    value={activePage.style.padding}
                    onValueChange={(padding) => updateStyle({ padding })}
                  /><input
                    class="slider-value"
                    aria-label="Outer margin value"
                    type="number"
                    min="0"
                    max="120"
                    value={activePage.style.padding}
                    onchange={(event) =>
                      updateStyle({
                        padding: Math.min(120, Math.max(0, Number(event.currentTarget.value))),
                      })}
                  />
                </div>
              </div>
              <div>
                <span>Inner spacing</span>
                <div class="inspector-slider">
                  <Slider.Root
                    class="inspector-slider-root"
                    aria-label="Inner spacing"
                    type="single"
                    min={0}
                    max={120}
                    step={1}
                    value={activePage.style.gap}
                    onValueChange={(gap) => updateStyle({ gap })}
                  /><input
                    class="slider-value"
                    aria-label="Inner spacing value"
                    type="number"
                    min="0"
                    max="120"
                    value={activePage.style.gap}
                    onchange={(event) =>
                      updateStyle({
                        gap: Math.min(120, Math.max(0, Number(event.currentTarget.value))),
                      })}
                  />
                </div>
              </div>
              <div>
                <span>Corner radius</span>
                <div class="inspector-slider">
                  <Slider.Root
                    class="inspector-slider-root"
                    aria-label="Corner radius"
                    type="single"
                    min={0}
                    max={120}
                    step={1}
                    value={activePage.style.cornerRadius}
                    onValueChange={(cornerRadius) => updateStyle({ cornerRadius })}
                  /><input
                    class="slider-value"
                    aria-label="Corner radius value"
                    type="number"
                    min="0"
                    max="120"
                    value={activePage.style.cornerRadius}
                    onchange={(event) =>
                      updateStyle({
                        cornerRadius: Math.min(120, Math.max(0, Number(event.currentTarget.value))),
                      })}
                  />
                </div>
              </div>
              <div>
                <span>Frame shadow</span><Switch.Root
                  class="switch"
                  aria-label="Frame shadow enabled"
                  checked={activePage.style.shadow.enabled}
                  onCheckedChange={(enabled) =>
                    updateStyle({ shadow: { ...activePage.style.shadow, enabled } })}
                />
              </div>
            </div></Collapsible.Content
          ></Collapsible.Root
        >
        {#if activePage.style.shadow.enabled}<Collapsible.Root class="property-group shadow-properties" open
          ><div class="property-group-heading">
            <Collapsible.Trigger>Shadow Appearance <ChevronDown size={14} aria-hidden="true"></ChevronDown></Collapsible.Trigger>
          </div>
          <Collapsible.Content
            ><div class="property-list">
              <div>
                  <span>Shadow color</span><Popover.Root
                    ><Popover.Trigger class="color-trigger" aria-label="Choose frame shadow color"
                      ><i style={`background:${activePage.style.shadow.color}`}></i><span
                        >{activePage.style.shadow.color}</span
                      ></Popover.Trigger
                    ><Popover.Content class="color-popover"
                      ><p class="color-popover-label">Presets</p>
                      <div class="color-presets" aria-label="Shadow color presets">
                        {#each colorPresets as color (color)}<button
                            class:active={activePage.style.shadow.color === color}
                            class="color-preset"
                            aria-label={`Set shadow to ${color}`}
                            title={color}
                            style={`background:${color}`}
                            onclick={() => setShadowColor(color)}
                          ></button>{/each}
                      </div>
                      <div class="color-picker-footer">
                        <div class="color-recents" aria-label="Recently used shadow colors">
                          {#each recentColors as color (color)}<button
                              class="color-preset"
                              aria-label={`Set shadow to recent ${color}`}
                              title={color}
                              style={`background:${color}`}
                              onclick={() => setShadowColor(color)}
                            ></button>{/each}
                        </div>
                        <label class="color-custom"
                          ><Palette size={15} aria-hidden="true" /><span>Custom</span><input
                          aria-label="Frame shadow color"
                          type="color"
                          value={activePage.style.shadow.color}
                          onchange={(event) => setShadowColor(event.currentTarget.value, true)}
                        /></label
                      ></div></Popover.Content
                    ></Popover.Root
                  >
                </div>
                <div class="slider-row-wide-label">
                  <span>Transparency</span>
                  <div class="inspector-slider">
                    <Slider.Root
                      class="inspector-slider-root"
                      aria-label="Frame shadow transparency"
                      type="single"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(activePage.style.shadow.opacity * 100)}
                      onValueChange={(value) =>
                        updateStyle({
                          shadow: { ...activePage.style.shadow, opacity: value / 100 },
                        })}
                    /><input
                      class="slider-value"
                      aria-label="Frame shadow transparency value"
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(activePage.style.shadow.opacity * 100)}
                      onchange={(event) =>
                        updateStyle({
                          shadow: {
                            ...activePage.style.shadow,
                            opacity:
                              Math.min(100, Math.max(0, Number(event.currentTarget.value))) / 100,
                          },
                        })}
                    />
                  </div>
                </div>
                <div>
                  <span>Shadow blur</span>
                  <div class="inspector-slider">
                    <Slider.Root
                      class="inspector-slider-root"
                      aria-label="Frame shadow blur"
                      type="single"
                      min={0}
                      max={50}
                      step={1}
                      value={activePage.style.shadow.blur}
                      onValueChange={(blur) =>
                        updateStyle({ shadow: { ...activePage.style.shadow, blur } })}
                    /><input
                      class="slider-value"
                      aria-label="Frame shadow blur value"
                      type="number"
                      min="0"
                      max="50"
                      value={activePage.style.shadow.blur}
                      onchange={(event) =>
                        updateStyle({
                          shadow: {
                            ...activePage.style.shadow,
                            blur: Math.min(50, Math.max(0, Number(event.currentTarget.value))),
                          },
                        })}
                    />
                  </div>
                </div>
                <div>
                  <span>Shadow distance</span>
                  <div class="inspector-slider">
                    <Slider.Root
                      class="inspector-slider-root"
                      aria-label="Frame shadow distance"
                      type="single"
                      min={0}
                      max={50}
                      step={1}
                      value={shadowDistance()}
                      onValueChange={(distance) => updateShadowPolar(distance)}
                    /><input
                      class="slider-value"
                      aria-label="Frame shadow distance value"
                      type="number"
                      min="0"
                      max="50"
                      value={shadowDistance()}
                      onchange={(event) =>
                        updateShadowPolar(
                          Math.min(50, Math.max(0, Number(event.currentTarget.value))),
                        )}
                    />
                  </div>
                </div>
                <div>
                  <span>Shadow angle</span>
                  <div class="inspector-slider">
                    <Slider.Root
                      class="inspector-slider-root"
                      aria-label="Frame shadow angle"
                      type="single"
                      min={0}
                      max={360}
                      step={1}
                      value={shadowAngle()}
                      onValueChange={(angle) => updateShadowPolar(undefined, angle)}
                    /><input
                      class="slider-value"
                      aria-label="Frame shadow angle value"
                      type="number"
                      min="0"
                      max="360"
                      value={shadowAngle()}
                      onchange={(event) =>
                        updateShadowPolar(
                          undefined,
                          Math.min(360, Math.max(0, Number(event.currentTarget.value))),
                        )}
                    />
                  </div>
              </div>
            </div></Collapsible.Content
          ></Collapsible.Root
        >{/if}
        <div class="property-note">
          <span aria-hidden="true"><Sparkles size={14}></Sparkles></span>
          <p>
            {selectedContent
              ? 'Click the image to focus it, then drag or use the precise crop controls.'
              : 'Select a frame on the canvas to inspect it.'}
          </p>
        </div>
        {#if selectedSlotId && !selectedContent}
          <Collapsible.Root class="property-group selected-properties" open
            ><div class="property-group-heading">
              <Collapsible.Trigger
                >Selected frame <ChevronDown size={14} aria-hidden="true"></ChevronDown></Collapsible.Trigger
              >
            </div>
            <Collapsible.Content
              ><div class="frame-action">
                <button
                  class="button button-primary"
                  onclick={() => requestImageForSlot(selectedSlotId!)}>Add image</button
                >
              </div></Collapsible.Content
            ></Collapsible.Root
          >
        {:else if selectedSlotId && selectedContent}
          <Collapsible.Root class="property-group selected-properties" open
            ><div class="property-group-heading">
              <Collapsible.Trigger
                >Image & crop <ChevronDown size={14} aria-hidden="true"></ChevronDown></Collapsible.Trigger
              >
            </div>
            <Collapsible.Content
              ><div class="crop-controls">
                {#if cropModeSlotId === selectedSlotId}<p class="crop-hint">
                    Crop mode is active. Drag the image, use the corner dots to zoom, or adjust
                    values precisely. Escape cancels.
                  </p>{:else}<button class="button" onclick={() => beginCrop(selectedSlotId!)}
                    >Crop image</button
                  >
                  <p class="crop-hint">
                    Double-click the image, press Enter, or use Crop image to begin.
                  </p>{/if}
                <div class="crop-zoom">
                  <span>Zoom</span>
                  <div class="inspector-slider">
                    <Slider.Root
                      class="inspector-slider-root"
                      aria-label="Crop zoom"
                      type="single"
                      min={1}
                      max={8}
                      step={0.05}
                      value={cropZoom}
                      onValueChange={updateCropZoom}
                    /><input
                      class="slider-value"
                      aria-label="Crop zoom value"
                      type="number"
                      min="1"
                      max="8"
                      step="0.05"
                      value={cropZoom.toFixed(2)}
                      onchange={(event) =>
                        updateCropZoom(Math.min(8, Math.max(1, Number(event.currentTarget.value))))}
                    />
                  </div>
                </div>
                <div class="crop-coordinates">
                  <label
                    >X <input
                      aria-label="Crop horizontal position"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(selectedContent.placement.positionX * 100)}
                      onchange={(event) =>
                        updateCropPosition('positionX', Number(event.currentTarget.value))}
                    />%</label
                  ><label
                    >Y <input
                      aria-label="Crop vertical position"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(selectedContent.placement.positionY * 100)}
                      onchange={(event) =>
                        updateCropPosition('positionY', Number(event.currentTarget.value))}
                    />%</label
                  >
                </div>
                <div class="crop-actions">
                  <button
                    class="text-button"
                    onclick={() =>
                      project.setSlotContent(activePage.id, selectedSlotId!, {
                        ...selectedContent,
                        placement: { zoom: 1, positionX: 0.5, positionY: 0.5 },
                      })}>Reset crop</button
                  >{#if cropModeSlotId === selectedSlotId}<button
                      class="button button-primary"
                      onclick={finishCrop}>Done</button
                    >{/if}
                </div>
                <div class="image-actions">
                  <button
                    class="button image-action-button"
                    onclick={() => {
                      selectedAssetId = selectedContent!.assetId
                      replaceInput.click()
                    }}>Replace</button
                  ><button
                    class="button image-action-button"
                    onclick={() => project.clearSlot(activePage.id, selectedSlotId!)}>Remove</button
                  >
                </div>
              </div></Collapsible.Content
            ></Collapsible.Root
          >
        {/if}
      </div>
    </aside>
  </section>

  <Dialog.Root bind:open={isImageManagerOpen}>
      <Dialog.Content
        class="dialog image-manager-dialog"
        aria-modal="true"
        aria-labelledby="image-manager-title"
      >
        <div class="dialog-header">
          <div>
            <p class="eyebrow">Project collection</p>
            <h2 id="image-manager-title">Image Manager</h2>
          </div>
          <button
            class="icon-button"
            aria-label="Close image manager"
            onclick={() => (isImageManagerOpen = false)}><X size={17}></X></button
          >
        </div>
        {#if !assets.length}
          <div
            class="upload-well"
            role="region"
            aria-label="Upload images drop zone"
            ondragover={(event) => event.preventDefault()}
            ondrop={dropImages}
          >
            <div class="upload-mark" aria-hidden="true"><Upload size={19}></Upload></div>
            <strong>Drop PNG, JPEG, or WebP files here</strong><span
              >Original files remain local and are embedded in saved projects.</span
            ><button class="button button-primary" onclick={() => uploadInput.click()}
              >Choose images</button
            >
          </div>
        {:else}
          <div
            class="manager-add-images"
            role="region"
            aria-label="Add images drop zone"
            ondragover={(event) => event.preventDefault()}
            ondrop={dropImages}
          >
            <span>Drop more images here, or</span><button class="text-button" onclick={() => uploadInput.click()}
              ><Upload size={14}></Upload> Add images</button
            >
          </div>
        {/if}
        {#if assets.length}<div class="manager-content">
            <div class="manager-toolbar">
              <div class="asset-tools">
                <Input
                  class="asset-search"
                  aria-label="Search project images"
                  bind:value={assetQuery}
                  placeholder="Search images"
                /><Select.Root
                  type="single"
                  value={assetSort}
                  onValueChange={(value) => {
                    if (value) assetSort = value as typeof assetSort
                  }}
                  ><Select.Trigger class="asset-sort" aria-label="Sort project images"
                    ><span
                      >{assetSort === 'import'
                        ? 'Import order'
                        : assetSort === 'name'
                          ? 'Filename'
                          : assetSort === 'size'
                            ? 'File size'
                            : 'Usage'}</span
                    ></Select.Trigger
                  ><Select.Content class="asset-sort-content"
                    ><Select.Item value="import">Import order</Select.Item><Select.Item value="name"
                      >Filename</Select.Item
                    ><Select.Item value="size">File size</Select.Item><Select.Item value="usage"
                      >Usage</Select.Item
                    ></Select.Content
                  ></Select.Root
                >
              </div>
              <div class="manager-view">
                <ToggleGroup.Root
                  type="single"
                  value={imageManagerView}
                  onValueChange={(value) => {
                    if (value) imageManagerView = value as typeof imageManagerView
                  }}
                  aria-label="Image manager view"
                  ><ToggleGroup.Item value="grid" aria-label="Grid view"><Grid2X2 size={15}></Grid2X2></ToggleGroup.Item
                  ><ToggleGroup.Item value="list" aria-label="List view"><List size={15}></List></ToggleGroup.Item
                  ></ToggleGroup.Root
                >
              </div>
              <div class="manager-filter-row">
                <ToggleGroup.Root
                  class="asset-filters"
                  type="single"
                  value={assetFilter}
                  onValueChange={(value) => {
                    if (value) assetFilter = value as typeof assetFilter
                  }}
                  aria-label="Filter project images"
                  ><ToggleGroup.Item value="all">All</ToggleGroup.Item><ToggleGroup.Item value="used"
                    >Used</ToggleGroup.Item
                  ><ToggleGroup.Item value="unused">Unused</ToggleGroup.Item><ToggleGroup.Item
                    value="missing">Missing ({missingAssetIds.size})</ToggleGroup.Item
                  ></ToggleGroup.Root
                >
                <span class="manager-summary">{assets.length} images · {formatBytes(assetLibraryBytes)} embedded</span>
              </div>
            </div>
            <div
              class="asset-list manager-asset-list"
              class:manager-list-view={imageManagerView === 'list'}
            >
              {#each filteredAssets as asset (asset.id)}<div
                  class:selected-asset={selectedAssetIds.includes(asset.id)}
                  class="manager-asset-card"
                >
                  <button
                    draggable={!missingAssetIds.has(asset.id)}
                    class="asset-row"
                    ondragstart={(event) => startAssetDrag(event, asset.id)}
                    onclick={(event) => selectAsset(asset.id, event.ctrlKey || event.metaKey)}
                    >{#if assetRegistry.getObjectUrl(asset.id)}<img
                        class="asset-thumb"
                        src={assetRegistry.getObjectUrl(asset.id)}
                        alt=""
                      />{:else}<span class="asset-thumb"><ImageIcon size={20}></ImageIcon></span>{/if}<span
                      ><strong class:asset-missing={missingAssetIds.has(asset.id)}>{asset.originalName}</strong><small
                        class:asset-missing={missingAssetIds.has(asset.id)}
                        >{missingAssetIds.has(asset.id)
                          ? 'Missing — relink required'
                          : `${asset.width} × ${asset.height} · ${formatBytes(asset.byteLength)} · ${assetUsage(asset.id)} use${assetUsage(asset.id) === 1 ? '' : 's'}`}</small
                      ></span
                    ></button
                  ><DropdownMenu.Root
                    ><DropdownMenu.Trigger
                      class="asset-overflow"
                      aria-label={`Actions for ${asset.originalName}`}><MoreHorizontal size={17}></MoreHorizontal></DropdownMenu.Trigger
                    ><DropdownMenu.Content class="asset-menu"
                      >{#if missingAssetIds.has(asset.id)}<DropdownMenu.Item
                          onclick={() => {
                            selectedAssetId = asset.id
                            relinkInput.click()
                          }}><FolderOpen size={14}></FolderOpen> Locate image</DropdownMenu.Item
                        >{:else}<DropdownMenu.Item
                          onclick={() => {
                            selectedAssetId = asset.id
                            replaceInput.click()
                          }}><RefreshCw size={14}></RefreshCw> Replace original</DropdownMenu.Item
                        >{/if}<DropdownMenu.Item variant="destructive" onclick={() => requestRemoveAssets([asset.id])}
                        ><Trash2 size={14}></Trash2> Remove from project</DropdownMenu.Item
                      ></DropdownMenu.Content
                    ></DropdownMenu.Root
                  >
                </div>{/each}
            </div>
            {#if !filteredAssets.length}<p class="empty-filter">No images match this view.</p>{/if}
            <div class="manager-bulk-actions">
              {#if selectedAssetIds.length > 1}<button
                  class="button"
                  onclick={() => requestRemoveAssets(selectedAssetIds)}
                  >Remove selected ({selectedAssetIds.length})</button
                >{/if}
            </div>
          </div>{/if}
        <div class="dialog-footer image-manager-footer">
          <button
            class="text-button danger"
            disabled={unusedAssetIds.length === 0}
            onclick={() => requestRemoveAssets(unusedAssetIds)}>Remove unused images</button
          ><button class="button" onclick={() => (isImageManagerOpen = false)}>Done</button>
        </div>
      </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root open={Boolean(pendingRemovalAssetIds?.length)} onOpenChange={(open) => !open && (pendingRemovalAssetIds = null)}>
    {#if pendingRemovalAssetIds}
      <Dialog.Content class="dialog" aria-modal="true" aria-labelledby="remove-images-title">
        <div class="dialog-header">
          <div>
            <p class="eyebrow">Project collection</p>
            <h2 id="remove-images-title">
              Remove {pendingRemovalAssetIds.length} image{pendingRemovalAssetIds.length === 1
                ? ''
                : 's'}?
            </h2>
          </div>
          <button
            class="icon-button"
            aria-label="Cancel removal"
            onclick={() => (pendingRemovalAssetIds = null)}><X size={17}></X></button
          >
        </div>
        <div class="export-form">
          <p>
            This clears <strong
              >{pendingRemovalAssetIds.reduce(
                (total, assetId) => total + assetUsage(assetId),
                0,
              )}</strong
            >
            frame placement{pendingRemovalAssetIds.reduce(
              (total, assetId) => total + assetUsage(assetId),
              0,
            ) === 1
              ? ''
              : 's'} and frees
            <strong
              >{formatBytes(
                pendingRemovalAssetIds.reduce(
                  (total, assetId) => total + (document.assets[assetId]?.byteLength ?? 0),
                  0,
                ),
              )}</strong
            > from the next saved project.
          </p>
          <p>You can undo this while the project remains open.</p>
        </div>
        <div class="dialog-footer">
          <button class="button" onclick={() => (pendingRemovalAssetIds = null)}>Cancel</button
          ><button class="button danger" onclick={() => removeAssets(pendingRemovalAssetIds!)}
            >Remove images</button
          >
        </div>
      </Dialog.Content>
    {/if}
  </Dialog.Root>

  <Dialog.Root
    open={isSaveFormatOpen}
    onOpenChange={(open) => {
      if (!open) resolveSaveFormat(null)
    }}
  >
    <Dialog.Content class="dialog" aria-modal="true" aria-labelledby="save-format-title">
      <div class="dialog-header">
        <div>
          <p class="eyebrow">Save project</p>
          <h2 id="save-format-title">Choose a project format</h2>
        </div>
        <button class="icon-button" aria-label="Cancel save" onclick={() => resolveSaveFormat(null)}
          ><X size={17}></X></button
        >
      </div>
      <div class="export-form">
        <p><strong>Embedded archive (.collage)</strong> includes every original image and is fully portable.</p>
        <p><strong>Linked project (.collage.json)</strong> stores relative paths and keeps image bytes in a chosen folder.</p>
      </div>
      <div class="dialog-footer">
        <button class="button" onclick={() => resolveSaveFormat(null)}>Cancel</button><span
          ><button class="button" onclick={() => resolveSaveFormat('linked')}>Save linked JSON</button><button
            class="button button-primary"
            onclick={() => resolveSaveFormat('embedded')}>Save embedded archive</button
          ></span
        >
      </div>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root open={Boolean(pendingNavigation)} onOpenChange={(open) => !open && (pendingNavigation = null)}>
      <Dialog.Content class="dialog" aria-modal="true" aria-labelledby="unsaved-title">
        <div class="dialog-header">
          <div>
            <p class="eyebrow">Unsaved changes</p>
            <h2 id="unsaved-title">Save before continuing?</h2>
          </div>
          <button class="icon-button" aria-label="Cancel" onclick={() => (pendingNavigation = null)}
            ><X size={17}></X></button
          >
        </div>
        <div class="export-form">
          <p>Your current project has changes that have not been saved.</p>
        </div>
        <div class="dialog-footer">
          <button class="button" onclick={() => (pendingNavigation = null)}>Cancel</button><span
            ><button class="button danger" onclick={continueNavigation}>Discard</button><button
              class="button button-primary"
              onclick={saveThenContinue}>Save</button
            ></span
          >
        </div>
      </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root open={Boolean(pendingLinkedDocument)} onOpenChange={(open) => !open && (pendingLinkedDocument = null)}>
      <Dialog.Content class="dialog" aria-modal="true" aria-labelledby="linked-assets-title">
        <div class="dialog-header">
          <div>
            <p class="eyebrow">External originals</p>
            <h2 id="linked-assets-title">Locate linked images</h2>
          </div>
        </div>
        <div class="export-form">
          <p>
            This .collage.json project keeps its originals outside the project file. Choose the root image
            folder; saved relative paths and image hashes will be used to find them safely.
          </p>
        </div>
        <div class="dialog-footer">
          <button class="button" onclick={() => (pendingLinkedDocument = null)}>Not now</button>
          <button class="button button-primary" onclick={requestLinkedFolder}>Choose folder…</button>
        </div>
      </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={isExportOpen}>
      <Dialog.Content class="dialog" aria-labelledby="export-title">
        <div class="dialog-header">
          <div>
            <p class="eyebrow">PNG export</p>
            <h2 id="export-title">Export pages</h2>
          </div>
          <button
            class="icon-button"
            aria-label="Close export dialog"
            disabled={isExporting}
            onclick={() => (isExportOpen = false)}><X size={17}></X></button
          >
        </div>
        <div class="export-form">
          <label
            >Scope <Select.Root
              type="single"
              value={exportScope}
              disabled={isExporting}
              onValueChange={(value) => {
                if (value) exportScope = value as typeof exportScope
              }}
              ><Select.Trigger class="export-scope" aria-label="Export scope"
                ><span>{exportScope === 'current' ? 'Current page' : exportScope === 'all' ? 'All pages' : 'Page range'}</span></Select.Trigger
              ><Select.Content
                ><Select.Item value="current">Current page</Select.Item
                ><Select.Item value="all">All pages</Select.Item
                ><Select.Item value="range">Page range</Select.Item
              ></Select.Content
            ></Select.Root></label
          >{#if exportScope === 'range'}<label
              >Range <input
                bind:value={exportRange}
                placeholder="1-3"
                disabled={isExporting}
              /></label
            >{/if}<label
            >Width (px) <input
              type="number"
              min="1"
              max="8192"
              bind:value={exportWidth}
              disabled={isExporting}
            /></label
          >
          <p>Height: {Math.round((exportWidth * activePage.height) / activePage.width)} px</p>
          {#if exportProgress}<p aria-live="polite">{exportProgress}</p>{/if}
        </div>
        <div class="dialog-footer">
          <span
            >{exportScope === 'all'
              ? `${document.pages.length} PNGs in a ZIP`
              : 'PNG download'}</span
          ><button class="button button-primary" disabled={isExporting} onclick={exportPages}
            >{isExporting ? 'Exporting…' : 'Export'}</button
          >
        </div>
      </Dialog.Content>
  </Dialog.Root>

  {#if toast}
    <div class="toast" role="status">{toast}</div>
  {/if}
</main>
