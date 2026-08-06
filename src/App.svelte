<script lang="ts">
  import { createProject } from './lib/domain/factories'
  import { resolveLayout } from './lib/domain/geometry'
  import type { PageV1 } from './lib/domain/types'
  import { layoutCatalog } from './lib/layouts/catalog'
  import { ProjectStore } from './lib/state/projectStore'

  type SidebarTab = 'layouts' | 'images'

  const project = new ProjectStore(createProject())
  let document = project.snapshot()
  let activePageId = document.pages[0].id
  let activePage: PageV1 = document.pages[0]
  project.document.subscribe((value) => (document = value))

  let activeTab: SidebarTab = 'layouts'
  let isImageManagerOpen = false
  let toast = ''
  let projectTitle = document.title

  $: activePage = document.pages.find((page) => page.id === activePageId) ?? document.pages[0]
  $: frames = resolveLayout(activePage)

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
</script>

<svelte:head>
  <title>{projectTitle} — Collage Builder</title>
  <meta name="description" content="A local-first collage editor." />
</svelte:head>

<main class="app-shell">
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
          <p class="eyebrow">{activePage.layout.presetId === 'feature-right' ? '3 photos' : `${frames.length} photos`}</p>
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
            <button class="button button-primary" onclick={() => isImageManagerOpen = true}>Upload images</button>
          </div>
          <button class="text-button" onclick={() => isImageManagerOpen = true}>Open image manager <span aria-hidden="true">→</span></button>
        </div>
      {/if}
    </aside>

    <section class="canvas-area" aria-label="Canvas preview">
      <div class="canvas-toolbar"><span>Fit</span><button class="zoom-control" aria-label="Zoom out" disabled>−</button><span>76%</span><button class="zoom-control" aria-label="Zoom in" disabled>+</button></div>
      <div class="pasteboard">
        <div class="page-preview" aria-label={`Blank ${frames.length}-frame collage page`} style={`background:${activePage.style.backgroundColor}`}>
          {#each frames as frame (frame.slotId)}
            <button class="frame resolved-frame" style={`left:${frame.x / activePage.width * 100}%;top:${frame.y / activePage.height * 100}%;width:${frame.width / activePage.width * 100}%;height:${frame.height / activePage.height * 100}%;border-radius:${activePage.style.cornerRadius}px`} onclick={() => announce('Image assignment is the next canvas milestone.')}><span>Empty frame</span></button>
          {/each}
        </div>
      </div>
    </section>

    <aside class="sidebar right-panel" aria-label="Properties">
      <div class="panel-heading"><p class="eyebrow">Page</p><h2>Properties</h2></div>
      <div class="property-list">
        <div><span>Dimensions</span><strong>{activePage.width} × {activePage.height} px</strong></div>
        <div><span>Background</span><button class="color-swatch" aria-label="Change background color"><i style={`background:${activePage.style.backgroundColor}`}></i>{activePage.style.backgroundColor}</button></div>
        <div><span>Outer padding</span><strong>{activePage.style.padding} px</strong></div>
        <div><span>Frame gap</span><strong>{activePage.style.gap} px</strong></div>
        <div><span>Corner radius</span><strong>{activePage.style.cornerRadius} px</strong></div>
      </div>
      <div class="property-note"><span aria-hidden="true">✦</span><p>Style controls become editable after the document model is in place.</p></div>
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
        <div class="upload-well"><div class="upload-mark" aria-hidden="true">↑</div><strong>Drop PNG, JPEG, or WebP files here</strong><span>Original files remain local and will be embedded when project saving is added.</span><button class="button button-primary" onclick={() => announce('File import is planned for Phase 3.')}>Choose images</button></div>
        <div class="dialog-footer"><span>0 images · 0 B embedded</span><button class="button" onclick={() => isImageManagerOpen = false}>Done</button></div>
      </dialog>
    </div>
  {/if}

  {#if toast}
    <div class="toast" role="status">{toast}</div>
  {/if}
</main>
