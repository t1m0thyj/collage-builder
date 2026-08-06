<script lang="ts">
  import { createProject } from './lib/domain/factories'
  import type { PageV1 } from './lib/domain/types'
  import CanvasEditor from './lib/components/editor/CanvasEditor.svelte'
  import { validateImportedImage } from './lib/domain/importImage'
  import { layoutCatalog } from './lib/layouts/catalog'
  import { ProjectStore } from './lib/state/projectStore'
  import { AssetRegistry } from './lib/render/assetRegistry'

  type SidebarTab = 'layouts' | 'images'

  const project = new ProjectStore(createProject())
  const assetRegistry = new AssetRegistry()
  let document = project.snapshot()
  let activePageId = document.pages[0].id
  let activePage: PageV1 = document.pages[0]
  let selectedSlotId: string | null = null
  let uploadInput: HTMLInputElement
  let cropZoom = 1
  project.document.subscribe((value) => (document = value))

  let activeTab: SidebarTab = 'layouts'
  let isImageManagerOpen = false
  let toast = ''
  let projectTitle = document.title

  $: activePage = document.pages.find((page) => page.id === activePageId) ?? document.pages[0]
  $: frameCount = Object.keys(activePage.slots).length
  $: selectedContent = selectedSlotId ? activePage.slots[selectedSlotId] : null
  $: if (selectedContent) cropZoom = selectedContent.placement.zoom

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
  <header class="topbar" aria-label="Project controls">
    <div class="toolbar-group">
      <button class="button button-primary" onclick={() => announce('New-project flow will replace this starter document in Phase 4.')}>New</button>
      <button class="button" onclick={() => announce('Open will be added with project archives in Phase 5.')}>Open</button>
      <button class="button" onclick={() => announce('Saved locally is coming with autosave in Phase 5.')}>Save</button>
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
          <div class="empty-library">
            <div class="image-icon" aria-hidden="true">▧</div>
            <p>Upload photos to use them across every page in this project.</p>
            <button class="button button-primary" onclick={() => uploadInput.click()}>Upload images</button>
          </div>
          <button class="text-button" onclick={() => isImageManagerOpen = true}>Open image manager <span aria-hidden="true">→</span></button>
        </div>
      {/if}
    </aside>

    <section class="canvas-area" aria-label="Canvas preview">
      <div class="canvas-toolbar"><span>Fit</span><button class="zoom-control" aria-label="Zoom out" disabled>−</button><span>76%</span><button class="zoom-control" aria-label="Zoom in" disabled>+</button></div>
      <div class="pasteboard">
        <CanvasEditor page={activePage} assets={document.assets} {selectedSlotId} getImage={(assetId) => assetRegistry.getImage(assetId)} onselect={(slotId) => selectedSlotId = slotId} onrequestimage={requestImageForSlot} />
      </div>
    </section>

    <aside class="sidebar right-panel" aria-label="Properties">
      <div class="panel-heading"><p class="eyebrow">{selectedSlotId ? 'Frame' : 'Page'}</p><h2>{selectedSlotId ? `Frame ${Object.keys(activePage.slots).indexOf(selectedSlotId) + 1}` : 'Properties'}</h2></div>
      <div class="property-list">
        <div><span>Dimensions</span><strong>{activePage.width} × {activePage.height} px</strong></div>
        <div><span>Background</span><button class="color-swatch" aria-label="Change background color"><i style={`background:${activePage.style.backgroundColor}`}></i>{activePage.style.backgroundColor}</button></div>
        <div><span>Outer padding</span><strong>{activePage.style.padding} px</strong></div>
        <div><span>Frame gap</span><strong>{activePage.style.gap} px</strong></div>
        <div><span>Corner radius</span><strong>{activePage.style.cornerRadius} px</strong></div>
      </div>
      <div class="property-note"><span aria-hidden="true">✦</span><p>{selectedSlotId ? 'Image assignment and crop controls arrive in Phase 3.' : 'Select a frame on the canvas to inspect it.'}</p></div>
      {#if selectedSlotId && !selectedContent}
        <div class="frame-action"><button class="button button-primary" onclick={() => requestImageForSlot(selectedSlotId!)}>Add image</button></div>
      {:else if selectedSlotId && selectedContent}
        <div class="crop-controls"><p class="eyebrow">Crop</p><label>Zoom <input type="range" min="1" max="8" step="0.05" bind:value={cropZoom} oninput={() => updateCropZoom(cropZoom)} /></label><span>{cropZoom.toFixed(2)}×</span><button class="text-button" onclick={() => project.setSlotContent(activePage.id, selectedSlotId!, { ...selectedContent, placement: { zoom: 1, positionX: 0.5, positionY: 0.5 } })}>Reset crop</button></div>
      {/if}
    </aside>
  </section>

  <footer class="pagebar" aria-label="Pages">
    <button class="icon-button" aria-label="Previous page" disabled>‹</button>
    <button class="page-tab active" aria-current="page">{activePage.name}</button>
    <button class="add-page" onclick={() => announce('Multiple pages will be added in Phase 4.')} aria-label="Add page">+</button>
    <div class="page-actions"><button class="text-button" onclick={() => announce('Page actions will arrive in Phase 4.')}>Duplicate</button><button class="text-button" onclick={() => announce('Page actions will arrive in Phase 4.')}>Reorder</button><button class="text-button danger" onclick={() => announce('The last page cannot be deleted.')}>Delete</button></div>
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
