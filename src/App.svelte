<script lang="ts">
  import { createProject } from './lib/domain/factories'
  import type { PageV1, SlotContentV1 } from './lib/domain/types'
  import EditorShell from './lib/components/app/EditorShell.svelte'
  import ImageManagerDialog from './lib/components/app/ImageManagerDialog.svelte'
  import ProjectDialogs from './lib/components/app/ProjectDialogs.svelte'
  import LeftSidebar from './lib/components/app/LeftSidebar.svelte'
  import ProjectFileInputs from './lib/components/app/ProjectFileInputs.svelte'
  import TopToolbar from './lib/components/app/TopToolbar.svelte'
  import PropertiesPanel from './lib/components/app/PropertiesPanel.svelte'
  import SidebarResizer from './lib/components/app/SidebarResizer.svelte'
  import { ProjectStore } from './lib/state/projectStore'
  import { AssetRegistry } from './lib/render/assetRegistry'
  import { onMount } from 'svelte'
  import { RecoveryController } from './lib/app/recovery'
  import { ExportWorkflowController } from './lib/app/exportProject'
  import type { ExportFormat } from './lib/render/exportPng'
  import {
    AssetWorkflowController,
    filterAssets,
    formatBytes,
    type AssetFilter,
    type AssetSort,
  } from './lib/app/assetManagement'
  import type { ProjectSaveFormat } from './lib/app/projectIO'
  import { ProjectPersistenceController } from './lib/app/projectPersistence'
  import {
    preparePageImages as loadPageImages,
    replaceProjectDocument,
  } from './lib/app/imageSession'
  import {
    shadowAngle as getShadowAngle,
    shadowDistance as getShadowDistance,
    updateShadowPolar as setShadowPolar,
  } from './lib/app/pageAppearance'
  import { EditorSessionController } from './lib/app/editorSession'
  import { ProjectWorkflowController, saveAsModifierPressed } from './lib/app/projectWorkflow'
  import { attachAppLifecycle } from './lib/app/appLifecycle'
  import { UiPreferencesController } from './lib/app/uiPreferences'
  import { PageWorkflowController, type SidebarTab } from './lib/app/pageWorkflow'

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
  let saveFormatResolver: ((format: ProjectSaveFormat | null) => void) | null = null
  let assetFilter: AssetFilter = 'all'
  let assetQuery = ''
  let assetSort: AssetSort = 'import'
  let selectedAssetIds: string[] = []
  let imageManagerView: 'grid' | 'list' = 'grid'
  let pendingRemovalAssetIds: string[] | null = null
  let isExportOpen = false
  let exportScope: 'current' | 'all' | 'range' = 'current'
  let exportRange = '1-1'
  let exportWidth = 3840
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
  let toast = ''
  let projectTitle = document.title

  const editorSession = new EditorSessionController({
    project,
    page: () => activePage,
    selectedSlotId: () => selectedSlotId,
    selectedContent: () => selectedContent,
    cropModeSlotId: () => cropModeSlotId,
    selectedAssetId: () => selectedAssetId,
    setSelectedSlotId: (slotId) => (selectedSlotId = slotId),
    setCropModeSlotId: (slotId) => (cropModeSlotId = slotId),
    setSelectedAssetId: (assetId) => (selectedAssetId = assetId),
  })
  const assetWorkflow = new AssetWorkflowController({
    project,
    persistence: projectPersistence,
    document: () => document,
    pageId: () => activePage.id,
    selectedSlotId: () => selectedSlotId,
    selectedContentAssetId: () => selectedContent?.assetId ?? null,
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
    incrementImageRevision: () => (imageRevision += 1),
    announce,
  })
  const exportWorkflow = new ExportWorkflowController({
    document: () => document,
    registry: () => assetRegistry,
    activePageId: () => activePageId,
    scope: () => exportScope,
    range: () => exportRange,
    width: () => exportWidth,
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
      recoveredOnly = true
      activePageId = restored.pages[0].id
      projectTitle = restored.title
    },
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
  const pageWorkflow = new PageWorkflowController({
    project,
    document: () => document,
    page: () => activePage,
    pageAspectLinked: () => pageAspectLinked,
    viewportZoom: () => viewportZoom,
    fittedViewportZoom: () => fittedViewportZoom,
    isViewportFit: () => isViewportFit,
    setActivePageId: (value) => (activePageId = value),
    setSelectedSlotId: (value) => (selectedSlotId = value),
    setLibraryTargetSlotId: (value) => (libraryTargetSlotId = value),
    setActiveTab: (value) => (activeTab = value),
    setViewportZoom: (value) => (viewportZoom = value),
    setViewportFit: (value) => (isViewportFit = value),
    announce,
  })

  async function preparePageImages(page: PageV1, registry = assetRegistry): Promise<void> {
    try {
      const changed = await loadPageImages(page, registry)
      if (registry !== assetRegistry || page.id !== activePageId) return
      if (changed) imageRevision += 1
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to decode a project image')
    }
  }

  async function installDocument(nextDocument: typeof document, blobs: Map<string, Blob>) {
    await replaceProjectDocument(
      project,
      assetRegistry,
      nextDocument,
      blobs,
      (registry) => (assetRegistry = registry),
    )
    imageRevision += 1
  }

  project.document.subscribe((value) => {
    document = value
    for (const asset of Object.values(value.assets)) {
      if (assetRegistry.hasRetained(asset.id, asset.sha256))
        void assetRegistry
          .restoreRetained(asset.id, asset.sha256, asset)
          .then(() => preparePageImages(activePage, assetRegistry))
          .catch((error) =>
            announce(error instanceof Error ? error.message : 'Unable to restore a project image'),
          )
    }
    recovery.schedule(value)
  })
  project.isDirty.subscribe((value) => (isDirty = value))

  onMount(() =>
    attachAppLifecycle({
      initializePreferences: uiPreferences.initialize,
      restoreRecovery: () => void recovery.restore(document.projectId),
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
      cancelCrop: () => editorSession.cancelCrop(),
      moveSelection: (key) => editorSession.moveSelection(key),
      isDirty: () => isDirty,
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
    toast = message
    globalThis.setTimeout(() => {
      if (toast === message) toast = ''
    }, 3200)
  }

  function renameProject() {
    project.renameProject(projectTitle)
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
  <title>{projectTitle} — Collage Builder</title>
  <meta name="description" content="A local-first collage editor." />
</svelte:head>

<main class="app-shell" data-theme={prefersDark ? 'dark' : 'light'}>
  <ProjectFileInputs
    bind:this={projectFiles}
    onimport={assetWorkflow.import}
    onreplace={assetWorkflow.replace}
    onrelink={assetWorkflow.relink}
    onopen={projectWorkflow.open}
  ></ProjectFileInputs>
  <TopToolbar
    bind:projectTitle
    canUndo={$canUndo}
    canRedo={$canRedo}
    bind:viewportZoom
    {exportFormat}
    {fittedViewportZoom}
    bind:isViewportFit
    {isDirty}
    {recoveredOnly}
    onnew={projectWorkflow.requestNew}
    onopen={projectWorkflow.requestOpen}
    onsave={(event) => void projectWorkflow.save(saveAsModifierPressed(event))}
    onundo={() => project.undo()}
    onredo={() => project.redo()}
    onzoomstep={pageWorkflow.stepViewportZoom}
    onsetzoom={pageWorkflow.setViewportZoom}
    onrename={renameProject}
    onexport={exportWorkflow.choose}
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
      bind:assetQuery
      bind:assetSort
      bind:assetFilter
      onselectlayout={pageWorkflow.selectLayout}
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
      onselect={(slotId) => editorSession.selectFrame(slotId)}
      onrequestcrop={(slotId) => editorSession.beginCrop(slotId)}
      onexitcrop={() => {
        if (cropModeSlotId) editorSession.finishCrop()
        selectedSlotId = null
      }}
      onrequestimage={pageWorkflow.requestImage}
      onplacementchange={(slotId, placement) => editorSession.commitPan(slotId, placement)}
      onassetdrop={pageWorkflow.assignAsset}
      onframeswap={(sourceSlotId, targetSlotId) =>
        project.moveOrSwapSlots(activePage.id, sourceSlotId, targetSlotId)}
      onwheelzoom={(slotId, factor) => {
        const content = activePage.slots[slotId]
        if (content)
          editorSession.updateZoom(Math.min(8, Math.max(1, content.placement.zoom * factor)))
      }}
      onviewportzoom={pageWorkflow.applyViewportWheelZoom}
      ondividerchange={(changes) => project.adjustDividers(activePage.id, changes)}
      onaddpage={pageWorkflow.add}
      onrenamepage={pageWorkflow.rename}
      onduplicatepage={() => project.duplicatePage(activePageId)}
      onmovepage={(direction) => project.movePage(activePageId, direction)}
      onclearpage={() => project.clearPage(activePageId)}
      ondeletepage={pageWorkflow.delete}
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
      onresizepage={pageWorkflow.resize}
      onupdatestyle={pageWorkflow.updateStyle}
      onsetbackground={uiPreferences.setBackground}
      onsetshadow={uiPreferences.setShadow}
      shadowDistance={() => getShadowDistance(activePage)}
      shadowAngle={() => getShadowAngle(activePage)}
      onupdateshadowpolar={(distance, angle) =>
        setShadowPolar(project, activePage, distance, angle)}
      onrequestimage={pageWorkflow.requestImage}
      onbegincrop={(slotId) => editorSession.beginCrop(slotId)}
      onupdatecropzoom={(zoom) => editorSession.updateZoom(zoom)}
      onupdatecropposition={(axis, percent) => editorSession.updatePosition(axis, percent)}
      onfinishcrop={() => editorSession.finishCrop()}
      onresetcrop={() => editorSession.resetCrop()}
      onreplaceimage={assetWorkflow.replaceSelectedImage}
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
    onremove={assetWorkflow.requestRemoval}
    assetUsage={assetWorkflow.usage}
    {formatBytes}
  ></ImageManagerDialog>

  <ProjectDialogs
    {document}
    {activePage}
    bind:pendingRemovalAssetIds
    {isSaveFormatOpen}
    bind:pendingNavigation
    bind:pendingLinkedDocument
    bind:isExportOpen
    bind:exportScope
    bind:exportRange
    bind:exportWidth
    bind:exportFormat
    bind:exportQuality
    {isExporting}
    {exportProgress}
    assetUsage={assetWorkflow.usage}
    {formatBytes}
    exportUpscaleCount={exportWorkflow.upscaleCount}
    onremoveassets={assetWorkflow.remove}
    onresolvesaveformat={resolveSaveFormat}
    oncontinuenavigation={projectWorkflow.continueNavigation}
    onsavethencontinue={projectWorkflow.saveThenContinue}
    onrequestlinkedfolder={projectWorkflow.requestLinkedFolder}
    onexport={exportWorkflow.export}
    oncancelexport={() => (cancelExportRequested = true)}
  ></ProjectDialogs>

  {#if toast}
    <div class="toast" role="status">{toast}</div>
  {/if}
</main>
