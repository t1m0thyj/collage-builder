<script lang="ts">
  import { createProject } from './lib/domain/factories'
  import type { PageV1 } from './lib/domain/types'
  import CanvasEditor from './lib/components/editor/CanvasEditor.svelte'
  import { validateImportedImage } from './lib/domain/importImage'
  import { layoutCatalog } from './lib/layouts/catalog'
  import { ProjectStore } from './lib/state/projectStore'
  import { AssetRegistry } from './lib/render/assetRegistry'
  import { onMount } from 'svelte'
  import { createArchive, openArchive } from './lib/persistence/archive'
  import { loadLatestRecovery, loadRecoveryAssets, saveRecovery } from './lib/persistence/autosave'

  type SidebarTab = 'layouts' | 'images'

  const project = new ProjectStore(createProject())
  const assetRegistry = new AssetRegistry()
  let document = project.snapshot()
  let activePageId = document.pages[0].id
  let activePage: PageV1 = document.pages[0]
  let selectedSlotId: string | null = null
  let uploadInput: HTMLInputElement
  let cropZoom = 1
  let cropModeSlotId: string | null = null
  let selectedAssetId: string | null = null
  let replaceInput: HTMLInputElement
  let openInput: HTMLInputElement
  let assetFilter: 'all' | 'used' | 'unused' = 'all'
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined
  project.document.subscribe((value) => { document = value; if (autosaveTimer) clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => saveRecovery(value, assetRegistry).catch(() => announce('Local recovery save failed.')), 1000) })

  onMount(async () => {
    const recovery = await loadLatestRecovery().catch(() => undefined)
    if (!recovery || recovery.projectId === document.projectId || !globalThis.confirm(`Restore local recovery “${recovery.title}”?`)) return
    const blobs = await loadRecoveryAssets(recovery)
    assetRegistry.clear(); for (const [assetId, blob] of blobs) await assetRegistry.register(assetId, blob)
    project.replaceDocument(recovery); activePageId = recovery.pages[0].id; projectTitle = recovery.title; announce('Local recovery restored.')
  })

  let activeTab: SidebarTab = 'layouts'
  let isImageManagerOpen = false
  let toast = ''
  let projectTitle = document.title

  $: activePage = document.pages.find((page) => page.id === activePageId) ?? document.pages[0]
  $: frameCount = Object.keys(activePage.slots).length
  $: selectedContent = selectedSlotId ? activePage.slots[selectedSlotId] : null
  $: if (selectedContent) cropZoom = selectedContent.placement.zoom
  $: assets = Object.values(document.assets)
  $: filteredAssets = assets.filter((asset) => assetFilter === 'all' || (assetFilter === 'used' ? assetUsage(asset.id) > 0 : assetUsage(asset.id) === 0))

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

  function renameProject() {
    project.renameProject(projectTitle)
    projectTitle = document.title
  }

  function requestImageForSlot(slotId: string) {
    selectedSlotId = slotId
    uploadInput.click()
  }

  function updateCropZoom(zoom: number) {
    if (!selectedSlotId || !selectedContent) return
    project.setSlotContent(activePage.id, selectedSlotId, { ...selectedContent, placement: { ...selectedContent.placement, zoom } })
  }

  function updateCropPosition(axis: 'positionX' | 'positionY', percent: number) {
    if (!selectedSlotId || !selectedContent) return
    project.setSlotContent(activePage.id, selectedSlotId, { ...selectedContent, placement: { ...selectedContent.placement, [axis]: Math.min(1, Math.max(0, percent / 100)) } })
  }

  function commitCropPan(slotId: string, placement: NonNullable<typeof selectedContent>['placement']) {
    const content = activePage.slots[slotId]
    if (content) project.setSlotContent(activePage.id, slotId, { ...content, placement })
  }

  function updateStyle(patch: Partial<PageV1['style']>) { project.setPageStyle(activePage.id, patch) }

  function addPage() { project.addPage(); activePageId = document.pages[document.pages.length - 1].id }
  function assetUsage(assetId: string) { return document.pages.flatMap((page) => Object.values(page.slots)).filter((content) => content?.assetId === assetId).length }
  async function saveProject() { try { const archive = await createArchive(document, { get: (assetId) => assetRegistry.getBlob(assetId) }); const link = globalThis.document.createElement('a'); link.href = URL.createObjectURL(archive); link.download = `${projectTitle || 'collage'}.collage`; link.click(); URL.revokeObjectURL(link.href); announce('Project archive downloaded.') } catch (error) { announce(error instanceof Error ? error.message : 'Unable to save project') } }
  async function openProject(file: File | undefined) { if (!file) return; try { const opened = await openArchive(file); assetRegistry.clear(); for (const [assetId, blob] of opened.assets) await assetRegistry.register(assetId, blob); project.replaceDocument(opened.document); activePageId = opened.document.pages[0].id; selectedSlotId = null; projectTitle = opened.document.title; announce('Project opened.') } catch (error) { announce(error instanceof Error ? error.message : 'Unable to open project') } finally { openInput.value = '' } }
  async function replaceSelected(file: File | undefined) { if (!file || !selectedAssetId) return; try { const { asset } = await validateImportedImage(file); const target = selectedAssetId; await assetRegistry.register(target, file); project.replaceAsset(target, { ...asset, id: target, storage: { kind: 'embedded', archivePath: asset.storage.kind === 'embedded' ? asset.storage.archivePath.replace(asset.id, target) : asset.storage.displayHint } }); announce('Original image replaced everywhere it is used.') } catch (error) { announce(error instanceof Error ? error.message : 'Unable to replace image') } finally { replaceInput.value = '' } }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return
    let added = 0
    for (const file of files) {
      try {
        const { asset } = await validateImportedImage(file)
        await assetRegistry.register(asset.id, file)
        try { project.addAsset(asset) } catch (error) { assetRegistry.release(asset.id); throw error }
        const targetSlot = selectedSlotId ?? Object.entries(activePage.slots).find(([, content]) => content === null)?.[0]
        if (targetSlot) project.assignAsset(activePage.id, targetSlot, asset.id)
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
  <input class="sr-only" bind:this={openInput} type="file" accept=".collage,application/vnd.collage-builder+zip" onchange={(event) => openProject(event.currentTarget.files?.[0])} />
  <header class="topbar" aria-label="Project controls">
    <div class="toolbar-group">
      <button class="button button-primary" onclick={() => announce('New-project flow will replace this starter document in Phase 4.')}>New</button>
      <button class="button" onclick={() => openInput.click()}>Open</button>
      <button class="button" onclick={saveProject}>Save</button>
    </div>
    <div class="toolbar-group history-controls" aria-label="History">
      <button class="icon-button" aria-label="Undo" title="Undo" disabled={!project.canUndo} onclick={() => project.undo()}>↶</button>
      <button class="icon-button" aria-label="Redo" title="Redo" disabled={!project.canRedo} onclick={() => project.redo()}>↷</button>
    </div>
    <label class="project-title">
      <span class="sr-only">Project title</span>
      <input bind:value={projectTitle} aria-label="Project title" onblur={renameProject} />
    </label>
    <div class="toolbar-group topbar-end">
      <span class="save-status"><span class="status-dot"></span> Local draft</span>
      <button class="button button-primary" onclick={() => announce('PNG export will arrive after the canvas editor.')}>Export PNG</button>
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
          <p class="eyebrow">{frameCount} photos</p>
          <h2>Choose a layout</h2>
          <p class="panel-copy">Pick a preset to start composing your page.</p>
          <div class="layout-list">
            {#each layoutCatalog as layout (layout.id)}
              <button class:selected={layout.id === activePage.layout.presetId} class="layout-card" onclick={() => selectLayout(layout.id)}>
                <span class="layout-preview" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
                <span>{layout.name}</span>
                <small>{layout.frameCount} frame{layout.frameCount === 1 ? '' : 's'}</small>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="panel-body image-panel">
          <p class="eyebrow">Project collection</p>
          <h2>Your images</h2>
          {#if assets.length}
            <div class="asset-filters"><button class:active={assetFilter === 'all'} onclick={() => assetFilter = 'all'}>All</button><button class:active={assetFilter === 'used'} onclick={() => assetFilter = 'used'}>Used</button><button class:active={assetFilter === 'unused'} onclick={() => assetFilter = 'unused'}>Unused</button></div><div class="asset-list">{#each filteredAssets as asset (asset.id)}<button class:selected-asset={selectedAssetId === asset.id} class="asset-row" onclick={() => selectedAssetId = asset.id}><span class="asset-thumb">▧</span><span><strong>{asset.originalName}</strong><small>{asset.width} × {asset.height} · {assetUsage(asset.id)} use{assetUsage(asset.id) === 1 ? '' : 's'}</small></span></button>{/each}</div>
            {#if selectedAssetId}<div class="asset-actions"><button class="button button-primary" disabled={!selectedSlotId} onclick={() => { if (selectedSlotId) project.assignAsset(activePage.id, selectedSlotId, selectedAssetId!) }}>Assign to frame</button><button class="button" onclick={() => replaceInput.click()}>Replace original</button><button class="text-button danger" onclick={() => { project.removeAsset(selectedAssetId!); assetRegistry.release(selectedAssetId!); selectedAssetId = null }}>Remove from project</button></div>{/if}<button class="text-button danger" onclick={() => { const unused = assets.filter((asset) => assetUsage(asset.id) === 0); unused.forEach((asset) => assetRegistry.release(asset.id)); project.removeUnusedAssets(); selectedAssetId = null }}>Remove all unused</button>
          {:else}
            <div class="empty-library"><div class="image-icon" aria-hidden="true">▧</div><p>Upload photos to use them across every page in this project.</p></div>
          {/if}
          <button class="button button-primary" onclick={() => uploadInput.click()}>Upload images</button>
          <button class="text-button" onclick={() => isImageManagerOpen = true}>Open image manager <span aria-hidden="true">→</span></button>
        </div>
      {/if}
    </aside>

    <section class="canvas-area" aria-label="Canvas preview">
      <div class="canvas-toolbar"><span>Fit</span><button class="zoom-control" aria-label="Zoom out" disabled>−</button><span>76%</span><button class="zoom-control" aria-label="Zoom in" disabled>+</button></div>
      <div class="pasteboard">
        <CanvasEditor page={activePage} assets={document.assets} {selectedSlotId} cropSlotId={cropModeSlotId} getImage={(assetId) => assetRegistry.getImage(assetId)} onselect={(slotId) => { if (selectedAssetId) project.assignAsset(activePage.id, slotId, selectedAssetId); selectedSlotId = slotId; cropModeSlotId = null }} onrequestimage={requestImageForSlot} onplacementchange={commitCropPan} onmoveslot={(sourceSlotId, targetSlotId) => project.moveOrSwapSlots(activePage.id, sourceSlotId, targetSlotId)} />
      </div>
    </section>

    <aside class="sidebar right-panel" aria-label="Properties">
      <div class="panel-heading"><p class="eyebrow">{selectedSlotId ? 'Frame' : 'Page'}</p><h2>{selectedSlotId ? `Frame ${Object.keys(activePage.slots).indexOf(selectedSlotId) + 1}` : 'Properties'}</h2></div>
      <div class="property-list">
        <div><span>Dimensions</span><strong>{activePage.width} × {activePage.height} px</strong></div>
        <div><span>Background</span><input aria-label="Background color" type="color" value={activePage.style.backgroundColor.slice(0, 7)} onchange={(event) => updateStyle({ backgroundColor: `${event.currentTarget.value.toUpperCase()}FF` })} /></div>
        <div><span>Outer padding</span><input aria-label="Outer padding" type="number" min="0" value={activePage.style.padding} onchange={(event) => updateStyle({ padding: Number(event.currentTarget.value) })} /></div>
        <div><span>Frame gap</span><input aria-label="Frame gap" type="number" min="0" value={activePage.style.gap} onchange={(event) => updateStyle({ gap: Number(event.currentTarget.value) })} /></div>
        <div><span>Corner radius</span><input aria-label="Corner radius" type="number" min="0" value={activePage.style.cornerRadius} onchange={(event) => updateStyle({ cornerRadius: Number(event.currentTarget.value) })} /></div>
        <div><span>Frame shadow</span><input aria-label="Frame shadow enabled" type="checkbox" checked={activePage.style.shadow.enabled} onchange={(event) => updateStyle({ shadow: { ...activePage.style.shadow, enabled: event.currentTarget.checked } })} /></div>
      </div>
      <div class="property-note"><span aria-hidden="true">✦</span><p>{selectedSlotId ? 'Image assignment and crop controls arrive in Phase 3.' : 'Select a frame on the canvas to inspect it.'}</p></div>
      {#if selectedSlotId && !selectedContent}
        <div class="frame-action"><button class="button button-primary" onclick={() => requestImageForSlot(selectedSlotId!)}>Add image</button></div>
      {:else if selectedSlotId && selectedContent}
        <div class="crop-controls"><p class="eyebrow">Crop</p><button class:active-crop={cropModeSlotId === selectedSlotId} class="button" onclick={() => cropModeSlotId = cropModeSlotId === selectedSlotId ? null : selectedSlotId}>{cropModeSlotId === selectedSlotId ? 'Done cropping' : 'Crop image'}</button><p class="crop-hint">{cropModeSlotId === selectedSlotId ? 'Drag the image directly in its frame.' : 'Use precise controls or enter Crop mode to drag.'}</p><label>Zoom <input type="range" min="1" max="8" step="0.05" bind:value={cropZoom} oninput={() => updateCropZoom(cropZoom)} /></label><span>{cropZoom.toFixed(2)}×</span><div class="crop-coordinates"><label>X <input aria-label="Crop horizontal position" type="number" min="0" max="100" step="1" value={Math.round(selectedContent.placement.positionX * 100)} onchange={(event) => updateCropPosition('positionX', Number(event.currentTarget.value))} />%</label><label>Y <input aria-label="Crop vertical position" type="number" min="0" max="100" step="1" value={Math.round(selectedContent.placement.positionY * 100)} onchange={(event) => updateCropPosition('positionY', Number(event.currentTarget.value))} />%</label></div><button class="text-button" onclick={() => project.setSlotContent(activePage.id, selectedSlotId!, { ...selectedContent, placement: { zoom: 1, positionX: 0.5, positionY: 0.5 } })}>Reset crop</button></div>
      {/if}
    </aside>
  </section>

  <footer class="pagebar" aria-label="Pages">
    <button class="icon-button" aria-label="Previous page" disabled>‹</button>
    {#each document.pages as page (page.id)}<button class:active={page.id === activePageId} class="page-tab" aria-current={page.id === activePageId ? 'page' : undefined} onclick={() => { activePageId = page.id; selectedSlotId = null }}>{page.name}</button>{/each}
    <button class="add-page" onclick={addPage} aria-label="Add page">+</button>
    <div class="page-actions"><button class="text-button" onclick={() => project.duplicatePage(activePageId)}>Duplicate</button><button class="text-button" onclick={() => project.movePage(activePageId, -1)}>Move left</button><button class="text-button" onclick={() => project.movePage(activePageId, 1)}>Move right</button><button class="text-button danger" disabled={document.pages.length === 1} onclick={() => { project.deletePage(activePageId); activePageId = document.pages[0].id }}>Delete</button></div>
  </footer>

  {#if isImageManagerOpen}
    <div class="dialog-backdrop">
      <dialog class="dialog" open aria-labelledby="image-manager-title">
        <div class="dialog-header"><div><p class="eyebrow">Project collection</p><h2 id="image-manager-title">Image Manager</h2></div><button class="icon-button" aria-label="Close image manager" onclick={() => isImageManagerOpen = false}>×</button></div>
        <div class="upload-well"><div class="upload-mark" aria-hidden="true">↑</div><strong>Drop PNG, JPEG, or WebP files here</strong><span>Original files remain local and will be embedded when project saving is added.</span><button class="button button-primary" onclick={() => uploadInput.click()}>Choose images</button></div>
        <div class="dialog-footer"><span>{Object.keys(document.assets).length} images · {Object.values(document.assets).reduce((total, asset) => total + asset.byteLength, 0).toLocaleString()} B embedded</span><button class="button" onclick={() => isImageManagerOpen = false}>Done</button></div>
      </dialog>
    </div>
  {/if}

  {#if toast}
    <div class="toast" role="status">{toast}</div>
  {/if}
</main>
