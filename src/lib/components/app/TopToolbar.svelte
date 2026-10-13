<script lang="ts">
  import { tick } from 'svelte'
  import {
    ChevronDown,
    CircleHelp,
    CodeXml,
    FileImage,
    Files,
    HardDriveDownload,
    Minus,
    Menu,
    Plus,
    Redo2,
    RefreshCw,
    Undo2,
  } from '@lucide/svelte'
  import Button from '../ui/button/button.svelte'
  import Input from '../ui/input/input.svelte'
  import * as DropdownMenu from '../ui/dropdown-menu'
  import type { RecoveryState } from '../../app/recovery'
  import type { DeploymentState } from '../../app/deployment'

  export let projectTitle: string
  export let canUndo: boolean
  export let canRedo: boolean
  export let viewportZoom: number
  export let fittedViewportZoom: number
  export let isViewportFit: boolean
  export let isDirty: boolean
  export let hasSavedProject: boolean
  export let recoveredOnly: boolean
  export let recoveryState: RecoveryState
  export let operationProgress: string | null
  export let deployment: DeploymentState
  export let onnew: () => void
  export let onopen: () => void
  export let onsave: () => void
  export let onsaveas: () => void
  export let onundo: () => void
  export let onredo: () => void
  export let onzoomstep: (delta: number) => void
  export let onsetzoom: (zoom: number) => void
  export let onrename: () => void
  export let onexport: (scope: 'current' | 'all' | 'range') => void
  export let onmanagerecovery: () => void
  export let onshowquickstart: () => void
  export let onapplyupdate: () => void
  export let compactSidebar = false
  export let sidebarOpen = false
  export let ontogglesidebar: () => void = () => undefined

  let editingZoom = false
  let customZoomPercent: number | undefined = 100
  let customZoomInput: HTMLInputElement | undefined

  async function startCustomZoom() {
    customZoomPercent = Math.round((isViewportFit ? fittedViewportZoom : viewportZoom) * 100)
    editingZoom = true
    await tick()
    customZoomInput?.focus()
    customZoomInput?.select()
  }

  function finishCustomZoom(apply: boolean) {
    if (!editingZoom) return
    editingZoom = false
    if (apply && customZoomPercent !== undefined && Number.isFinite(customZoomPercent))
      onsetzoom(Math.min(2, Math.max(0.1, Math.round(customZoomPercent) / 100)))
  }

  $: saveLabel =
    recoveryState.status === 'idle'
      ? isDirty
        ? 'Unsaved changes'
        : recoveredOnly
          ? 'Recovered locally'
          : hasSavedProject
            ? 'Saved'
            : 'No changes'
      : recoveryState.message
  $: accessibleSaveLabel = saveLabel.replace('Recovered', 'Restored')
</script>

