<script lang="ts">
  import { ChevronDown, FileImage, Files, Minus, Plus, Redo2, Undo2 } from '@lucide/svelte'
  import Button from '../ui/button/button.svelte'
  import Input from '../ui/input/input.svelte'
  import * as DropdownMenu from '../ui/dropdown-menu'

  export let projectTitle: string
  export let canUndo: boolean
  export let canRedo: boolean
  export let viewportZoom: number
  export let exportFormat: 'png' | 'jpeg'
  export let fittedViewportZoom: number
  export let isViewportFit: boolean
  export let isDirty: boolean
  export let recoveredOnly: boolean
  export let onnew: () => void
  export let onopen: () => void
  export let onsave: (event: MouseEvent) => void
  export let onundo: () => void
  export let onredo: () => void
  export let onzoomstep: (delta: number) => void
  export let onsetzoom: (zoom: number) => void
  export let onrename: () => void
  export let onexport: (scope: 'current' | 'all' | 'range') => void
</script>

<header class="topbar" aria-label="Project controls">
  <div class="toolbar-group">
    <Button class="button button-primary" onclick={onnew}>New</Button>
    <Button class="button" variant="outline" onclick={onopen}>Open</Button>
    <Button
      class="button"
      variant="outline"
      title="Save (Ctrl/Cmd+S) · Save As (Ctrl/Cmd+Shift+S, Option-click on Apple devices, Shift-click elsewhere)"
      onclick={onsave}>Save</Button
    >
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
      disabled={(isViewportFit ? fittedViewportZoom : viewportZoom) <= 0.5}
      onclick={() => onzoomstep(-0.1)}><Minus size={15}></Minus></Button
    ><DropdownMenu.Root
      ><DropdownMenu.Trigger
        class="zoom-menu-trigger"
        aria-label={`Canvas zoom: ${isViewportFit ? 'Fit' : `${Math.round(viewportZoom * 100)}%`}`}
        >{isViewportFit ? 'Fit' : `${Math.round(viewportZoom * 100)}%`}
        <ChevronDown size={13} aria-hidden="true"></ChevronDown></DropdownMenu.Trigger
      ><DropdownMenu.Content class="zoom-menu-content" align="center"
        ><DropdownMenu.Item onclick={() => (isViewportFit = true)}>Fit</DropdownMenu.Item
        ><DropdownMenu.Item onclick={() => onsetzoom(0.5)}>50%</DropdownMenu.Item><DropdownMenu.Item
          onclick={() => onsetzoom(0.75)}>75%</DropdownMenu.Item
        ><DropdownMenu.Item onclick={() => onsetzoom(1)}>100%</DropdownMenu.Item><DropdownMenu.Item
          onclick={() => onsetzoom(1.25)}>125%</DropdownMenu.Item
        ><DropdownMenu.Item onclick={() => onsetzoom(1.5)}>150%</DropdownMenu.Item
        ><DropdownMenu.Item onclick={() => onsetzoom(2)}>200%</DropdownMenu.Item
        ></DropdownMenu.Content
      ></DropdownMenu.Root
    ><Button
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
    <Input bind:value={projectTitle} aria-label="Project title" onblur={onrename} />
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
        <Button class="button button-primary" onclick={() => onexport('current')}
          >Export {exportFormat === 'jpeg' ? 'JPEG' : 'PNG'}</Button
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
