<script lang="ts">
  import { createProject } from './lib/domain/factories'
  import type { LayoutPresetDefinition, PageV1, SlotContentV1 } from './lib/domain/types'
  import EditorShell from './lib/components/app/EditorShell.svelte'
  import OpeningProjectView from './lib/components/app/OpeningProjectView.svelte'
  import ProjectOperationDialog from './lib/components/app/ProjectOperationDialog.svelte'
  import ImageManagerDialog from './lib/components/app/ImageManagerDialog.svelte'
  import RecoveryManagerDialog from './lib/components/app/RecoveryManagerDialog.svelte'
  import StartupDialogs from './lib/components/app/StartupDialogs.svelte'
  import ProjectDialogs from './lib/components/app/ProjectDialogs.svelte'
  import LeftSidebar from './lib/components/app/LeftSidebar.svelte'
  import ResponsiveSidebar from './lib/components/app/ResponsiveSidebar.svelte'
  import ProjectFileInputs from './lib/components/app/ProjectFileInputs.svelte'
  import TopToolbar from './lib/components/app/TopToolbar.svelte'
  import PropertiesPanel from './lib/components/app/PropertiesPanel.svelte'
  import SidebarResizer from './lib/components/app/SidebarResizer.svelte'
  import { ProjectStore } from './lib/state/projectStore'
  import { AssetRegistry } from './lib/render/assetRegistry'
  import { releaseOpenPreviewAssets, setOpenPreviewAssets } from './lib/persistence/previewCache'
  import { onMount, tick } from 'svelte'
  import { RecoveryController, type RecoveryState, type StartupRecovery } from './lib/app/recovery'
  import { ExportWorkflowController } from './lib/app/exportProject'
  import type { ExportFormat } from './lib/render/exportPng'
  import {
    AssetWorkflowController,
    filterAssets,
    formatBytes,
    assetUsageCounts as countAssetUsage,
    type AssetFilter,
    type AssetSort,
    type ImportBatchStatus,
  } from './lib/app/assetManagement'
  import type { ProjectSaveFormat } from './lib/app/projectIO'
  import { ProjectPersistenceController } from './lib/app/projectPersistence'
  import {
    preparePageImages as loadPageImages,
    replaceProjectDocument,
  } from './lib/app/imageSession'
  import {
    resizePage,
    shadowAngle as getShadowAngle,
    shadowDistance as getShadowDistance,
    shadowPolarPatch,
    updateShadowPolar as setShadowPolar,
  } from './lib/app/pageAppearance'
  import { EditorSessionController } from './lib/app/editorSession'
  import { ProjectWorkflowController } from './lib/app/projectWorkflow'
  import { attachAppLifecycle, hasOpenDialog } from './lib/app/appLifecycle'
  import { UiPreferencesController } from './lib/app/uiPreferences'
  import { suggestBackgroundFromImages } from './lib/app/backgroundSuggestion'
  import {
    clampViewportZoom,
    type PageStyleControl,
    type SidebarTab,
    type StyleEditResult,
  } from './lib/app/pageActions'
  import { layoutShapeSummary } from './lib/layouts/displayName'
  import { completeOnboarding, hasCompletedOnboarding } from './lib/app/onboarding'
  import { applyAvailableUpdate, deploymentState } from './lib/app/deployment'
  import type { ProjectOperation } from './lib/app/projectOperation'

  const defaultSidebarWidth = 255
  const sidebarWidthsStorageKey = 'collage-builder:sidebar-widths'
  const recentColorsStorageKey = 'collage-builder:recent-custom-colors'
  const lastActivePageStoragePrefix = 'collage-builder:last-active-page:'

  const project = new ProjectStore(createProject())
  const projectPersistence = new ProjectPersistenceController()
  const canUndo = project.canUndo
  const canRedo = project.canRedo
  let assetRegistry = new AssetRegistry()
  let imageRevision = 0
  const colorPresets = [
    '#2507B3',
    '#4F37C1',
    '#9D8AF6',
    '#377A00',
    '#67BA24',
    '#A5E06C',
    '#0071AF',
    '#1792D5',
    '#5DC1F2',
    '#A30022',
    '#CF153C',
    '#F3718D',
    '#BF4800',
    '#E7691D',
    '#FDA857',
    '#A77500',
    '#E5AB26',
    '#FDDA5A',
    '#000000',
    '#505050',
    '#808080',
    '#C0C0C0',
    '#E6E6E6',
    '#FFFFFF',
  ]
  let document = project.snapshot()
  let recentColors: string[] = []
  let suggestingBackground = false
  let activePageId = document.pages[0].id
  let activePage: PageV1 = document.pages[0]
  let selectedSlotId: string | null = null
  let libraryTargetSlotId: string | null = null
  let projectFiles: ProjectFileInputs
  let leftSidebarPanel: ResponsiveSidebar
  let compactSidebar = false
  let sidebarOpen = false
  let cropZoom = 1
  let pageAspectLinked = false
  let viewportZoom = 1
  let isViewportFit = true
  let fittedViewportZoom = 1
  let leftSidebarWidth = defaultSidebarWidth
  let rightSidebarWidth = defaultSidebarWidth
  let cropModeSlotId: string | null = null
  let selectedAssetId: string | null = null
  let pendingNavigation: 'new' | 'open' | null = null
  let pendingLinkedDocument: typeof document | null = null
  let isSaveFormatOpen = false
  let hasSavedProject = false
  let saveFormatResolver: ((format: ProjectSaveFormat | null) => void) | null = null
  let assetFilter: AssetFilter = 'all'
  let assetQuery = ''
  let assetSort: AssetSort = 'import'
  let selectedAssetIds: string[] = []
  let imageManagerView: 'grid' | 'list' = 'grid'
  let pendingRemovalAssetIds: string[] | null = null
  let pendingRelinkConfirmation: string | null = null
  let relinkConfirmationResolver: ((accepted: boolean) => void) | null = null
  let isExportOpen = false
  let exportScope: 'current' | 'all' | 'range' = 'current'
  let exportRange = '1-1'
  let exportLongSide = 3840
  let exportFormat: ExportFormat = 'png'
  let exportQuality = 90
  let isExporting = false
  let cancelExportRequested = false
  let exportProgress = ''
  let isDirty = false
  let recoveredOnly = false
  let missingAssetIds = new Set<string>()
  let prefersDark = false
  let selectedContent: SlotContentV1 | null = null
  let activeTab: SidebarTab = 'layouts'
  let isImageManagerOpen = false
  let isRecoveryManagerOpen = false
  let isOnboardingOpen = false
  let startupRecovery: StartupRecovery | null = null
  let restoringRecovery = false
  let recoveryState: RecoveryState = {
    status: 'idle',
    message: 'Local autosave starting…',
  }
  let operationProgress: string | null = null
  let foregroundOperation: ProjectOperation | null = null
  let operationDialogVisible = false
  let operationDialogTimer: ReturnType<typeof setTimeout> | undefined
  let openingProject: { pages: PageV1[]; total: number } | null = null
  let importStatus: ImportBatchStatus | null = null
  let toast = ''
  let toastTimeout: number | undefined
  let projectTitle = document.title
  let photoUsageCounts = new Map<string, number>()

  const photoUsage = (assetId: string) => photoUsageCounts.get(assetId) ?? 0

  function setForegroundOperation(operation: ProjectOperation | null) {
    const newOperation = operation?.id !== foregroundOperation?.id
    if (!operation || newOperation) {
      if (operationDialogTimer) globalThis.clearTimeout(operationDialogTimer)
      operationDialogTimer = undefined
      operationDialogVisible = false
    }
    foregroundOperation = operation
    if (operation && newOperation)
      operationDialogTimer = globalThis.setTimeout(() => {
        if (foregroundOperation?.id === operation.id) operationDialogVisible = true
      }, 200)
  }

  function preferredPageId(nextDocument: typeof document): string {
    const saved = globalThis.localStorage?.getItem(
      `${lastActivePageStoragePrefix}${nextDocument.projectId}`,
    )
    return nextDocument.pages.some((page) => page.id === saved) ? saved! : nextDocument.pages[0].id
  }

  function confirmRelink(message: string): Promise<boolean> {
    resolveRelinkConfirmation(false)
    pendingRelinkConfirmation = message
    return new Promise((resolve) => (relinkConfirmationResolver = resolve))
  }

  function resolveRelinkConfirmation(accepted: boolean) {
    const resolve = relinkConfirmationResolver
    relinkConfirmationResolver = null
    pendingRelinkConfirmation = null
    resolve?.(accepted)
  }

  async function reloadAfterRecovery(): Promise<void> {
    operationProgress = 'Preserving unsaved work…'
    const saved = await recovery.flushNow()
    if (saved) globalThis.location.reload()
    else {
      operationProgress = null
      announce('Reload cancelled because unsaved work could not be preserved locally.')
    }
  }

  async function installUpdate(): Promise<void> {
    operationProgress = 'Preparing update…'
    if (!(await applyAvailableUpdate(() => recovery.flushNow()))) {
      operationProgress = null
      announce('The update could not be installed without risking unsaved work.')
    }
  }

  const editorSession = new EditorSessionController({
    project,
    page: () => activePage,
    selectedSlotId: () => selectedSlotId,
    selectedContent: () => selectedContent,
    cropModeSlotId: () => cropModeSlotId,
    setSelectedSlotId: (slotId) => (selectedSlotId = slotId),
    setCropModeSlotId: (slotId) => (cropModeSlotId = slotId),
    setSelectedAssetId: (assetId) => (selectedAssetId = assetId),
    announce,
  })
  const assetWorkflow = new AssetWorkflowController({
    project,
    document: () => document,
    pageId: () => activePage.id,
    selectedSlotId: () => selectedSlotId,
    libraryTargetSlotId: () => libraryTargetSlotId,
    selectedAssetId: () => selectedAssetId,
    selectedAssetIds: () => selectedAssetIds,
    missingAssetIds: () => missingAssetIds,
    registry: () => assetRegistry,
    setSelectedSlotId: (slotId) => (selectedSlotId = slotId),
    setLibraryTargetSlotId: (slotId) => (libraryTargetSlotId = slotId),
    setSelectedAssetId: (assetId) => (selectedAssetId = assetId),
    setSelectedAssetIds: (assetIds) => (selectedAssetIds = assetIds),
    setMissingAssetIds: (assetIds) => (missingAssetIds = assetIds),
    setPendingRemovalAssetIds: (assetIds) => (pendingRemovalAssetIds = assetIds),
    chooseReplacement: () => projectFiles.chooseReplacement(),
    chooseRelink: () => projectFiles.chooseRelink(),
    showImageLibrary: () => {
      activeTab = 'images'
      void leftSidebarPanel?.show()
    },
    revealImportedAssets: (assetIds) => {
      const imported = assetIds.flatMap((assetId) =>
        document.assets[assetId] ? [document.assets[assetId]] : [],
      )
      if (!imported.length) return
      if (assetFilter === 'used' || assetFilter === 'missing') assetFilter = 'all'
      const query = assetQuery.trim().toLocaleLowerCase()
      if (
        query &&
        imported.some((asset) => !asset.originalName.toLocaleLowerCase().includes(query))
      )
        assetQuery = ''
    },
    setImportStatus: (status) => (importStatus = status),
    setOperationProgress: (message) => (operationProgress = message),
    confirmRelink,
    announce,
  })
  const projectWorkflow = new ProjectWorkflowController({
    project,
    persistence: projectPersistence,
    document: () => document,
    projectTitle: () => projectTitle,
    registry: () => assetRegistry,
    activePage: () => activePage,
    preferredPageId,
    isDirty: () => isDirty,
    recoveredOnly: () => recoveredOnly,
    pendingNavigation: () => pendingNavigation,
    pendingLinkedDocument: () => pendingLinkedDocument,
    missingAssetIds: () => missingAssetIds,
    chooseProject: () => projectFiles.chooseProject(),
    chooseLinkedFolder: () => projectFiles.chooseLinkedFolder(),
    chooseFallbackFormat: chooseFallbackSaveFormat,
    installDocument,
    preparePageImages,
    setPendingNavigation: (value) => (pendingNavigation = value),
    setPendingLinkedDocument: (value) => (pendingLinkedDocument = value),
    setMissingAssetIds: (value) => (missingAssetIds = value),
    setRecoveredOnly: (value) => (recoveredOnly = value),
    setActivePageId: (value) => (activePageId = value),
    setSelectedSlotId: (value) => (selectedSlotId = value),
    setSelectedAssetId: (value) => (selectedAssetId = value),
    setCropModeSlotId: (value) => (cropModeSlotId = value),
    setProjectTitle: (value) => (projectTitle = value),
    setHasSavedProject: (value) => (hasSavedProject = value),
    incrementImageRevision: () => (imageRevision += 1),
    setOperationProgress: (message) => (operationProgress = message),
    setProjectOperation: setForegroundOperation,
    setOpeningPages: (pages, total) => (openingProject = pages === null ? null : { pages, total }),
    announce,
  })
  const exportWorkflow = new ExportWorkflowController({
    document: () => document,
    registry: () => assetRegistry,
    activePageId: () => activePageId,
    scope: () => exportScope,
    range: () => exportRange,
    longSide: () => exportLongSide,
    format: () => exportFormat,
    quality: () => exportQuality,
    projectTitle: () => projectTitle,
    isCancelled: () => cancelExportRequested,
    setScope: (value) => (exportScope = value),
    setOpen: (value) => (isExportOpen = value),
    setExporting: (value) => (isExporting = value),
    resetCancellation: () => (cancelExportRequested = false),
    setProgress: (value) => (exportProgress = value),
    announce,
  })
  const recovery = new RecoveryController({
    document: () => document,
    registry: () => assetRegistry,
    installDocument,
    onRestored: (restored) => {
      projectPersistence.reset()
      hasSavedProject = false
      recoveredOnly = true
      activePageId = preferredPageId(restored)
      projectTitle = restored.title
    },
    onState: (state) => (recoveryState = state),
    announce,
  })
  const uiPreferences = new UiPreferencesController(
    {
      project,
      page: () => activePage,
      recentColors: () => recentColors,
      leftSidebarWidth: () => leftSidebarWidth,
      rightSidebarWidth: () => rightSidebarWidth,
      setRecentColors: (value) => (recentColors = value),
      setLeftSidebarWidth: (value) => (leftSidebarWidth = value),
      setRightSidebarWidth: (value) => (rightSidebarWidth = value),
      setDark: (value) => (prefersDark = value),
    },
    sidebarWidthsStorageKey,
    recentColorsStorageKey,
  )
  const pageActions = {
    selectLayout(preset: LayoutPresetDefinition) {
      project.changeLayout(activePage.id, preset)
      announce(`Layout selected: ${layoutShapeSummary(preset)}.`)
      leftSidebarPanel?.close(true)
    },
    requestImage(slotId: string) {
      selectedSlotId = slotId
      libraryTargetSlotId = slotId
      activeTab = 'images'
      void leftSidebarPanel?.show()
      announce('Choose a photo from the library, or add a photo from your device.')
    },
    setViewportZoom(zoom: number) {
      isViewportFit = false
      viewportZoom = clampViewportZoom(zoom)
    },
    stepViewportZoom(delta: number) {
      pageActions.setViewportZoom((isViewportFit ? fittedViewportZoom : viewportZoom) + delta)
    },
    applyViewportWheelZoom(factor: number) {
      pageActions.setViewportZoom((isViewportFit ? fittedViewportZoom : viewportZoom) * factor)
    },
    updateStyle(patch: Partial<PageV1['style']>): StyleEditResult {
      try {
        project.setPageStyle(activePage.id, patch)
        return { ok: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to apply page style'
        announce(message)
        return { ok: false, message }
      }
    },
    previewStyle(control: PageStyleControl, patch: Partial<PageV1['style']>): StyleEditResult {
      try {
        project.previewPageStyle(activePage.id, control, patch)
        return { ok: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to preview page style'
        announce(message)
        return { ok: false, message }
      }
    },
    commitStyle(control: PageStyleControl) {
      project.commitPageStyle(activePage.id, control)
    },
    resize(axis: 'width' | 'height', value: number) {
      try {
        resizePage(project, activePage, axis, value, pageAspectLinked)
      } catch (error) {
        announce(error instanceof Error ? error.message : 'Unable to resize page')
      }
    },
    add() {
      project.addPage(activePage.id)
      activePageId = document.pages.at(-1)!.id
    },
    rename(pageId: string, name: string) {
      project.renamePage(pageId, name)
    },
    assignAsset(assetId: string, slotId: string) {
      project.assignAsset(activePage.id, slotId, assetId)
      libraryTargetSlotId = null
    },
    delete() {
      project.deletePage(activePage.id)
      activePageId = document.pages[0].id
    },
  }

  async function preparePageImages(page: PageV1, registry = assetRegistry): Promise<void> {
    try {
      const isCurrent = () => registry === assetRegistry && page.id === activePageId
      await loadPageImages(
        page,
        registry,
        isCurrent,
        () => (imageRevision += 1),
        () => (imageRevision += 1),
        document.assets,
      )
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to decode a project image')
    }
  }

  async function installDocument(
    nextDocument: typeof document,
    blobs: Map<string, Blob>,
    isCurrent: () => boolean = () => true,
    onProgress: (completed: number, total: number, readyPages: PageV1[]) => void = () => undefined,
  ): Promise<boolean> {
    const previousPageId = activePageId
    const nextPageId = preferredPageId(nextDocument)
    // The document subscription fires synchronously when the staged project is
    // committed. Set the intended page first so it never starts decoding page 1
    // while the remembered page is being prepared.
    activePageId = nextPageId
    let installed: boolean
    try {
      installed = await replaceProjectDocument(
        project,
        assetRegistry,
        nextDocument,
        blobs,
        (registry) => (assetRegistry = registry),
        isCurrent,
        onProgress,
        true,
        nextPageId,
        (registry) => registry === assetRegistry,
        () => (imageRevision += 1),
      )
    } catch (error) {
      activePageId = previousPageId
      throw error
    }
    if (installed) {
      imageRevision += 1
    } else activePageId = previousPageId
    return installed
  }

  let subscribedProjectId = document.projectId
  let reconciledAssets: typeof document.assets | undefined
  let reconciledRegistry: AssetRegistry | undefined
  let reconciledRetainedRevision = -1
  let reconciledHistoryRevision = -1
  project.document.subscribe((value) => {
    if (value.projectId !== subscribedProjectId) {
      resolveRelinkConfirmation(false)
      subscribedProjectId = value.projectId
      importStatus = null
    }
    document = value
    setOpenPreviewAssets(value.assets)
    // Retained blobs and Undo snapshots have one shared budget. Evict the
    // corresponding oldest history state before dropping any required bytes.
    if (
      assetRegistry.hasRetainedAssets &&
      (value.assets !== reconciledAssets ||
        assetRegistry !== reconciledRegistry ||
        assetRegistry.retainedRevision !== reconciledRetainedRevision ||
        project.historyRetentionRevision !== reconciledHistoryRevision)
    ) {
      assetRegistry.reconcileRetainedHistory([value, ...project.historySnapshots()])
      while (assetRegistry.isOverRetainedLimit && project.discardOldestUndo())
        assetRegistry.reconcileRetainedHistory([value, ...project.historySnapshots()])
    }
    reconciledAssets = value.assets
    reconciledRegistry = assetRegistry
    reconciledRetainedRevision = assetRegistry.retainedRevision
    reconciledHistoryRevision = project.historyRetentionRevision
    const unresolvedAssetIds: string[] = []
    for (const asset of Object.values(value.assets)) {
      if (assetRegistry.hasRetained(asset.id, asset.sha256)) {
        const registry = assetRegistry
        const isCurrent = () =>
          registry === assetRegistry && document.assets[asset.id]?.sha256 === asset.sha256
        void assetRegistry
          .restoreRetained(asset.id, asset.sha256, asset, isCurrent)
          .then((restored) => {
            if (restored && isCurrent()) {
              imageRevision += 1
              void preparePageImages(activePage, registry)
            }
          })
          .catch((error) => {
            if (!isCurrent()) return
            missingAssetIds = new Set([...missingAssetIds, asset.id])
            announce(error instanceof Error ? error.message : 'Unable to restore a project image')
          })
      } else if (!assetRegistry.hasActive(asset.id, asset.sha256)) unresolvedAssetIds.push(asset.id)
    }
    missingAssetIds = new Set(unresolvedAssetIds)
    recovery.schedule(value)
  })
  project.isDirty.subscribe((value) => (isDirty = value))

  onMount(() =>
    attachAppLifecycle({
      initializePreferences: uiPreferences.initialize,
      initializeStartup: () => void initializeStartup(),
      applyTheme: uiPreferences.applyTheme,
      pendingNavigation: () => pendingNavigation !== null,
      operationActive: () => foregroundOperation !== null,
      cancelPendingNavigation: () => (pendingNavigation = null),
      saveProject: (saveAs) => void projectWorkflow.save(saveAs),
      openProject: projectWorkflow.requestOpen,
      undo: () => project.undo(),
      redo: () => project.redo(),
      selectedSlotId: () => selectedSlotId,
      hasSelectedContent: () => selectedContent !== null,
      clearSelectedSlot: () => {
        if (selectedSlotId) project.clearSlot(activePage.id, selectedSlotId)
      },
      beginCrop: (slotId) => editorSession.beginCrop(slotId),
      isCropping: () => cropModeSlotId !== null,
      finishCrop: () => editorSession.finishCrop(),
      cancelCrop: () => editorSession.cancelCrop(),
      moveSelection: (key) => editorSession.moveSelection(key),
      isDirty: () => isDirty,
      flushRecovery: () => recovery.flushNow(),
      recoverFromLoadError: () => void reloadAfterRecovery(),
      cleanup: () => {
        releaseOpenPreviewAssets()
        recovery.cleanup()
      },
    }),
  )

  $: activePage = document.pages.find((page) => page.id === activePageId) ?? document.pages[0]
  $: if (activePage?.id)
    globalThis.localStorage?.setItem(
      `${lastActivePageStoragePrefix}${document.projectId}`,
      activePage.id,
    )
  $: void preparePageImages(activePage, assetRegistry)
  $: selectedContent = selectedSlotId ? activePage.slots[selectedSlotId] : null
  $: if (selectedContent) cropZoom = selectedContent.placement.zoom
  $: assets = Object.values(document.assets)
  $: photoUsageCounts = countAssetUsage(document)
  $: assetLibraryBytes = assets.reduce((total, asset) => total + asset.byteLength, 0)
  $: unusedAssetIds = assets
    .filter((asset) => (photoUsageCounts.get(asset.id) ?? 0) === 0)
    .map((asset) => asset.id)
  $: filteredAssets = filterAssets(
    document,
    assetQuery,
    assetFilter,
    assetSort,
    missingAssetIds,
    photoUsageCounts,
  )

  function announce(message: string) {
    globalThis.clearTimeout(toastTimeout)
    toast = message
    toastTimeout = globalThis.setTimeout(() => {
      toast = ''
      toastTimeout = undefined
    }, 3200)
  }

  async function suggestBackground() {
    if (suggestingBackground) return
    const page = activePage
    const registry = assetRegistry
    const assetIds = Object.values(page.slots).flatMap((content) =>
      content ? [content.assetId] : [],
    )
    if (!assetIds.length) return
    suggestingBackground = true
    try {
      await registry.ensureThumbnailImages(assetIds)
      if (page.id !== activePageId || registry !== assetRegistry) return
      const images = assetIds.map((assetId) => registry.getImage(assetId))
      if (images.some((image) => !image)) {
        announce('Wait for all page photos to load before suggesting a background.')
        return
      }
      const color = suggestBackgroundFromImages(images as HTMLImageElement[])
      if (!color) {
        announce('Could not find colors in the page photos.')
        return
      }
      uiPreferences.setBackground(color, true)
      announce(`Suggested background: ${color}.`)
    } catch {
      announce('Could not analyze the page photos.')
    } finally {
      suggestingBackground = false
    }
  }

  function focusCanvas() {
    globalThis.document.getElementById('collage-canvas')?.focus()
  }

  async function initializeStartup() {
    const candidate = await recovery.initialize(document.projectId)
    if (candidate) startupRecovery = candidate
    else if (!hasCompletedOnboarding()) isOnboardingOpen = true
  }

  function closeOnboarding() {
    completeOnboarding()
    isOnboardingOpen = false
  }

  async function restoreStartupRecovery() {
    restoringRecovery = true
    openingProject = { pages: [], total: startupRecovery?.pageCount ?? 1 }
    operationProgress = `Opening pages 0/${startupRecovery?.pageCount ?? 1}…`
    const operationId = Date.now()
    setForegroundOperation({
      id: operationId,
      kind: 'recovery',
      phase: 'Preparing pages',
      completed: 0,
      total: startupRecovery?.pageCount ?? 1,
      detail: `0 of ${startupRecovery?.pageCount ?? 1} pages`,
    })
    try {
      await tick()
      await new Promise<void>((resolve) => setTimeout(resolve, 16))
      await recovery.restoreStartup((completed, total, readyPages) => {
        operationProgress = `Opening pages ${completed}/${total}…`
        setForegroundOperation({
          id: operationId,
          kind: 'recovery',
          phase: 'Preparing pages',
          completed,
          total,
          detail: `${completed} of ${total} pages`,
        })
        openingProject = { pages: readyPages, total }
      })
      startupRecovery = null
      completeOnboarding()
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to restore the local project.')
    } finally {
      restoringRecovery = false
      operationProgress = null
      setForegroundOperation(null)
      openingProject = null
    }
  }

  function startWithoutRecovery() {
    recovery.startWithoutRecovery()
    startupRecovery = null
    completeOnboarding()
    announce('Started with a blank project. The previous recovery is still available locally.')
  }

  function manageStartupRecovery() {
    recovery.startWithoutRecovery()
    startupRecovery = null
    completeOnboarding()
    isRecoveryManagerOpen = true
  }

  function importFromOnboarding() {
    closeOnboarding()
    projectFiles.chooseImages()
  }

  function openFromOnboarding() {
    closeOnboarding()
    projectWorkflow.requestOpen()
  }

  function renameProject() {
    try {
      project.renameProject(projectTitle)
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to rename project')
    }
    projectTitle = document.title
  }

  function dropImages(event: DragEvent) {
    event.preventDefault()
    void assetWorkflow.import(event.dataTransfer?.files ?? null)
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
</script>

<svelte:head>
  <title>{projectTitle} | Collage Builder</title>
  <meta name="description" content="A local-first collage editor." />
</svelte:head>

<main
  class="app-shell"
  data-theme={prefersDark ? 'dark' : 'light'}
  data-decoded-image-bytes={assetRegistry.decodedImageBytes}
>
  <button class="skip-link" onclick={focusCanvas}>Skip to canvas</button>
  <ProjectFileInputs
    bind:this={projectFiles}
    onimport={assetWorkflow.import}
    onreplace={assetWorkflow.replace}
    onrelink={assetWorkflow.relink}
    onrelinkmany={assetWorkflow.relinkMany}
    onopen={projectWorkflow.open}
  ></ProjectFileInputs>
  <TopToolbar
    {compactSidebar}
    {sidebarOpen}
    ontogglesidebar={() => leftSidebarPanel.toggle()}
    bind:projectTitle
    canUndo={$canUndo}
    canRedo={$canRedo}
    bind:viewportZoom
    {fittedViewportZoom}
    bind:isViewportFit
    {isDirty}
    {hasSavedProject}
    {recoveredOnly}
    {recoveryState}
    {operationProgress}
    deployment={$deploymentState}
    onnew={projectWorkflow.requestNew}
    onopen={projectWorkflow.requestOpen}
    onsave={() => void projectWorkflow.save()}
    onsaveas={() => void projectWorkflow.save(true)}
    onundo={() => project.undo()}
    onredo={() => project.redo()}
    onzoomstep={pageActions.stepViewportZoom}
    onsetzoom={pageActions.setViewportZoom}
    onrename={renameProject}
    onexport={exportWorkflow.choose}
    onmanagerecovery={() => (isRecoveryManagerOpen = true)}
    onshowquickstart={() => (isOnboardingOpen = true)}
    onapplyupdate={() => void installUpdate()}
  ></TopToolbar>

  <section
    class="workspace"
    aria-label="Collage editor"
    style={`--left-sidebar-width:${leftSidebarWidth}px;--right-sidebar-width:${rightSidebarWidth}px`}
    inert={foregroundOperation !== null}
  >
    <ResponsiveSidebar
      bind:this={leftSidebarPanel}
      bind:compact={compactSidebar}
      bind:open={sidebarOpen}
    >
      <LeftSidebar
        bind:activeTab
        page={activePage}
        {libraryTargetSlotId}
        {assets}
        {filteredAssets}
        bind:selectedAssetIds
        {missingAssetIds}
        {assetRegistry}
        {imageRevision}
        bind:assetQuery
        bind:assetSort
        bind:assetFilter
        onselectlayout={pageActions.selectLayout}
        onerror={announce}
        ondrop={dropImages}
        onselectasset={(assetId, multi) => {
          const assigning = !multi && libraryTargetSlotId !== null
          assetWorkflow.select(assetId, multi)
          if (assigning) leftSidebarPanel.close(true)
        }}
        onstartdrag={(event, assetId) => {
          assetWorkflow.startDrag(event, assetId)
          leftSidebarPanel.beginDrag()
        }}
        onaddtopage={assetWorkflow.addToPage}
        onreplace={assetWorkflow.chooseReplacementFor}
        onrelink={assetWorkflow.chooseRelinkFor}
        onremove={assetWorkflow.requestRemoval}
        onchooseimages={() => projectFiles.chooseImages()}
        onmanageimages={() => (isImageManagerOpen = true)}
        assetUsage={photoUsage}
        {formatBytes}
        {importStatus}
        ondismissimport={() => (importStatus = null)}
      ></LeftSidebar>
    </ResponsiveSidebar>
    <SidebarResizer
      side="left"
      bind:width={leftSidebarWidth}
      label="Resize layouts and images sidebar"
      oncommit={(width) => uiPreferences.persistSidebarWidth('left', width)}
    ></SidebarResizer>

    {#if openingProject}
      <OpeningProjectView pages={openingProject.pages} total={openingProject.total}
      ></OpeningProjectView>
    {:else}
      <EditorShell
        {document}
        {activePage}
        {activePageId}
        {selectedSlotId}
        cropSlotId={cropModeSlotId}
        {viewportZoom}
        fitToViewport={isViewportFit}
        darkMode={prefersDark}
        {imageRevision}
        {assetRegistry}
        onactivepagechange={(pageId) => (activePageId = pageId)}
        onselectedslotchange={(slotId) => (selectedSlotId = slotId)}
        onfitzoomchange={(zoom) => (fittedViewportZoom = zoom)}
        onannounce={announce}
        onselect={(slotId) => editorSession.selectFrame(slotId)}
        onrequestcrop={(slotId) => editorSession.beginCrop(slotId)}
        onexitcrop={() => {
          if (cropModeSlotId) editorSession.finishCrop()
          selectedSlotId = null
        }}
        onrequestimage={pageActions.requestImage}
        onremoveframeimage={(slotId) => {
          if (foregroundOperation || hasOpenDialog()) return
          editorSession.cancelCrop()
          editorSession.selectFrame(slotId)
          project.clearSlot(activePage.id, slotId)
          announce('Photo removed from frame.')
        }}
        onplacementchange={(slotId, placement) => editorSession.commitPan(slotId, placement)}
        onassetdrop={(assetId, slotId) => {
          pageActions.assignAsset(assetId, slotId)
          leftSidebarPanel.close()
        }}
        onfiledrop={(files, slotId) =>
          void assetWorkflow.import(files, slotId ? { pageId: activePage.id, slotId } : undefined)}
        onframeswap={(sourceSlotId, targetSlotId) =>
          project.moveOrSwapSlots(activePage.id, sourceSlotId, targetSlotId)}
        onwheelzoom={(slotId, factor) => {
          const content = activePage.slots[slotId]
          if (content)
            editorSession.updateZoom(Math.min(8, Math.max(1, content.placement.zoom * factor)))
        }}
        onviewportzoom={pageActions.applyViewportWheelZoom}
        ondividerchange={(changes) => project.adjustDividers(activePage.id, changes)}
        onequalizesplit={(path) => project.equalizeSplit(activePage.id, path)}
        onaddpage={pageActions.add}
        onrenamepage={pageActions.rename}
        onduplicatepage={() => project.duplicatePage(activePageId)}
        onmovepage={(direction) => project.movePage(activePageId, direction)}
        onreorderpage={(pageId, targetIndex) => project.reorderPage(pageId, targetIndex)}
        onclearpage={() => project.clearPage(activePageId)}
        ondeletepage={pageActions.delete}
      ></EditorShell>
    {/if}

    <SidebarResizer
      side="right"
      bind:width={rightSidebarWidth}
      label="Resize properties sidebar"
      oncommit={(width) => uiPreferences.persistSidebarWidth('right', width)}
    ></SidebarResizer>
    <PropertiesPanel
      {activePage}
      {selectedSlotId}
      {selectedContent}
      selectedImageName={selectedContent
        ? document.assets[selectedContent.assetId]?.originalName
        : undefined}
      bind:pageAspectLinked
      {colorPresets}
      {recentColors}
      {cropModeSlotId}
      {cropZoom}
      onresizepage={pageActions.resize}
      onupdatestyle={pageActions.updateStyle}
      onpreviewstyle={pageActions.previewStyle}
      oncommitstyle={pageActions.commitStyle}
      onsetbackground={uiPreferences.setBackground}
      onsuggestbackground={suggestBackground}
      {suggestingBackground}
      onsetshadow={uiPreferences.setShadow}
      shadowDistance={() => getShadowDistance(activePage)}
      shadowAngle={() => getShadowAngle(activePage)}
      onupdateshadowpolar={(distance, angle) =>
        setShadowPolar(project, activePage, distance, angle)}
      onpreviewshadowpolar={(control, distance, angle) =>
        pageActions.previewStyle(control, shadowPolarPatch(activePage, distance, angle))}
      onrequestimage={pageActions.requestImage}
      onbegincrop={(slotId) => editorSession.beginCrop(slotId)}
      onupdatecropzoom={(zoom) => editorSession.updateZoom(zoom)}
      onrotatephoto={(quarterTurns) => editorSession.rotateSelected(quarterTurns)}
      onflipphoto={(axis) => editorSession.flipSelected(axis)}
      onupdatecropposition={(axis, percent) => editorSession.updatePosition(axis, percent)}
      onfinishcrop={() => editorSession.finishCrop()}
      onresetcrop={() => editorSession.resetCrop()}
      onremoveimage={() => editorSession.removeSelectedImage()}
    ></PropertiesPanel>
  </section>

  <ImageManagerDialog
    bind:open={isImageManagerOpen}
    {assets}
    {filteredAssets}
    {unusedAssetIds}
    bind:selectedAssetIds
    {missingAssetIds}
    {assetLibraryBytes}
    {assetRegistry}
    {imageRevision}
    bind:assetQuery
    bind:assetSort
    bind:assetFilter
    bind:view={imageManagerView}
    ondrop={dropImages}
    onchooseimages={() => projectFiles.chooseImages()}
    onselectasset={assetWorkflow.select}
    onstartdrag={assetWorkflow.startDrag}
    onreplace={assetWorkflow.chooseReplacementFor}
    onrelink={assetWorkflow.chooseRelinkFor}
    onrelinkmissing={() => projectFiles.chooseRelinkMany()}
    onremove={assetWorkflow.requestRemoval}
    assetUsage={photoUsage}
    {formatBytes}
  ></ImageManagerDialog>

  <ProjectDialogs
    {document}
    {activePage}
    bind:pendingRemovalAssetIds
    {pendingRelinkConfirmation}
    {isSaveFormatOpen}
    bind:pendingNavigation
    bind:pendingLinkedDocument
    bind:isExportOpen
    bind:exportScope
    bind:exportRange
    bind:exportLongSide
    bind:exportFormat
    bind:exportQuality
    {isExporting}
    {exportProgress}
    assetUsage={photoUsage}
    {formatBytes}
    exportUpscaleCount={exportWorkflow.upscaleCount}
    onremoveassets={assetWorkflow.remove}
    onresolverelink={resolveRelinkConfirmation}
    onresolvesaveformat={resolveSaveFormat}
    oncontinuenavigation={projectWorkflow.continueNavigation}
    onsavethencontinue={projectWorkflow.saveThenContinue}
    onrequestlinkedfolder={projectWorkflow.requestLinkedFolder}
    onexport={exportWorkflow.export}
    oncancelexport={() => (cancelExportRequested = true)}
  ></ProjectDialogs>

  <RecoveryManagerDialog
    bind:open={isRecoveryManagerOpen}
    {recovery}
    state={recoveryState}
    activeProjectId={document.projectId}
    {formatBytes}
    {announce}
  ></RecoveryManagerDialog>

  <StartupDialogs
    onboardingOpen={isOnboardingOpen}
    {startupRecovery}
    {restoringRecovery}
    oncloseonboarding={closeOnboarding}
    onimportimages={importFromOnboarding}
    onopenproject={openFromOnboarding}
    onrestorerecovery={() => void restoreStartupRecovery()}
    onstartblank={startWithoutRecovery}
    onmanagerecovery={manageStartupRecovery}
  ></StartupDialogs>

  <ProjectOperationDialog operation={foregroundOperation} visible={operationDialogVisible}
  ></ProjectOperationDialog>

  <div class:toast-visible={Boolean(toast)} class="toast" role="status" aria-atomic="true">
    {toast}
  </div>
</main>