<header class="topbar" aria-label="Project controls">
  {#if compactSidebar}
    <Button
      id="left-sidebar-toggle"
      class="icon-button sidebar-toggle"
      variant="ghost"
      size="icon"
      aria-label="Layouts and images"
      aria-controls="left-sidebar-panel"
      aria-expanded={sidebarOpen}
      title="Layouts and images"
      onclick={ontogglesidebar}
    >
      <Menu size={19} aria-hidden="true" />
    </Button>
  {/if}
  <div class="toolbar-group">
    <Button class="button button-primary" onclick={onnew}>New</Button>
    <Button class="button" variant="outline" onclick={onopen}>Open</Button>
    <DropdownMenu.Root>
      <div class="save-menu">
        <Button
          class="button save-main"
          variant="outline"
          title="Save an editable project (Ctrl/Cmd+S)"
          onclick={onsave}>Save</Button
        ><DropdownMenu.Trigger
          class="button save-caret"
          aria-label="Save options"
          disabled={!hasSavedProject}><ChevronDown size={14}></ChevronDown></DropdownMenu.Trigger
        ><DropdownMenu.Content class="save-menu-popover" align="end"
          ><DropdownMenu.Item onclick={onsaveas}>Save As…</DropdownMenu.Item></DropdownMenu.Content
        >
      </div>
    </DropdownMenu.Root>
  </div>
  <div class="toolbar-group history-controls" aria-label="History">
    <Button
      class="icon-button"
      variant="ghost"
      size="icon"
      aria-label="Undo"
      title="Undo"
      disabled={!canUndo}
      onclick={onundo}><Undo2 size={15}></Undo2></Button
    >
    <Button
      class="icon-button"
      variant="ghost"
      size="icon"
      aria-label="Redo"
      title="Redo"
      disabled={!canRedo}
      onclick={onredo}><Redo2 size={15}></Redo2></Button
    >
  </div>
  <div class="toolbar-group editor-zoom" aria-label="Canvas zoom">
    <Button
      class="icon-button"
      variant="ghost"
      size="icon"
      aria-label="Zoom out"
      disabled={(isViewportFit ? fittedViewportZoom : viewportZoom) <= 0.1}
      onclick={() => onzoomstep(-0.1)}><Minus size={15}></Minus></Button
    >{#if editingZoom}<div class="zoom-custom-editor">
        <input
          bind:this={customZoomInput}
          bind:value={customZoomPercent}
          aria-label="Custom canvas zoom"
          type="number"
          min="10"
          max="200"
          step="1"
          onkeydown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              finishCustomZoom(event.key === 'Enter')
            }
          }}
          onblur={() => finishCustomZoom(true)}
        /><span aria-hidden="true">%</span>
      </div>{:else}<DropdownMenu.Root
        ><DropdownMenu.Trigger
          class="zoom-menu-trigger"
          aria-label={`Canvas zoom: ${isViewportFit ? 'Fit' : `${Math.round(viewportZoom * 100)}%`}`}
          title="Canvas zoom (Ctrl/Cmd + wheel)"
          >{isViewportFit ? 'Fit' : `${Math.round(viewportZoom * 100)}%`}
          <ChevronDown size={13} aria-hidden="true"></ChevronDown></DropdownMenu.Trigger
        ><DropdownMenu.Content class="zoom-menu-content" align="center"
          ><DropdownMenu.Item onclick={() => (isViewportFit = true)}>Fit</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => onsetzoom(0.1)}>10%</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => onsetzoom(0.25)}>25%</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => onsetzoom(0.5)}>50%</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => onsetzoom(0.75)}>75%</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => onsetzoom(1)}>100%</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => onsetzoom(1.25)}>125%</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => onsetzoom(1.5)}>150%</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => onsetzoom(2)}>200%</DropdownMenu.Item
          ><DropdownMenu.Separator /><DropdownMenu.Item onclick={startCustomZoom}
            >Custom…</DropdownMenu.Item
          ></DropdownMenu.Content
        ></DropdownMenu.Root
      >{/if}<Button
      class="icon-button"
      variant="ghost"
      size="icon"
      aria-label="Zoom in"
      disabled={!isViewportFit && viewportZoom >= 2}
      onclick={() => onzoomstep(0.1)}><Plus size={15}></Plus></Button
    >
  </div>
  <label class="project-title">
    <span class="sr-only">Project title</span>
    <Input bind:value={projectTitle} aria-label="Project title" maxlength={200} onblur={onrename} />
  </label>
  <div class="toolbar-group topbar-end">
    <Button
      class="icon-button"
      variant="ghost"
      size="icon"
      aria-label="Show quick start"
      title="Quick start"
      onclick={onshowquickstart}><CircleHelp size={16}></CircleHelp></Button
    >
    <div
      class="deployment-slot"
      class:development={deployment.status === 'development'}
      class:offline-ready={deployment.status === 'offline-ready'}
      class:update-ready={deployment.status === 'update-ready'}
    >
      {#if deployment.status === 'development'}
        <span
          class="deployment-dev-icon"
          role="img"
          aria-label="Development mode: offline support runs in production builds"
          title="Development mode: offline support runs in production builds"
          ><CodeXml size={17} aria-hidden="true"></CodeXml></span
        >
      {:else if deployment.status === 'offline-ready'}
        <span
          class="deployment-ready-icon"
          role="status"
          aria-label="App available offline"
          title="App available offline"
          ><HardDriveDownload size={17} aria-hidden="true"></HardDriveDownload></span
        >
      {:else}
        <button
          class="deployment-status"
          class:update-ready={deployment.status === 'update-ready'}
          disabled={deployment.status !== 'update-ready'}
          title={deployment.detail ?? deployment.message}
          aria-label={deployment.message}
          onclick={onapplyupdate}
          >{#if deployment.status === 'update-ready'}<RefreshCw size={14} aria-hidden="true"
            ></RefreshCw>{/if}<span class="deployment-status-label">{deployment.message}</span
          ></button
        >
      {/if}
    </div>
    <div class="recovery-slot">
      {#if operationProgress}
        <span class="operation-status" role="status" title={operationProgress}>
          <span class="operation-spinner" aria-hidden="true"></span>
          <span class="operation-status-label">{operationProgress}</span>
        </span>
      {:else}
        <button
          class="save-status recovery-status-button"
          class:recovery-error={recoveryState.status === 'failed'}
          class:recovery-conflict={recoveryState.status === 'conflict'}
          title={recoveryState.detail ?? 'Manage local recovery and browser storage'}
          aria-label={`${accessibleSaveLabel}. Manage local copies and browser storage`}
          onclick={onmanagerecovery}
          ><span
            class:dirty={isDirty || recoveredOnly || recoveryState.status === 'pending'}
            class:neutral={!isDirty &&
              !recoveredOnly &&
              recoveryState.status === 'idle' &&
              !hasSavedProject}
            class:error={recoveryState.status === 'failed'}
            class:conflict={recoveryState.status === 'conflict'}
            class:saving={recoveryState.status === 'saving'}
            class="status-dot"
          ></span><span class="save-status-label">{saveLabel}</span></button
        >
      {/if}
    </div>
    <DropdownMenu.Root>
      <div class="export-menu">
        <Button
          class="button button-primary"
          title="Download collage images"
          onclick={() => onexport('current')}>Export…</Button
        ><DropdownMenu.Trigger
          class="button button-primary export-caret"
          aria-label="Choose export scope"
          ><ChevronDown size={14}></ChevronDown></DropdownMenu.Trigger
        ><DropdownMenu.Content class="export-menu-popover" align="end"
          ><DropdownMenu.Item onclick={() => onexport('current')}
            ><FileImage size={14}></FileImage> Current page</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => onexport('all')}
            ><Files size={14}></Files> All pages (ZIP)</DropdownMenu.Item
          ><DropdownMenu.Item onclick={() => onexport('range')}
            ><Files size={14}></Files> Page range…</DropdownMenu.Item
          ></DropdownMenu.Content
        >
      </div>
    </DropdownMenu.Root>
  </div>
</header>
