<script lang="ts">
  import { createProject } from './lib/domain/factories'
  import type { LayoutPresetDefinition, PageV1, SlotContentV1 } from './lib/domain/types'
  import EditorShell from './lib/components/app/EditorShell.svelte'
  import ImageManagerDialog from './lib/components/app/ImageManagerDialog.svelte'
  import RecoveryManagerDialog from './lib/components/app/RecoveryManagerDialog.svelte'
  import StartupDialogs from './lib/components/app/StartupDialogs.svelte'
  import ProjectDialogs from './lib/components/app/ProjectDialogs.svelte'
  import LeftSidebar from './lib/components/app/LeftSidebar.svelte'
  import ProjectFileInputs from './lib/components/app/ProjectFileInputs.svelte'
  import TopToolbar from './lib/components/app/TopToolbar.svelte'
  import PropertiesPanel from './lib/components/app/PropertiesPanel.svelte'
  import SidebarResizer from './lib/components/app/SidebarResizer.svelte'
  import { ProjectStore } from './lib/state/projectStore'
  import { AssetRegistry } from './lib/render/assetRegistry'
  import { onMount } from 'svelte'
  import { RecoveryController, type RecoveryState, type StartupRecovery } from './lib/app/recovery'
  import { ExportWorkflowController } from './lib/app/exportProject'
  import type { ExportFormat } from './lib/render/exportPng'
  import {
    AssetWorkflowController,
    filterAssets,
    formatBytes,
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
  import { attachAppLifecycle } from './lib/app/appLifecycle'
  import { UiPreferencesController } from './lib/app/uiPreferences'
  import { clampViewportZoom, type PageStyleControl, type SidebarTab } from './lib/app/pageActions'
  import { layoutShapeSummary } from './lib/layouts/displayName'
  import { completeOnboarding, hasCompletedOnboarding } from './lib/app/onboarding'
  import { applyAvailableUpdate, deploymentState } from './lib/app/deployment'

  const defaultSidebarWidth = 255
  const sidebarWidthsStorageKey = 'collage-builder:sidebar-widths'
  const recentColorsStorageKey = 'collage-builder:recent-custom-colors'

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
  let activePageId = document.pages[0].id
  let activePage: PageV1 = document.pages[0]
  let selectedSlotId: string | null = null
  let libraryTargetSlotId: string | null = null
  let projectFiles: ProjectFileInputs
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
  let isLinkedSaveFolderOpen = false
  let hasSavedProject = false
  let saveFormatResolver: ((format: ProjectSaveFormat | null) => void) | null = null
  let linkedSaveFolderResolver: ((files: FileList | null) => void) | null = null
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
  let importStatus: ImportBatchStatus | null = null
  let toast = ''
  let toastTimeout: number | undefined
  let projectTitle = document.title

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
    persistence: projectPersistence,
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
      assetFilter = 'all'
      assetQuery = ''
      assetSort = 'import'
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
    isDirty: () => isDirty,
    recoveredOnly: () => recoveredOnly,
    pendingNavigation: () => pendingNavigation,
    pendingLinkedDocument: () => pendingLinkedDocument,
    missingAssetIds: () => missingAssetIds,
    chooseProject: () => projectFiles.chooseProject(),
    chooseLinkedFolder: () => projectFiles.chooseLinkedFolder(),
    chooseLinkedFolderForSave,
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
      activePageId = restored.pages[0].id
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
    },
    requestImage(slotId: string) {
      selectedSlotId = slotId
      libraryTargetSlotId = slotId
      activeTab = 'images'
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
    updateStyle(patch: Partial<PageV1['style']>) {
      project.setPageStyle(activePage.id, patch)
    },
    previewStyle(control: PageStyleControl, patch: Partial<PageV1['style']>) {
      project.previewPageStyle(activePage.id, control, patch)
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
      )
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to decode a project image')
    }
  }

  async function installDocument(
    nextDocument: typeof document,
    blobs: Map<string, Blob>,
    isCurrent: () => boolean = () => true,
  ): Promise<boolean> {
    const installed = await replaceProjectDocument(
      project,
      assetRegistry,
      nextDocument,
      blobs,
      (registry) => (assetRegistry = registry),
      isCurrent,
    )
    if (installed) imageRevision += 1
    return installed
  }

  let subscribedProjectId = document.projectId
  project.document.subscribe((value) => {
    if (value.projectId !== subscribedProjectId) {
      resolveRelinkConfirmation(false)
      subscribedProjectId = value.projectId
      importStatus = null
    }
    document = value
    // Retained blobs and Undo snapshots have one shared budget. Evict the
    // corresponding oldest history state before dropping any required bytes.
    assetRegistry.reconcileRetainedHistory([value, ...project.historySnapshots()])
    while (assetRegistry.isOverRetainedLimit && project.discardOldestUndo())
      assetRegistry.reconcileRetainedHistory([value, ...project.historySnapshots()])
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
      cleanup: () => recovery.cleanup(),
    }),
  )

  $: activePage = document.pages.find((page) => page.id === activePageId) ?? document.pages[0]
  $: void preparePageImages(activePage, assetRegistry)
  $: selectedContent = selectedSlotId ? activePage.slots[selectedSlotId] : null
  $: if (selectedContent) cropZoom = selectedContent.placement.zoom
  $: assets = Object.values(document.assets)
  $: assetLibraryBytes = assets.reduce((total, asset) => total + asset.byteLength, 0)
  $: unusedAssetIds = assets
    .filter((asset) => assetWorkflow.usage(asset.id) === 0)
    .map((asset) => asset.id)
  $: filteredAssets = filterAssets(
    document,
    assets,
    assetQuery,
    assetFilter,
    assetSort,
    missingAssetIds,
  )

  function announce(message: string) {
    globalThis.clearTimeout(toastTimeout)
    toast = message
    toastTimeout = globalThis.setTimeout(() => {
      toast = ''
      toastTimeout = undefined
    }, 3200)
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
    try {
      await recovery.restoreStartup()
      startupRecovery = null
      completeOnboarding()
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to restore the local project.')
    } finally {
      restoringRecovery = false
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

  function chooseLinkedFolderForSave(): Promise<FileList | null> {
    isLinkedSaveFolderOpen = true
    return new Promise((resolve) => (linkedSaveFolderResolver = resolve))
  }

  function resolveLinkedSaveFolder(choose: boolean) {
    const resolve = linkedSaveFolderResolver
    linkedSaveFolderResolver = null
    isLinkedSaveFolderOpen = false
    if (choose) void projectFiles.chooseLinkedFolder().then((files) => resolve?.(files))
    else resolve?.(null)
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
      onselectasset={assetWorkflow.select}
      onstartdrag={assetWorkflow.startDrag}
      onaddtopage={assetWorkflow.addToPage}
      onreplace={assetWorkflow.chooseReplacementFor}
      onrelink={assetWorkflow.chooseRelinkFor}
      onremove={assetWorkflow.requestRemoval}
      onchooseimages={() => projectFiles.chooseImages()}
      onmanageimages={() => (isImageManagerOpen = true)}
      assetUsage={assetWorkflow.usage}
      {formatBytes}
      {importStatus}
      ondismissimport={() => (importStatus = null)}
    ></LeftSidebar>
    <SidebarResizer
      side="left"
      bind:width={leftSidebarWidth}
      label="Resize layouts and images sidebar"
      oncommit={(width) => uiPreferences.persistSidebarWidth('left', width)}
    ></SidebarResizer>

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
      onplacementchange={(slotId, placement) => editorSession.commitPan(slotId, placement)}
      onassetdrop={pageActions.assignAsset}
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
    assetUsage={assetWorkflow.usage}
    {formatBytes}
  ></ImageManagerDialog>

  <ProjectDialogs
    {document}
    {activePage}
    bind:pendingRemovalAssetIds
    {pendingRelinkConfirmation}
    {isSaveFormatOpen}
    {isLinkedSaveFolderOpen}
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
    assetUsage={assetWorkflow.usage}
    {formatBytes}
    exportUpscaleCount={exportWorkflow.upscaleCount}
    onremoveassets={assetWorkflow.remove}
    onresolverelink={resolveRelinkConfirmation}
    onresolvesaveformat={resolveSaveFormat}
    onresolvelinkedsavefolder={resolveLinkedSaveFolder}
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

  <div class:toast-visible={Boolean(toast)} class="toast" role="status" aria-atomic="true">
    {toast}
  </div>
</main>
