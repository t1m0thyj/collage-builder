<script lang="ts">
  import { ChevronLeft, ChevronRight, Plus } from '@lucide/svelte'
  import type {
    AssetId,
    CollageDocumentV1,
    PageV1,
    SlotContentV1,
    SlotId,
  } from '../../domain/types'
  import { resolveLayout } from '../../domain/geometry'
  import type { AssetRegistry } from '../../render/assetRegistry'
  import CanvasEditor from '../editor/CanvasEditor.svelte'
  import PageActions from '../PageActions.svelte'
  import * as Select from '../ui/select'

  export let document: CollageDocumentV1
  export let activePage: PageV1
  export let activePageId: string
  export let selectedSlotId: string | null
  export let cropSlotId: string | null
  export let viewportZoom: number
  export let fitToViewport: boolean
  export let darkMode: boolean
  export let imageRevision: number
  export let assetRegistry: AssetRegistry
  export let onactivepagechange: (pageId: string) => void
  export let onselectedslotchange: (slotId: string | null) => void
  export let onfitzoomchange: (zoom: number) => void
  export let onannounce: (message: string) => void
  export let onselect: (slotId: SlotId) => void
  export let onrequestcrop: (slotId: SlotId) => void
  export let onexitcrop: () => void
  export let onrequestimage: (slotId: SlotId) => void
  export let onplacementchange: (slotId: SlotId, placement: SlotContentV1['placement']) => void
  export let onassetdrop: (assetId: AssetId, slotId: SlotId) => void
  export let onframeswap: (sourceSlotId: SlotId, targetSlotId: SlotId) => void
  export let onwheelzoom: (slotId: SlotId, factor: number) => void
  export let onviewportzoom: (factor: number) => void
  export let ondividerchange: (
    changes: Array<{ path: number[]; index: number; position: number }>,
  ) => void
  export let onaddpage: () => void
  export let onrenamepage: () => void
  export let onduplicatepage: () => void
  export let onmovepage: (direction: -1 | 1) => void
  export let onreorderpage: (pageId: string, targetIndex: number) => void
  export let onclearpage: () => void
  export let ondeletepage: () => void

  let isPageMenuOpen = false
  let draggedPageId: string | null = null
  let pageDropTarget: { pageId: string; edge: 'before' | 'after' } | null = null

  function selectPage(pageId: string) {
    onactivepagechange(pageId)
    onselectedslotchange(null)
  }

  function previousPage() {
    const index = document.pages.findIndex((page) => page.id === activePageId)
    if (index > 0) selectPage(document.pages[index - 1].id)
  }

  function nextPage() {
    const index = document.pages.findIndex((page) => page.id === activePageId)
    if (index < document.pages.length - 1) selectPage(document.pages[index + 1].id)
  }

  function startPageDrag(event: DragEvent, pageId: string) {
    draggedPageId = pageId
    event.dataTransfer?.setData('application/x-collage-page', pageId)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  function updatePageDropTarget(event: DragEvent, pageId: string) {
    if (!draggedPageId || draggedPageId === pageId) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
    pageDropTarget = {
      pageId,
      edge: event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after',
    }
  }

  function finishPageDrop(event: DragEvent, pageId: string) {
    event.preventDefault()
    const sourceId = draggedPageId ?? event.dataTransfer?.getData('application/x-collage-page')
    const targetIndex = document.pages.findIndex((page) => page.id === pageId)
    const boundary = targetIndex + (pageDropTarget?.edge === 'after' ? 1 : 0)
    if (sourceId && targetIndex >= 0) onreorderpage(sourceId, boundary)
    draggedPageId = null
    pageDropTarget = null
  }

  function finishPageDrag() {
    draggedPageId = null
    pageDropTarget = null
  }
</script>

<section class="editor-column">
  <section id="collage-canvas" class="canvas-area" aria-label="Canvas preview" tabindex="-1">
    <div class="pasteboard">
      <CanvasEditor
        page={activePage}
        assets={document.assets}
        {selectedSlotId}
        {cropSlotId}
        {viewportZoom}
        {fitToViewport}
        {darkMode}
        {imageRevision}
        {onfitzoomchange}
        {onannounce}
        getImage={(assetId) => assetRegistry.getImage(assetId)}
        {onselect}
        {onrequestcrop}
        {onexitcrop}
        {onrequestimage}
        {onplacementchange}
        {onassetdrop}
        {onframeswap}
        {onwheelzoom}
        {onviewportzoom}
        {ondividerchange}
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
            >
              {#each resolveLayout(page) as frame (frame.slotId)}
                {@const content = page.slots[frame.slotId]}
                <i
                  class:populated={Boolean(content)}
                  style={`left:${(frame.x / page.width) * 100}%;top:${(frame.y / page.height) * 100}%;width:${(frame.width / page.width) * 100}%;height:${(frame.height / page.height) * 100}%;border-radius:${Math.min(page.style.cornerRadius / Math.max(page.width, page.height), 0.1) * 100}%`}
                  >{#if content && assetRegistry.getThumbnailUrl(content.assetId)}<img
                      src={assetRegistry.getThumbnailUrl(content.assetId)}
                      alt=""
                      style={`object-position:${content.placement.positionX * 100}% ${content.placement.positionY * 100}%;transform:scale(${content.placement.zoom});transform-origin:${content.placement.positionX * 100}% ${content.placement.positionY * 100}%`}
                    />{/if}</i
                >{/each}
            </div>
          </div>
          <button
            class:active={page.id === activePageId}
            class:page-drag-before={pageDropTarget?.pageId === page.id &&
              pageDropTarget.edge === 'before'}
            class:page-drag-after={pageDropTarget?.pageId === page.id &&
              pageDropTarget.edge === 'after'}
            class="page-tab"
            draggable="true"
            aria-current={page.id === activePageId ? 'page' : undefined}
            ondragstart={(event) => startPageDrag(event, page.id)}
            ondragover={(event) => updatePageDropTarget(event, page.id)}
            ondrop={(event) => finishPageDrop(event, page.id)}
            ondragend={finishPageDrag}
            onclick={() => selectPage(page.id)}>{page.name}</button
          >
          {#if page.id === activePageId}
            <PageActions
              bind:open={isPageMenuOpen}
              pageIndex={document.pages.findIndex((candidate) => candidate.id === activePageId)}
              pageCount={document.pages.length}
              onRename={onrenamepage}
              onDuplicate={onduplicatepage}
              onMoveLeft={() => onmovepage(-1)}
              onMoveRight={() => onmovepage(1)}
              onClear={onclearpage}
              onDelete={ondeletepage}
            />
          {/if}
        </div>
      {/each}
    {:else}
      <div class="page-picker-with-actions">
        <Select.Root
          type="single"
          value={activePageId}
          onValueChange={(value) => value && selectPage(value)}
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
          onRename={onrenamepage}
          onDuplicate={onduplicatepage}
          onMoveLeft={() => onmovepage(-1)}
          onMoveRight={() => onmovepage(1)}
          onClear={onclearpage}
          onDelete={ondeletepage}
        />
      </div>
    {/if}
    <button class="add-page" onclick={onaddpage} aria-label="Add page"
      ><Plus size={16}></Plus></button
    >
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
