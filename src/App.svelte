<script lang="ts">
  import { createProject } from './lib/domain/factories'
  import { resolveLayout } from './lib/domain/geometry'
  import type { PageV1, SlotContentV1 } from './lib/domain/types'
  import CanvasEditor from './lib/components/editor/CanvasEditor.svelte'
  import { validateImportedImage } from './lib/domain/importImage'
  import { layoutCatalog } from './lib/layouts/catalog'
  import { previewFrames } from './lib/layouts/preview'
  import { ProjectStore } from './lib/state/projectStore'
  import { AssetRegistry } from './lib/render/assetRegistry'
  import { onMount } from 'svelte'
  import { Collapsible, DropdownMenu, Popover, Select, Slider, Switch, ToggleGroup } from 'bits-ui'
  import { renderPagePng, resolveExportRange, zipPngs } from './lib/render/exportPng'
  import { createArchive, maxProjectBytes, openArchive } from './lib/persistence/archive'
  import { loadLatestRecovery, loadRecoveryAssets, saveRecovery } from './lib/persistence/autosave'

  type SidebarTab = 'layouts' | 'images'

  const project = new ProjectStore(createProject())
  const assetRegistry = new AssetRegistry()
  const colorPresets = ['#000000', '#FFFFFF', '#808080', '#D94841', '#E58D2C', '#F2C94C', '#61A16A', '#2E9A8A', '#3A87C6', '#315C9C', '#6C5BA7', '#B05B9A', '#6B4E3D', '#F2E9D8', '#DCE8F5', '#E5E2D9']
  const layoutGroups = [...new Set(layoutCatalog.map((layout) => layout.frameCount))].filter((frameCount) => frameCount > 1).sort((left, right) => left - right).map((frameCount) => ({ frameCount, layouts: layoutCatalog.filter((layout) => layout.frameCount === frameCount) }))
  let document = project.snapshot()
  let activePageId = document.pages[0].id
  let activePage: PageV1 = document.pages[0]
  let selectedSlotId: string | null = null
  let libraryTargetSlotId: string | null = null
  let uploadInput: HTMLInputElement
  let cropZoom = 1
  let viewportZoom = 1
  let cropModeSlotId: string | null = null
  let cropOrigin: { pageId: string; slotId: string; placement: SlotContentV1['placement'] } | null = null
  let selectedAssetId: string | null = null
  let usageAssetId: string | null = null
  let isPageMenuOpen = false
  let pendingNavigation: 'new' | 'open' | null = null
  let collapsedLayoutCounts = new Set<number>()
  let replaceInput: HTMLInputElement
  let relinkInput: HTMLInputElement
  let openInput: HTMLInputElement
  let assetFilter: 'all' | 'used' | 'unused' | 'missing' = 'all'
  let assetQuery = ''
  let assetSort: 'import' | 'name' | 'size' | 'usage' = 'import'
  let selectedAssetIds: string[] = []
  let imageManagerView: 'grid' | 'list' = 'grid'
  let pendingRemovalAssetIds: string[] | null = null
  let isExportOpen = false
  let isExportMenuOpen = false
  let exportScope: 'current' | 'all' | 'range' = 'current'
  let exportRange = '1-1'
  let exportWidth = 1600
  let isExporting = false
  let exportProgress = ''
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined
  let recoveryReady = false
  let isDirty = false
  let recoveredOnly = false
  let missingAssetIds = new Set<string>()
  function scheduleRecovery(value: typeof document) {
    if (!recoveryReady) return
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => saveRecovery(value, assetRegistry).catch(() => announce('Local recovery save failed.')), 1000)
  }
  project.document.subscribe((value) => {
    document = value
    for (const asset of Object.values(value.assets)) {
      if (assetRegistry.hasRetained(asset.id, asset.sha256)) void assetRegistry.restoreRetained(asset.id, asset.sha256)
    }
    scheduleRecovery(value)
  })
  project.isDirty.subscribe((value) => isDirty = value)

  onMount(() => {
    void (async () => {
      try {
        const recovery = await loadLatestRecovery().catch(() => undefined)
        if (!recovery || recovery.projectId === document.projectId) return
        const blobs = await loadRecoveryAssets(recovery)
        const embedded = Object.values(recovery.assets).filter((asset) => asset.storage.kind === 'embedded')
        if (embedded.some((asset) => !blobs.has(asset.id))) return
        assetRegistry.clear()
        for (const [assetId, blob] of blobs) await assetRegistry.register(assetId, blob, recovery.assets[assetId]?.sha256)
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
      if (event.key === 'Escape' && pendingNavigation) { pendingNavigation = null; event.preventDefault(); return }
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); void saveProject(); return }
      if (modifier && event.key.toLowerCase() === 'o') { event.preventDefault(); requestOpen(); return }
      if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) project.redo(); else project.undo(); return }
      if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); project.redo(); return }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedSlotId) { project.clearSlot(activePage.id, selectedSlotId); return }
      if (event.key === 'Enter' && selectedContent && selectedSlotId) { beginCrop(selectedSlotId); return }
      if (event.key === 'Escape') {
        if (cropOrigin) {
          project.cancelCrop(cropOrigin.pageId, cropOrigin.slotId, cropOrigin.placement)
        }
        cropOrigin = null
        cropModeSlotId = null
        selectedAssetId = null
        return
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { const frames = resolveLayout(activePage); const index = frames.findIndex((frame) => frame.slotId === selectedSlotId); const next = frames[index < 0 ? 0 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + frames.length) % frames.length]; selectedSlotId = next.slotId; event.preventDefault() }
    }
    globalThis.addEventListener('keydown', keyboard)
    const beforeUnload = (event: BeforeUnloadEvent) => { if (isDirty) { event.preventDefault(); event.returnValue = '' } }
    globalThis.addEventListener('beforeunload', beforeUnload)
    return () => { if (autosaveTimer) clearTimeout(autosaveTimer); globalThis.removeEventListener('keydown', keyboard); globalThis.removeEventListener('beforeunload', beforeUnload) }
  })

  let activeTab: SidebarTab = 'layouts'
  let isImageManagerOpen = false
  let toast = ''
  let projectTitle = document.title

  $: activePage = document.pages.find((page) => page.id === activePageId) ?? document.pages[0]
  $: selectedContent = selectedSlotId ? activePage.slots[selectedSlotId] : null
  $: if (selectedContent) cropZoom = selectedContent.placement.zoom
  $: assets = Object.values(document.assets)
  $: assetUsages = usageAssetId ? document.pages.flatMap((page) => resolveLayout(page).flatMap((frame, index) => page.slots[frame.slotId]?.assetId === usageAssetId ? [{ pageId: page.id, pageName: page.name, slotId: frame.slotId, frameNumber: index + 1 }] : [])) : []
  $: filteredAssets = assets.filter((asset) => (assetFilter === 'all' || assetFilter === 'missing' ? assetFilter === 'all' || missingAssetIds.has(asset.id) : assetFilter === 'used' ? assetUsage(asset.id) > 0 : assetUsage(asset.id) === 0) && asset.originalName.toLocaleLowerCase().includes(assetQuery.trim().toLocaleLowerCase())).sort((left, right) => assetSort === 'name' ? left.originalName.localeCompare(right.originalName) : assetSort === 'size' ? right.byteLength - left.byteLength : assetSort === 'usage' ? assetUsage(right.id) - assetUsage(left.id) : 0)

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
  function setLayoutGroupOpen(frameCount: number, open: boolean) { collapsedLayoutCounts = new Set(open ? [...collapsedLayoutCounts].filter((count) => count !== frameCount) : [...collapsedLayoutCounts, frameCount]) }

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
  function dropImages(event: DragEvent) { event.preventDefault(); void importFiles(event.dataTransfer?.files ?? null) }

  function beginCrop(slotId: string) {
    if (cropModeSlotId && cropModeSlotId !== slotId) finishCrop()
    const content = activePage.slots[slotId]
    selectedSlotId = slotId
    if (!content) { cropModeSlotId = null; cropOrigin = null; return }
    if (cropModeSlotId !== slotId) cropOrigin = { pageId: activePage.id, slotId, placement: structuredClone(content.placement) }
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
    if (cropModeSlotId === selectedSlotId) project.previewSlotContent(activePage.id, selectedSlotId, content)
    else project.setSlotContent(activePage.id, selectedSlotId, content)
  }

  function updateCropPosition(axis: 'positionX' | 'positionY', percent: number) {
    if (!selectedSlotId || !selectedContent) return
    const content = { ...selectedContent, placement: { ...selectedContent.placement, [axis]: Math.min(1, Math.max(0, percent / 100)) } }
    if (cropModeSlotId === selectedSlotId) project.previewSlotContent(activePage.id, selectedSlotId, content)
    else project.setSlotContent(activePage.id, selectedSlotId, content)
  }

  function commitCropPan(slotId: string, placement: NonNullable<typeof selectedContent>['placement']) {
    const content = activePage.slots[slotId]
    if (content) project.previewSlotContent(activePage.id, slotId, { ...content, placement })
  }

  function updateStyle(patch: Partial<PageV1['style']>) { project.setPageStyle(activePage.id, patch) }
  function shadowDistance() { return Math.round(Math.hypot(activePage.style.shadow.offsetX, activePage.style.shadow.offsetY)) }
  function shadowAngle() { return Math.round((Math.atan2(activePage.style.shadow.offsetY, activePage.style.shadow.offsetX) * 180 / Math.PI - 135 + 360) % 360) }
  function updateShadowPolar(distance = shadowDistance(), angle = shadowAngle()) {
    const radians = (angle + 135) * Math.PI / 180
    updateStyle({ shadow: { ...activePage.style.shadow, offsetX: Math.round(Math.cos(radians) * distance * 100) / 100, offsetY: Math.round(Math.sin(radians) * distance * 100) / 100 } })
  }
  function resizeActivePage(axis: 'width' | 'height', value: number) {
    const width = axis === 'width' ? value : activePage.width
    const height = axis === 'height' ? value : activePage.height
    try { project.resizePage(activePage.id, width, height) } catch (error) { announce(error instanceof Error ? error.message : 'Unable to resize page') }
  }

  function addPage() { project.addPage(); activePageId = document.pages[document.pages.length - 1].id }
  function renameActivePage() { const name = globalThis.prompt('Page name', activePage.name); if (name !== null) project.renamePage(activePage.id, name) }
  function newProject() { const next = createProject('Untitled collage'); assetRegistry.clear(); missingAssetIds = new Set(); recoveredOnly = false; project.replaceDocument(next); projectTitle = next.title; activePageId = next.pages[0].id; selectedSlotId = null; selectedAssetId = null; cropModeSlotId = null; announce('New blank project created.') }
  function requestNew() { if (isDirty || recoveredOnly) pendingNavigation = 'new'; else newProject() }
  function requestOpen() { if (isDirty || recoveredOnly) pendingNavigation = 'open'; else openInput.click() }
  function continueNavigation() { const action = pendingNavigation; pendingNavigation = null; if (action === 'new') newProject(); else if (action === 'open') openInput.click() }
  async function saveThenContinue() { if (await saveProject()) continueNavigation() }
  function assetUsage(assetId: string) { return document.pages.flatMap((page) => Object.values(page.slots)).filter((content) => content?.assetId === assetId).length }
  function formatBytes(bytes: number) { return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB` }
  function selectAsset(assetId: string, multi = false) { selectedAssetId = assetId; selectedAssetIds = multi ? (selectedAssetIds.includes(assetId) ? selectedAssetIds.filter((id) => id !== assetId) : [...selectedAssetIds, assetId]) : [assetId]; if (!multi && libraryTargetSlotId) { project.assignAsset(activePage.id, libraryTargetSlotId, assetId); selectedSlotId = libraryTargetSlotId; libraryTargetSlotId = null; announce('Image added to frame.') } }
  function startAssetDrag(event: DragEvent, assetId: string) { event.dataTransfer?.setData('application/x-collage-asset', assetId); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy' }
  function showUsage(assetId: string) { usageAssetId = assetId }
  function jumpToUsage(pageId: string, slotId: string) { activePageId = pageId; selectedSlotId = slotId; activeTab = 'layouts'; isImageManagerOpen = false; usageAssetId = null }
  function requestRemoveAssets(assetIds: string[]) { pendingRemovalAssetIds = [...new Set(assetIds)].filter((assetId) => document.assets[assetId]) }
  function removeAssets(assetIds: string[]) { assetIds.forEach((assetId) => { assetRegistry.retain(assetId, document.assets[assetId].sha256); project.removeAsset(assetId); assetRegistry.release(assetId) }); selectedAssetId = null; selectedAssetIds = []; pendingRemovalAssetIds = null; announce(`${assetIds.length} image(s) removed from project.`) }
  function previousPage() { const index = document.pages.findIndex((page) => page.id === activePageId); if (index > 0) { activePageId = document.pages[index - 1].id; selectedSlotId = null } }
  function nextPage() { const index = document.pages.findIndex((page) => page.id === activePageId); if (index < document.pages.length - 1) { activePageId = document.pages[index + 1].id; selectedSlotId = null } }
  async function exportPages() { try { isExporting = true; const indices = resolveExportRange(exportScope, document.pages.findIndex((page) => page.id === activePageId), document.pages.length, exportRange); const rendered: Array<{ name: string; blob: Blob }> = []; for (const [position, index] of indices.entries()) { exportProgress = `Rendering page ${position + 1} of ${indices.length}…`; rendered.push({ name: `${projectTitle || 'collage'}-${String(index + 1).padStart(2, '0')}.png`, blob: await renderPagePng(document.pages[index], document.assets, (assetId) => assetRegistry.getImage(assetId), exportWidth) }); await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0)) } exportProgress = rendered.length > 1 ? 'Packaging ZIP…' : 'Preparing download…'; const blob = rendered.length === 1 ? rendered[0].blob : await zipPngs(rendered); const link = globalThis.document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = rendered.length === 1 ? rendered[0].name : `${projectTitle || 'collage'}-pages.zip`; link.click(); URL.revokeObjectURL(link.href); isExportOpen = false; announce(`Exported ${rendered.length} page${rendered.length === 1 ? '' : 's'}.`) } catch (error) { announce(error instanceof Error ? error.message : 'Export failed') } finally { isExporting = false; exportProgress = '' } }
  function chooseExport(scope: typeof exportScope) { exportScope = scope; isExportMenuOpen = false; isExportOpen = true }
  async function saveProject(): Promise<boolean> { try { const archive = await createArchive(document, { get: (assetId) => assetRegistry.getBlob(assetId) }); const link = globalThis.document.createElement('a'); link.href = URL.createObjectURL(archive); link.download = `${projectTitle || 'collage'}.collage`; link.click(); URL.revokeObjectURL(link.href); project.markClean(); recoveredOnly = false; announce('Project archive downloaded.'); return true } catch (error) { announce(error instanceof Error ? error.message : 'Unable to save project'); return false } }
  async function openProject(file: File | undefined) { if (!file) return; try { const opened = await openArchive(file); assetRegistry.clear(); for (const [assetId, blob] of opened.assets) await assetRegistry.register(assetId, blob, opened.document.assets[assetId]?.sha256); missingAssetIds = new Set(opened.missingAssetIds); recoveredOnly = false; project.replaceDocument(opened.document); activePageId = opened.document.pages[0].id; selectedSlotId = null; projectTitle = opened.document.title; announce(opened.missingAssetIds.length ? `Project opened with ${opened.missingAssetIds.length} missing image(s).` : 'Project opened.') } catch (error) { announce(error instanceof Error ? error.message : 'Unable to open project') } finally { openInput.value = '' } }
  async function replaceSelected(file: File | undefined) { if (!file || !selectedAssetId) return; try { const { asset } = await validateImportedImage(file); const target = selectedAssetId; assetRegistry.retain(target, document.assets[target].sha256); await assetRegistry.register(target, file, asset.sha256); project.replaceAsset(target, { ...asset, id: target, storage: { kind: 'embedded', archivePath: asset.storage.kind === 'embedded' ? asset.storage.archivePath.replace(asset.id, target) : asset.storage.displayHint } }); announce('Original image replaced everywhere it is used.') } catch (error) { announce(error instanceof Error ? error.message : 'Unable to replace image') } finally { replaceInput.value = '' } }
  async function relinkSelected(file: File | undefined) { if (!file || !selectedAssetId || !missingAssetIds.has(selectedAssetId)) return; try { const { asset } = await validateImportedImage(file); const target = selectedAssetId; const original = document.assets[target]; if (original.sha256 !== asset.sha256 && !globalThis.confirm('This file differs from the missing original. Use it for this image anyway?')) return; await assetRegistry.register(target, file, asset.sha256); project.replaceAsset(target, { ...asset, id: target, storage: { kind: 'embedded', archivePath: asset.storage.kind === 'embedded' ? asset.storage.archivePath.replace(asset.id, target) : asset.storage.displayHint } }); missingAssetIds = new Set([...missingAssetIds].filter((id) => id !== target)); announce('Image relinked everywhere it is used.') } catch (error) { announce(error instanceof Error ? error.message : 'Unable to relink image') } finally { relinkInput.value = '' } }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return
    const existingBytes = Object.values(document.assets).reduce((total, asset) => total + asset.byteLength, 0)
    if (existingBytes + [...files].reduce((total, file) => total + file.size, 0) > maxProjectBytes) { announce('This import would exceed the 1 GB project asset limit.'); return }
    let added = 0
    for (const file of files) {
      try {
        const { asset } = await validateImportedImage(file)
        await assetRegistry.register(asset.id, file, asset.sha256)
        try { project.addAsset(asset) } catch (error) { assetRegistry.release(asset.id); throw error }
        added += 1
      } catch (error) { announce(error instanceof Error ? error.message : 'Unable to import image') }
    }
    if (added) announce(`${added} image${added === 1 ? '' : 's'} added to this project.`)
    if (uploadInput) uploadInput.value = ''
  }
</script>

<svelte:head>
  <title>{projectTitle} — Collage Builder</title>
  <meta name="description" content="A local-first collage editor." />
</svelte:head>

<main class="app-shell">
  <input class="sr-only" bind:this={uploadInput} type="file" accept="image/jpeg,image/png,image/webp" multiple onchange={(event) => importFiles(event.currentTarget.files)} />
  <input class="sr-only" bind:this={replaceInput} type="file" accept="image/jpeg,image/png,image/webp" onchange={(event) => replaceSelected(event.currentTarget.files?.[0])} />
  <input class="sr-only" bind:this={relinkInput} type="file" accept="image/jpeg,image/png,image/webp" onchange={(event) => relinkSelected(event.currentTarget.files?.[0])} />
  <input class="sr-only" bind:this={openInput} type="file" accept=".collage,application/vnd.collage-builder+zip" onchange={(event) => openProject(event.currentTarget.files?.[0])} />
  <header class="topbar" aria-label="Project controls">
    <div class="toolbar-group">
      <button class="button button-primary" onclick={requestNew}>New</button>
      <button class="button" onclick={requestOpen}>Open</button>
      <button class="button" onclick={saveProject}>Save</button>
    </div>
    <div class="toolbar-group history-controls" aria-label="History">
      <button class="icon-button" aria-label="Undo" title="Undo" disabled={!project.canUndo} onclick={() => project.undo()}>↶</button>
      <button class="icon-button" aria-label="Redo" title="Redo" disabled={!project.canRedo} onclick={() => project.redo()}>↷</button>
    </div>
    <div class="toolbar-group editor-zoom" aria-label="Canvas zoom"><button class="icon-button" aria-label="Zoom out" disabled={viewportZoom <= 0.5} onclick={() => viewportZoom = Math.max(0.5, viewportZoom - 0.1)}>−</button><button class="zoom-fit" onclick={() => viewportZoom = 1}>Fit</button><span>{Math.round(viewportZoom * 100)}%</span><button class="icon-button" aria-label="Zoom in" disabled={viewportZoom >= 2} onclick={() => viewportZoom = Math.min(2, viewportZoom + 0.1)}>+</button></div>
    <label class="project-title">
      <span class="sr-only">Project title</span>
      <input bind:value={projectTitle} aria-label="Project title" onblur={renameProject} />
    </label>
    <div class="toolbar-group topbar-end">
      <span class="save-status"><span class:dirty={isDirty || recoveredOnly} class="status-dot"></span>{isDirty ? 'Unsaved changes' : recoveredOnly ? 'Recovered locally' : 'Saved'}</span>
      <div class="export-menu"><button class="button button-primary" onclick={() => chooseExport('current')}>Export PNG</button><button class="button button-primary export-caret" aria-label="Choose export scope" onclick={() => isExportMenuOpen = !isExportMenuOpen}>▾</button>{#if isExportMenuOpen}<div class="export-menu-popover"><button onclick={() => chooseExport('current')}>Current page</button><button onclick={() => chooseExport('all')}>All pages (ZIP)</button><button onclick={() => chooseExport('range')}>Page range…</button></div>{/if}</div>
    </div>
  </header>

  <section class="workspace" aria-label="Collage editor">
    <aside class="sidebar left-panel" aria-label="Layouts and images">
      <div class="panel-tabs" role="tablist" aria-label="Editor panel">
        <button class:active={activeTab === 'layouts'} role="tab" aria-selected={activeTab === 'layouts'} onclick={() => activeTab = 'layouts'}>Layouts</button>
        <button class:active={activeTab === 'images'} role="tab" aria-selected={activeTab === 'images'} onclick={() => activeTab = 'images'}>Images</button>
      </div>

      {#if activeTab === 'layouts'}
        <div class="panel-body">
          <p class="eyebrow">Choose a layout</p>
          <p class="panel-copy">Pick a preset to start composing your page.</p>
          <div class="layout-list">
            {#each layoutGroups as group (group.frameCount)}
              <Collapsible.Root class="layout-group" open={!collapsedLayoutCounts.has(group.frameCount)} onOpenChange={(open) => setLayoutGroupOpen(group.frameCount, open)}><h3><Collapsible.Trigger><span aria-hidden="true">{collapsedLayoutCounts.has(group.frameCount) ? '▸' : '▾'}</span>{group.frameCount} photos</Collapsible.Trigger></h3><Collapsible.Content><div class="layout-options">{#each group.layouts as layout (layout.id)}
                {@const frames = previewFrames(layout, 80, 80)}
                <button class:selected={layout.id === activePage.layout.presetId} class="layout-card" title={layout.name} aria-label={layout.name} onclick={() => selectLayout(layout.id)}>
                  <span class="layout-preview" aria-hidden="true">{#each frames as frame (frame.slotId)}<i style={`left:${frame.x / 80 * 100}%;top:${frame.y / 80 * 100}%;width:${frame.width / 80 * 100}%;height:${frame.height / 80 * 100}%`}></i>{/each}</span>
                </button>
              {/each}</div></Collapsible.Content></Collapsible.Root>
            {/each}
          </div>
        </div>
      {:else}
        <div class="panel-body image-panel" role="region" aria-label="Image collection drop zone" ondragover={(event) => event.preventDefault()} ondrop={dropImages}>
          <p class="eyebrow">Project collection</p>
          {#if libraryTargetSlotId}<p class="library-target">Choose an image for the selected frame.</p>{/if}
          {#if assets.length}
            <ToggleGroup.Root class="asset-filters" type="single" value={assetFilter} onValueChange={(value) => { if (value) assetFilter = value as typeof assetFilter }} aria-label="Filter images"><ToggleGroup.Item value="all">All</ToggleGroup.Item><ToggleGroup.Item value="used">Used</ToggleGroup.Item><ToggleGroup.Item value="unused">Unused</ToggleGroup.Item><ToggleGroup.Item value="missing">Missing ({missingAssetIds.size})</ToggleGroup.Item></ToggleGroup.Root><div class="asset-tools"><input class="asset-search" aria-label="Search images" bind:value={assetQuery} placeholder="Search images" /><Select.Root type="single" value={assetSort} onValueChange={(value) => { if (value) assetSort = value as typeof assetSort }}><Select.Trigger class="asset-sort" aria-label="Sort images"><Select.Value placeholder="Sort images" /></Select.Trigger><Select.Content class="asset-sort-content"><Select.Item value="import">Import order</Select.Item><Select.Item value="name">Filename</Select.Item><Select.Item value="size">File size</Select.Item><Select.Item value="usage">Usage</Select.Item></Select.Content></Select.Root></div><p class="asset-total">{assets.length} images · {assets.reduce((total, asset) => total + asset.byteLength, 0).toLocaleString()} B</p><div class="asset-list">{#each filteredAssets as asset (asset.id)}<button draggable={!missingAssetIds.has(asset.id)} class:selected-asset={selectedAssetIds.includes(asset.id)} class="asset-row" ondragstart={(event) => startAssetDrag(event, asset.id)} onclick={(event) => selectAsset(asset.id, event.ctrlKey || event.metaKey)}>{#if assetRegistry.getObjectUrl(asset.id)}<img class="asset-thumb" src={assetRegistry.getObjectUrl(asset.id)} alt="" />{:else}<span class="asset-thumb">▧</span>{/if}<span><strong>{asset.originalName}</strong><small>{missingAssetIds.has(asset.id) ? 'Missing — relink required' : `${asset.width} × ${asset.height} · ${assetUsage(asset.id)} use${assetUsage(asset.id) === 1 ? '' : 's'}`}</small></span></button>{/each}</div>
            {#if selectedAssetId}<div class="asset-actions"><button class="button button-primary" disabled={!selectedSlotId || missingAssetIds.has(selectedAssetId)} onclick={() => { if (selectedSlotId) project.assignAsset(activePage.id, selectedSlotId, selectedAssetId!) }}>Assign to frame</button><button class="button" onclick={() => showUsage(selectedAssetId!)}>Show usage</button>{#if missingAssetIds.has(selectedAssetId)}<button class="button button-primary" onclick={() => relinkInput.click()}>Locate image</button>{:else}<button class="button" onclick={() => replaceInput.click()}>Replace original</button>{/if}<button class="text-button danger" onclick={() => requestRemoveAssets([selectedAssetId!])}>Remove from project</button></div>{/if}{#if selectedAssetIds.length > 1}<button class="text-button danger" onclick={() => requestRemoveAssets(selectedAssetIds)}>Remove selected ({selectedAssetIds.length})</button>{/if}<button class="text-button danger" onclick={() => { const unused = assets.filter((asset) => assetUsage(asset.id) === 0); if (unused.length) requestRemoveAssets(unused.map((asset) => asset.id)) }}>Remove all unused</button>
          {:else}
            <div class="empty-library"><div class="image-icon" aria-hidden="true">▧</div><p>Upload photos to use them across every page in this project.</p></div>
          {/if}
          <button class="button button-primary" onclick={() => uploadInput.click()}>Upload images</button>
          <button class="text-button" onclick={() => isImageManagerOpen = true}>Open image manager <span aria-hidden="true">→</span></button>
        </div>
      {/if}
    </aside>

    <section class="editor-column">
    <section class="canvas-area" aria-label="Canvas preview">
      <div class="pasteboard">
        <CanvasEditor page={activePage} assets={document.assets} {selectedSlotId} cropSlotId={cropModeSlotId} {viewportZoom} getImage={(assetId) => assetRegistry.getImage(assetId)} onselect={selectCanvasFrame} onrequestcrop={beginCrop} onexitcrop={() => { if (cropModeSlotId) finishCrop(); selectedSlotId = null }} onrequestimage={requestImageForSlot} onplacementchange={commitCropPan} onassetdrop={(assetId, slotId) => { project.assignAsset(activePage.id, slotId, assetId); libraryTargetSlotId = null }} onframeswap={(sourceSlotId, targetSlotId) => project.moveOrSwapSlots(activePage.id, sourceSlotId, targetSlotId)} onwheelzoom={(slotId, factor) => { const content = activePage.slots[slotId]; if (content) updateCropZoom(Math.min(8, Math.max(1, content.placement.zoom * factor))) }} onviewportzoom={(factor) => viewportZoom = Math.min(2, Math.max(0.5, viewportZoom * factor))} ondividerchange={(changes) => project.adjustDividers(activePage.id, changes)} />
      </div>
    </section>
    <footer class="pagebar" aria-label="Pages">
      <button class="icon-button" aria-label="Previous page" disabled={document.pages.findIndex((page) => page.id === activePageId) === 0} onclick={previousPage}>‹</button>
      {#if document.pages.length <= 4}{#each document.pages as page (page.id)}<button class:active={page.id === activePageId} class="page-tab" aria-current={page.id === activePageId ? 'page' : undefined} onclick={() => { activePageId = page.id; selectedSlotId = null }}>{page.name}</button>{/each}{:else}<Select.Root type="single" value={activePageId} onValueChange={(value) => { if (value) { activePageId = value; selectedSlotId = null } }}><Select.Trigger class="page-picker" aria-label="Choose page"><Select.Value /></Select.Trigger><Select.Content class="asset-sort-content">{#each document.pages as page (page.id)}<Select.Item value={page.id}>{page.name}</Select.Item>{/each}</Select.Content></Select.Root>{/if}
      <button class="add-page" onclick={addPage} aria-label="Add page">+</button>
      <button class="icon-button" aria-label="Next page" disabled={document.pages.findIndex((page) => page.id === activePageId) === document.pages.length - 1} onclick={nextPage}>›</button>
      <div class="page-actions"><button class="text-button" aria-haspopup="menu" aria-expanded={isPageMenuOpen} onclick={() => isPageMenuOpen = !isPageMenuOpen}>Page actions ▾</button>{#if isPageMenuOpen}<div class="page-actions-menu" role="menu"><button role="menuitem" onclick={() => { renameActivePage(); isPageMenuOpen = false }}>Rename</button><button role="menuitem" onclick={() => { project.duplicatePage(activePageId); isPageMenuOpen = false }}>Duplicate</button><button role="menuitem" disabled={document.pages.findIndex((page) => page.id === activePageId) === 0} onclick={() => { project.movePage(activePageId, -1); isPageMenuOpen = false }}>Move left</button><button role="menuitem" disabled={document.pages.findIndex((page) => page.id === activePageId) === document.pages.length - 1} onclick={() => { project.movePage(activePageId, 1); isPageMenuOpen = false }}>Move right</button><button role="menuitem" class="danger" onclick={() => { project.clearPage(activePageId); isPageMenuOpen = false }}>Clear page</button>{#if document.pages.length > 1}<button role="menuitem" class="danger" onclick={() => { project.deletePage(activePageId); activePageId = document.pages[0].id; isPageMenuOpen = false }}>Delete page</button>{/if}</div>{/if}</div>
    </footer>
    </section>

    <aside class="sidebar right-panel" aria-label="Properties">
      <div class="panel-heading"><p class="eyebrow">Properties{selectedSlotId ? ` · Frame ${Object.keys(activePage.slots).indexOf(selectedSlotId) + 1}` : ''}</p></div>
      <div class="property-groups">
      <Collapsible.Root class="property-group page-properties" open><div class="property-group-heading"><Collapsible.Trigger>Page setup <span aria-hidden="true">▾</span></Collapsible.Trigger></div><Collapsible.Content><div class="property-list">
        <div><span>Width</span><input aria-label="Page width" type="number" min="64" value={activePage.width} onchange={(event) => resizeActivePage('width', Number(event.currentTarget.value))} /></div>
        <div><span>Height</span><input aria-label="Page height" type="number" min="64" value={activePage.height} onchange={(event) => resizeActivePage('height', Number(event.currentTarget.value))} /></div>
        <div><span>Background</span><Popover.Root><Popover.Trigger class="color-trigger" aria-label="Choose background color"><i style={`background:${activePage.style.backgroundColor.slice(0, 7)}`}></i><span>{activePage.style.backgroundColor.slice(0, 7)}</span></Popover.Trigger><Popover.Content class="color-popover"><input aria-label="Background color" type="color" value={activePage.style.backgroundColor.slice(0, 7)} onchange={(event) => updateStyle({ backgroundColor: `${event.currentTarget.value.toUpperCase()}FF` })} /><div class="color-presets" aria-label="Background color presets">{#each colorPresets as color (color)}<button class:active={activePage.style.backgroundColor.slice(0, 7) === color} class="color-preset" aria-label={`Set background to ${color}`} title={color} style={`background:${color}`} onclick={() => updateStyle({ backgroundColor: `${color}FF` })}></button>{/each}</div></Popover.Content></Popover.Root></div>
      </div></Collapsible.Content></Collapsible.Root>
      <Collapsible.Root class="property-group appearance-properties" open><div class="property-group-heading"><Collapsible.Trigger>Frame appearance <span aria-hidden="true">▾</span></Collapsible.Trigger></div><Collapsible.Content><div class="property-list">
        <div><span>Outer margin</span><div class="inspector-slider"><Slider.Root class="inspector-slider-root" aria-label="Outer margin" type="single" min={0} max={120} step={1} value={activePage.style.padding} onValueChange={(padding) => updateStyle({ padding })}><Slider.Range class="inspector-slider-range" /><Slider.Thumb index={0} class="inspector-slider-thumb" /></Slider.Root><input class="slider-value" aria-label="Outer margin value" type="number" min="0" max="120" value={activePage.style.padding} onchange={(event) => updateStyle({ padding: Math.min(120, Math.max(0, Number(event.currentTarget.value))) })} /></div></div>
        <div><span>Inner spacing</span><div class="inspector-slider"><Slider.Root class="inspector-slider-root" aria-label="Inner spacing" type="single" min={0} max={120} step={1} value={activePage.style.gap} onValueChange={(gap) => updateStyle({ gap })}><Slider.Range class="inspector-slider-range" /><Slider.Thumb index={0} class="inspector-slider-thumb" /></Slider.Root><input class="slider-value" aria-label="Inner spacing value" type="number" min="0" max="120" value={activePage.style.gap} onchange={(event) => updateStyle({ gap: Math.min(120, Math.max(0, Number(event.currentTarget.value))) })} /></div></div>
        <div><span>Corner radius</span><div class="inspector-slider"><Slider.Root class="inspector-slider-root" aria-label="Corner radius" type="single" min={0} max={120} step={1} value={activePage.style.cornerRadius} onValueChange={(cornerRadius) => updateStyle({ cornerRadius })}><Slider.Range class="inspector-slider-range" /><Slider.Thumb index={0} class="inspector-slider-thumb" /></Slider.Root><input class="slider-value" aria-label="Corner radius value" type="number" min="0" max="120" value={activePage.style.cornerRadius} onchange={(event) => updateStyle({ cornerRadius: Math.min(120, Math.max(0, Number(event.currentTarget.value))) })} /></div></div>
        <div><span>Frame shadow</span><Switch.Root class="switch" aria-label="Frame shadow enabled" checked={activePage.style.shadow.enabled} onCheckedChange={(enabled) => updateStyle({ shadow: { ...activePage.style.shadow, enabled } })}><Switch.Thumb class="switch-thumb" /></Switch.Root></div>
        {#if activePage.style.shadow.enabled}
          <div><span>Shadow color</span><Popover.Root><Popover.Trigger class="color-trigger" aria-label="Choose frame shadow color"><i style={`background:${activePage.style.shadow.color}`}></i><span>{activePage.style.shadow.color}</span></Popover.Trigger><Popover.Content class="color-popover"><input aria-label="Frame shadow color" type="color" value={activePage.style.shadow.color} onchange={(event) => updateStyle({ shadow: { ...activePage.style.shadow, color: event.currentTarget.value.toUpperCase() } })} /><div class="color-presets" aria-label="Shadow color presets">{#each colorPresets as color (color)}<button class:active={activePage.style.shadow.color === color} class="color-preset" aria-label={`Set shadow to ${color}`} title={color} style={`background:${color}`} onclick={() => updateStyle({ shadow: { ...activePage.style.shadow, color } })}></button>{/each}</div></Popover.Content></Popover.Root></div>
          <div><span>Transparency</span><div class="inspector-slider"><Slider.Root class="inspector-slider-root" aria-label="Frame shadow transparency" type="single" min={0} max={100} step={1} value={Math.round(activePage.style.shadow.opacity * 100)} onValueChange={(value) => updateStyle({ shadow: { ...activePage.style.shadow, opacity: value / 100 } })}><Slider.Range class="inspector-slider-range" /><Slider.Thumb index={0} class="inspector-slider-thumb" /></Slider.Root><input class="slider-value" aria-label="Frame shadow transparency value" type="number" min="0" max="100" value={Math.round(activePage.style.shadow.opacity * 100)} onchange={(event) => updateStyle({ shadow: { ...activePage.style.shadow, opacity: Math.min(100, Math.max(0, Number(event.currentTarget.value))) / 100 } })} /></div></div>
          <div><span>Shadow blur</span><div class="inspector-slider"><Slider.Root class="inspector-slider-root" aria-label="Frame shadow blur" type="single" min={0} max={50} step={1} value={activePage.style.shadow.blur} onValueChange={(blur) => updateStyle({ shadow: { ...activePage.style.shadow, blur } })}><Slider.Range class="inspector-slider-range" /><Slider.Thumb index={0} class="inspector-slider-thumb" /></Slider.Root><input class="slider-value" aria-label="Frame shadow blur value" type="number" min="0" max="50" value={activePage.style.shadow.blur} onchange={(event) => updateStyle({ shadow: { ...activePage.style.shadow, blur: Math.min(50, Math.max(0, Number(event.currentTarget.value))) } })} /></div></div>
          <div><span>Shadow distance</span><div class="inspector-slider"><Slider.Root class="inspector-slider-root" aria-label="Frame shadow distance" type="single" min={0} max={50} step={1} value={shadowDistance()} onValueChange={(distance) => updateShadowPolar(distance)}><Slider.Range class="inspector-slider-range" /><Slider.Thumb index={0} class="inspector-slider-thumb" /></Slider.Root><input class="slider-value" aria-label="Frame shadow distance value" type="number" min="0" max="50" value={shadowDistance()} onchange={(event) => updateShadowPolar(Math.min(50, Math.max(0, Number(event.currentTarget.value))))} /></div></div>
          <div><span>Shadow angle</span><div class="inspector-slider"><Slider.Root class="inspector-slider-root" aria-label="Frame shadow angle" type="single" min={0} max={360} step={1} value={shadowAngle()} onValueChange={(angle) => updateShadowPolar(undefined, angle)}><Slider.Range class="inspector-slider-range" /><Slider.Thumb index={0} class="inspector-slider-thumb" /></Slider.Root><input class="slider-value" aria-label="Frame shadow angle value" type="number" min="0" max="360" value={shadowAngle()} onchange={(event) => updateShadowPolar(undefined, Math.min(360, Math.max(0, Number(event.currentTarget.value))))} /></div></div>
        {/if}
      </div></Collapsible.Content></Collapsible.Root>
      <div class="property-note"><span aria-hidden="true">✦</span><p>{selectedContent ? 'Click the image to focus it, then drag or use the precise crop controls.' : 'Select a frame on the canvas to inspect it.'}</p></div>
      {#if selectedSlotId && !selectedContent}
        <Collapsible.Root class="property-group selected-properties" open><div class="property-group-heading"><Collapsible.Trigger>Selected frame <span aria-hidden="true">▾</span></Collapsible.Trigger></div><Collapsible.Content><div class="frame-action"><button class="button button-primary" onclick={() => requestImageForSlot(selectedSlotId!)}>Add image</button></div></Collapsible.Content></Collapsible.Root>
      {:else if selectedSlotId && selectedContent}
        <Collapsible.Root class="property-group selected-properties" open><div class="property-group-heading"><Collapsible.Trigger>Image & crop <span aria-hidden="true">▾</span></Collapsible.Trigger></div><Collapsible.Content><div class="crop-controls">{#if cropModeSlotId === selectedSlotId}<p class="crop-hint">Crop mode is active. Drag the image, use the corner dots to zoom, or adjust values precisely. Escape cancels.</p>{:else}<button class="button" onclick={() => beginCrop(selectedSlotId!)}>Crop image</button><p class="crop-hint">Double-click the image, press Enter, or use Crop image to begin.</p>{/if}<div class="crop-zoom"><span>Zoom</span><div class="inspector-slider"><Slider.Root class="inspector-slider-root" aria-label="Crop zoom" type="single" min={1} max={8} step={0.05} value={cropZoom} onValueChange={updateCropZoom}><Slider.Range class="inspector-slider-range" /><Slider.Thumb index={0} class="inspector-slider-thumb" /></Slider.Root><input class="slider-value" aria-label="Crop zoom value" type="number" min="1" max="8" step="0.05" value={cropZoom.toFixed(2)} onchange={(event) => updateCropZoom(Math.min(8, Math.max(1, Number(event.currentTarget.value))))} /></div></div><div class="crop-coordinates"><label>X <input aria-label="Crop horizontal position" type="number" min="0" max="100" step="1" value={Math.round(selectedContent.placement.positionX * 100)} onchange={(event) => updateCropPosition('positionX', Number(event.currentTarget.value))} />%</label><label>Y <input aria-label="Crop vertical position" type="number" min="0" max="100" step="1" value={Math.round(selectedContent.placement.positionY * 100)} onchange={(event) => updateCropPosition('positionY', Number(event.currentTarget.value))} />%</label></div><div class="crop-actions"><button class="text-button" onclick={() => project.setSlotContent(activePage.id, selectedSlotId!, { ...selectedContent, placement: { zoom: 1, positionX: 0.5, positionY: 0.5 } })}>Reset crop</button>{#if cropModeSlotId === selectedSlotId}<button class="button button-primary" onclick={finishCrop}>Done</button>{/if}</div><div class="image-actions"><button class="button" onclick={() => { selectedAssetId = selectedContent!.assetId; replaceInput.click() }}>Replace original</button><button class="button" onclick={() => project.clearSlot(activePage.id, selectedSlotId!)}>Remove from frame</button><button class="text-button danger" onclick={() => requestRemoveAssets([selectedContent!.assetId])}>Remove from project</button></div></div></Collapsible.Content></Collapsible.Root>
      {/if}
      </div>
    </aside>
  </section>

  {#if isImageManagerOpen}
    <div class="dialog-backdrop">
      <dialog class="dialog image-manager-dialog" open aria-modal="true" aria-labelledby="image-manager-title">
        <div class="dialog-header"><div><p class="eyebrow">Project collection</p><h2 id="image-manager-title">Image Manager</h2></div><button class="icon-button" aria-label="Close image manager" onclick={() => isImageManagerOpen = false}>×</button></div>
        <div class="upload-well" role="region" aria-label="Upload images drop zone" ondragover={(event) => event.preventDefault()} ondrop={dropImages}><div class="upload-mark" aria-hidden="true">↑</div><strong>Drop PNG, JPEG, or WebP files here</strong><span>Original files remain local and are embedded in saved projects.</span><button class="button button-primary" onclick={() => uploadInput.click()}>Choose images</button></div>
        {#if assets.length}<div class="manager-content"><div class="manager-toolbar"><div class="asset-tools"><input class="asset-search" aria-label="Search project images" bind:value={assetQuery} placeholder="Search images" /><Select.Root type="single" value={assetSort} onValueChange={(value) => { if (value) assetSort = value as typeof assetSort }}><Select.Trigger class="asset-sort" aria-label="Sort project images"><Select.Value placeholder="Sort images" /></Select.Trigger><Select.Content class="asset-sort-content"><Select.Item value="import">Import order</Select.Item><Select.Item value="name">Filename</Select.Item><Select.Item value="size">File size</Select.Item><Select.Item value="usage">Usage</Select.Item></Select.Content></Select.Root></div><div class="manager-view"><ToggleGroup.Root type="single" value={imageManagerView} onValueChange={(value) => { if (value) imageManagerView = value as typeof imageManagerView }} aria-label="Image manager view"><ToggleGroup.Item value="grid" aria-label="Grid view">▦</ToggleGroup.Item><ToggleGroup.Item value="list" aria-label="List view">☷</ToggleGroup.Item></ToggleGroup.Root></div><ToggleGroup.Root class="asset-filters" type="single" value={assetFilter} onValueChange={(value) => { if (value) assetFilter = value as typeof assetFilter }} aria-label="Filter project images"><ToggleGroup.Item value="all">All</ToggleGroup.Item><ToggleGroup.Item value="used">Used</ToggleGroup.Item><ToggleGroup.Item value="unused">Unused</ToggleGroup.Item><ToggleGroup.Item value="missing">Missing ({missingAssetIds.size})</ToggleGroup.Item></ToggleGroup.Root></div><div class="asset-list manager-asset-list" class:manager-list-view={imageManagerView === 'list'}>{#each filteredAssets as asset (asset.id)}<div class:selected-asset={selectedAssetIds.includes(asset.id)} class="manager-asset-card"><button draggable={!missingAssetIds.has(asset.id)} class="asset-row" ondragstart={(event) => startAssetDrag(event, asset.id)} onclick={(event) => selectAsset(asset.id, event.ctrlKey || event.metaKey)}>{#if assetRegistry.getObjectUrl(asset.id)}<img class="asset-thumb" src={assetRegistry.getObjectUrl(asset.id)} alt="" />{:else}<span class="asset-thumb">▧</span>{/if}<span><strong>{asset.originalName}</strong><small>{missingAssetIds.has(asset.id) ? 'Missing — relink required' : `${asset.width} × ${asset.height} · ${formatBytes(asset.byteLength)} · ${assetUsage(asset.id)} use${assetUsage(asset.id) === 1 ? '' : 's'} · Ready`}</small></span></button><DropdownMenu.Root><DropdownMenu.Trigger class="asset-overflow" aria-label={`Actions for ${asset.originalName}`}>•••</DropdownMenu.Trigger><DropdownMenu.Content class="asset-menu"><DropdownMenu.Item onclick={() => showUsage(asset.id)}>Show usages</DropdownMenu.Item>{#if missingAssetIds.has(asset.id)}<DropdownMenu.Item onclick={() => { selectedAssetId = asset.id; relinkInput.click() }}>Locate image</DropdownMenu.Item>{:else}<DropdownMenu.Item onclick={() => { selectedAssetId = asset.id; replaceInput.click() }}>Replace original</DropdownMenu.Item>{/if}<DropdownMenu.Item onclick={() => requestRemoveAssets([asset.id])}>Remove from project</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Root></div>{/each}</div>{#if !filteredAssets.length}<p class="empty-filter">No images match this view.</p>{/if}<div class="manager-bulk-actions">{#if selectedAssetIds.length > 1}<button class="button" onclick={() => requestRemoveAssets(selectedAssetIds)}>Remove selected ({selectedAssetIds.length})</button>{/if}<button class="text-button danger" onclick={() => { const unused = assets.filter((asset) => assetUsage(asset.id) === 0); if (unused.length) requestRemoveAssets(unused.map((asset) => asset.id)) }}>Remove all unused</button></div></div>{/if}
        <div class="dialog-footer"><span>{Object.keys(document.assets).length} images · {Object.values(document.assets).reduce((total, asset) => total + asset.byteLength, 0).toLocaleString()} B embedded</span><button class="button" onclick={() => isImageManagerOpen = false}>Done</button></div>
      </dialog>
    </div>
  {/if}

  {#if pendingRemovalAssetIds?.length}<div class="dialog-backdrop"><dialog class="dialog" open aria-modal="true" aria-labelledby="remove-images-title"><div class="dialog-header"><div><p class="eyebrow">Project collection</p><h2 id="remove-images-title">Remove {pendingRemovalAssetIds.length} image{pendingRemovalAssetIds.length === 1 ? '' : 's'}?</h2></div><button class="icon-button" aria-label="Cancel removal" onclick={() => pendingRemovalAssetIds = null}>×</button></div><div class="export-form"><p>This clears <strong>{pendingRemovalAssetIds.reduce((total, assetId) => total + assetUsage(assetId), 0)}</strong> frame placement{pendingRemovalAssetIds.reduce((total, assetId) => total + assetUsage(assetId), 0) === 1 ? '' : 's'} and frees <strong>{formatBytes(pendingRemovalAssetIds.reduce((total, assetId) => total + (document.assets[assetId]?.byteLength ?? 0), 0))}</strong> from the next saved project.</p><p>You can undo this while the project remains open.</p></div><div class="dialog-footer"><button class="button" onclick={() => pendingRemovalAssetIds = null}>Cancel</button><button class="button danger" onclick={() => removeAssets(pendingRemovalAssetIds!)}>Remove images</button></div></dialog></div>{/if}

  {#if usageAssetId}<div class="dialog-backdrop"><dialog class="dialog" open aria-labelledby="usage-title"><div class="dialog-header"><div><p class="eyebrow">Image placements</p><h2 id="usage-title">Used in {assetUsages.length} frame{assetUsages.length === 1 ? '' : 's'}</h2></div><button class="icon-button" aria-label="Close image usages" onclick={() => usageAssetId = null}>×</button></div><div class="usage-list">{#if assetUsages.length}{#each assetUsages as usage (`${usage.pageId}-${usage.slotId}`)}<button onclick={() => jumpToUsage(usage.pageId, usage.slotId)}><strong>{usage.pageName}</strong><span>Frame {usage.frameNumber}</span><span aria-hidden="true">→</span></button>{/each}{:else}<p>This image is not used on any page.</p>{/if}</div><div class="dialog-footer"><button class="button" onclick={() => usageAssetId = null}>Done</button></div></dialog></div>{/if}

  {#if pendingNavigation}<div class="dialog-backdrop"><dialog class="dialog" open aria-modal="true" aria-labelledby="unsaved-title"><div class="dialog-header"><div><p class="eyebrow">Unsaved changes</p><h2 id="unsaved-title">Save before continuing?</h2></div><button class="icon-button" aria-label="Cancel" onclick={() => pendingNavigation = null}>×</button></div><div class="export-form"><p>Your current project has changes that have not been saved.</p></div><div class="dialog-footer"><button class="button" onclick={() => pendingNavigation = null}>Cancel</button><span><button class="button danger" onclick={continueNavigation}>Discard</button><button class="button button-primary" onclick={saveThenContinue}>Save</button></span></div></dialog></div>{/if}

  {#if isExportOpen}<div class="dialog-backdrop"><dialog class="dialog" open aria-labelledby="export-title"><div class="dialog-header"><div><p class="eyebrow">PNG export</p><h2 id="export-title">Export pages</h2></div><button class="icon-button" aria-label="Close export dialog" disabled={isExporting} onclick={() => isExportOpen = false}>×</button></div><div class="export-form"><label>Scope <select bind:value={exportScope} disabled={isExporting}><option value="current">Current page</option><option value="all">All pages</option><option value="range">Page range</option></select></label>{#if exportScope === 'range'}<label>Range <input bind:value={exportRange} placeholder="1-3" disabled={isExporting} /></label>{/if}<label>Width (px) <input type="number" min="1" max="8192" bind:value={exportWidth} disabled={isExporting} /></label><p>Height: {Math.round(exportWidth * activePage.height / activePage.width)} px</p>{#if exportProgress}<p aria-live="polite">{exportProgress}</p>{/if}</div><div class="dialog-footer"><span>{exportScope === 'all' ? `${document.pages.length} PNGs in a ZIP` : 'PNG download'}</span><button class="button button-primary" disabled={isExporting} onclick={exportPages}>{isExporting ? 'Exporting…' : 'Export'}</button></div></dialog></div>{/if}

  {#if toast}
    <div class="toast" role="status">{toast}</div>
  {/if}
</main>
