<script lang="ts">
  import { afterUpdate, onMount, tick } from 'svelte'
  import { ChevronLeft, ChevronRight, Plus } from '@lucide/svelte'
  import type {
    AssetId,
    CollageDocumentV1,
    PageV1,
    SlotContentV1,
    SlotId,
  } from '../../domain/types'
  import { resolveLayout } from '../../domain/geometry'
  import { sourceImagePosition } from '../../domain/crop'
  import type { AssetRegistry } from '../../render/assetRegistry'
  import CanvasEditor from '../editor/CanvasEditor.svelte'
  import PageActions from '../PageActions.svelte'

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
  export let onfiledrop: (files: FileList, slotId: SlotId | null) => void
  export let onframeswap: (sourceSlotId: SlotId, targetSlotId: SlotId) => void
  export let onwheelzoom: (slotId: SlotId, factor: number) => void
  export let onviewportzoom: (factor: number) => void
  export let ondividerchange: (
    changes: Array<{ path: number[]; index: number; position: number }>,
  ) => void
  export let onequalizesplit: (path: number[]) => void
  export let onaddpage: () => void
  export let onrenamepage: (pageId: string, name: string) => void
  export let onduplicatepage: () => void
  export let onmovepage: (direction: -1 | 1) => void
  export let onreorderpage: (pageId: string, targetIndex: number) => void
  export let onclearpage: () => void
  export let ondeletepage: () => void

  let isPageMenuOpen = false
  let pagebar: HTMLElement
  let pageTabsViewport: HTMLElement
  let pageTabsMeasure: HTMLElement
  let hasOverflow = false
  let canScrollLeft = false
  let canScrollRight = false
  let previewPageId: string | null = null
  let previewLeft = 0
  let previewPage: PageV1 | undefined
  let renamingPageId: string | null = null
  let renameDraft = ''
  let renameInput: HTMLInputElement | undefined
  let fittedTabWidths: Record<string, number> = {}
  let sizedPageNames: Record<string, string> = {}
  let lastSizedActivePageId: string | null = null
  let lastSizedActivePageName: string | null = null
  let activeTabSizingTimer: ReturnType<typeof setTimeout> | undefined
  let draggedPageId: string | null = null
  let pageDropTarget: { pageId: string; edge: 'before' | 'after' } | null = null
  $: previewPage = document.pages.find((page) => page.id === previewPageId)
  $: if (activePageId && pageTabsViewport) void tick().then(ensureActiveTabVisible)

  afterUpdate(() => {
    const pageName = document.pages.find((page) => page.id === activePageId)?.name
    if (
      !activePageId ||
      !pageName ||
      (activePageId === lastSizedActivePageId && pageName === lastSizedActivePageName)
    )
      return
    lastSizedActivePageId = activePageId
    lastSizedActivePageName = pageName
    clearTimeout(activeTabSizingTimer)
    const pageId = activePageId
    activeTabSizingTimer = setTimeout(() => {
      if (
        activePageId === pageId &&
        document.pages.find((page) => page.id === pageId)?.name === pageName
      )
        void resizePageTab(pageId, false)
    }, 0)
  })

  function updateScrollState() {
    canScrollLeft = pageTabsViewport.scrollLeft > 1
    canScrollRight =
      pageTabsViewport.scrollLeft + pageTabsViewport.clientWidth < pageTabsViewport.scrollWidth - 1
  }

  function ensureActiveTabVisible() {
    const activeTab = pageTabsViewport.querySelector<HTMLElement>(
      '.page-tab-with-actions.active-tab-action',
    )
    if (!activeTab) return
    const viewportBounds = pageTabsViewport.getBoundingClientRect()
    const tabBounds = activeTab.getBoundingClientRect()
    if (tabBounds.left < viewportBounds.left) {
      pageTabsViewport.scrollLeft += tabBounds.left - viewportBounds.left
    } else if (tabBounds.right > viewportBounds.right) {
      pageTabsViewport.scrollLeft += tabBounds.right - viewportBounds.right
    }
    updateScrollState()
  }

  function scrollTabs(direction: -1 | 1) {
    previewPageId = null
    pageTabsViewport.scrollBy({
      left: direction * Math.max(84, pageTabsViewport.clientWidth * 0.75),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }

  function showPagePreview(pageId: string, element: HTMLElement) {
    const pagebarBounds = pagebar.getBoundingClientRect()
    const tabBounds = element.getBoundingClientRect()
    previewLeft = Math.max(
      140,
      Math.min(
        pagebarBounds.width - 140,
        tabBounds.left + tabBounds.width / 2 - pagebarBounds.left,
      ),
    )
    previewPageId = pageId
  }

  function hidePagePreview(pageId: string) {
    if (previewPageId === pageId) previewPageId = null
  }

  onMount(() => {
    const updatePageTabs = () => {
      const styles = getComputedStyle(pagebar)
      const availableWidth =
        pagebar.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight)
      hasOverflow = pageTabsMeasure.getBoundingClientRect().width > availableWidth
      void tick().then(ensureActiveTabVisible)
    }
    const observer = new ResizeObserver(updatePageTabs)
    observer.observe(pagebar)
    observer.observe(pageTabsMeasure)
    updatePageTabs()
    return () => {
      observer.disconnect()
      clearTimeout(activeTabSizingTimer)
    }
  })

  function selectPage(pageId: string) {
    onactivepagechange(pageId)
    onselectedslotchange(null)
  }

  function startRename(pageId: string) {
    const page = document.pages.find((candidate) => candidate.id === pageId)
    if (!page) return
    isPageMenuOpen = false
    previewPageId = null
    renameDraft = page.name
    renamingPageId = pageId
    void tick().then(() => {
      renameInput?.focus()
      renameInput?.select()
    })
  }

  function finishRename(save: boolean, restoreFocus = false) {
    const pageId = renamingPageId
    if (!pageId) return
    renamingPageId = null
    if (save) {
      onrenamepage(pageId, renameDraft)
      void resizePageTab(pageId, true, restoreFocus)
    } else if (restoreFocus) void tick().then(() => findPageTab(pageId)?.focus())
  }

  function findPageTab(pageId: string) {
    return [...pageTabsViewport.querySelectorAll<HTMLButtonElement>('.page-tab')].find(
      (tab) => tab.dataset.pageId === pageId,
    )
  }

  async function resizePageTab(pageId: string, resetWidth: boolean, restoreFocus = false) {
    const pageName = document.pages.find((page) => page.id === pageId)?.name
    if (!pageName) return
    if (resetWidth || sizedPageNames[pageId] !== pageName)
      fittedTabWidths = Object.fromEntries(
        Object.entries(fittedTabWidths).filter(([id]) => id !== pageId),
      )
    sizedPageNames = { ...sizedPageNames, [pageId]: pageName }
    await tick()
    const tab = findPageTab(pageId)
    const label = tab?.querySelector<HTMLElement>('.page-tab-label')
    if (tab && label) {
      const activeTab = pageTabsViewport.querySelector<HTMLElement>(
        '.page-tab-with-actions.active-tab-action .page-tab',
      )
      const activeLabel = activeTab?.querySelector<HTMLElement>('.page-tab-label')
      const activeInset =
        activeTab && activeLabel
          ? activeTab.getBoundingClientRect().width - activeLabel.clientWidth
          : tab.getBoundingClientRect().width - label.clientWidth
      const textRange = globalThis.document.createRange()
      textRange.selectNodeContents(label)
      const neededWidth = Math.min(
        240,
        Math.max(84, Math.ceil(textRange.getBoundingClientRect().width + activeInset)),
      )
      if (neededWidth > tab.getBoundingClientRect().width + 0.5) {
        fittedTabWidths = {
          ...fittedTabWidths,
          [pageId]: neededWidth,
        }
        await tick()
      }
    }
    ensureActiveTabVisible()
    if (restoreFocus) findPageTab(pageId)?.focus()
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
    if (sourceId && targetIndex >= 0) {
      onreorderpage(sourceId, boundary)
      void tick().then(ensureActiveTabVisible)
    }
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
        {onfiledrop}
        {onframeswap}
        {onwheelzoom}
        {onviewportzoom}
        {ondividerchange}
        {onequalizesplit}
      />
    </div>
  </section>
  <footer
    bind:this={pagebar}
    class="pagebar"
    class:dragging-page={Boolean(draggedPageId)}
    aria-label="Pages"
  >
    <div bind:this={pageTabsMeasure} class="page-tabs-measure" aria-hidden="true">
      {#each document.pages as page (page.id)}
        <div class:active-tab-action={page.id === activePageId} class="page-tab-with-actions">
          <button
            class:active={page.id === activePageId}
            class="page-tab"
            data-title={page.name}
            style:width={fittedTabWidths[page.id] ? `${fittedTabWidths[page.id]}px` : undefined}
            tabindex="-1"><span class="page-tab-label">{page.name}</span></button
          >
        </div>
      {/each}
      <button class="add-page" tabindex="-1" aria-label="Add page"><Plus size={16}></Plus></button>
    </div>
    {#if hasOverflow}
      <button
        class="icon-button page-scroll-button"
        aria-label="Scroll tabs left"
        disabled={!canScrollLeft}
        onclick={() => scrollTabs(-1)}><ChevronLeft size={17}></ChevronLeft></button
      >
    {/if}
    <div
      bind:this={pageTabsViewport}
      class="page-tab-viewport"
      onscroll={() => {
        updateScrollState()
        const hoveredTab = pageTabsViewport.querySelector<HTMLElement>(
          '.page-tab:hover, .page-tab:focus-visible',
        )
        if (hoveredTab?.dataset.pageId) showPagePreview(hoveredTab.dataset.pageId, hoveredTab)
        else previewPageId = null
      }}
    >
      {#each document.pages as page (page.id)}
        <div class:active-tab-action={page.id === activePageId} class="page-tab-with-actions">
          {#if renamingPageId === page.id}
            <button
              class:active={page.id === activePageId}
              class="page-tab page-tab-placeholder"
              data-page-id={page.id}
              data-title={page.name}
              style:width={fittedTabWidths[page.id] ? `${fittedTabWidths[page.id]}px` : undefined}
              tabindex="-1"
              aria-hidden="true"><span class="page-tab-label">{page.name}</span></button
            >
            <input
              bind:this={renameInput}
              bind:value={renameDraft}
              class="page-tab page-tab-rename"
              aria-label="Rename page"
              maxlength="200"
              onkeydown={(event) => {
                if (event.key === 'Enter' || event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  finishRename(event.key === 'Enter', true)
                }
              }}
              onblur={() => finishRename(true)}
            />
          {:else}
            <button
              class:active={page.id === activePageId}
              class:page-drag-before={pageDropTarget?.pageId === page.id &&
                pageDropTarget.edge === 'before'}
              class:page-drag-after={pageDropTarget?.pageId === page.id &&
                pageDropTarget.edge === 'after'}
              class="page-tab"
              data-page-id={page.id}
              data-title={page.name}
              style:width={fittedTabWidths[page.id] ? `${fittedTabWidths[page.id]}px` : undefined}
              draggable="true"
              aria-current={page.id === activePageId ? 'page' : undefined}
              onpointerenter={(event) => showPagePreview(page.id, event.currentTarget)}
              onpointerleave={(event) => {
                if (!event.currentTarget.matches(':focus-visible')) hidePagePreview(page.id)
              }}
              onfocus={(event) => {
                if (event.currentTarget.matches(':focus-visible'))
                  showPagePreview(page.id, event.currentTarget)
              }}
              onblur={() => hidePagePreview(page.id)}
              ondragstart={(event) => startPageDrag(event, page.id)}
              ondragover={(event) => updatePageDropTarget(event, page.id)}
              ondrop={(event) => finishPageDrop(event, page.id)}
              ondragend={finishPageDrag}
              ondblclick={() => startRename(page.id)}
              onclick={() => selectPage(page.id)}
              ><span class="page-tab-label">{page.name}</span></button
            >
          {/if}
          {#if page.id === activePageId && renamingPageId !== page.id}
            <PageActions
              bind:open={isPageMenuOpen}
              pageIndex={document.pages.findIndex((candidate) => candidate.id === activePageId)}
              pageCount={document.pages.length}
              onRename={() => startRename(page.id)}
              onDuplicate={onduplicatepage}
              onMoveLeft={() => onmovepage(-1)}
              onMoveRight={() => onmovepage(1)}
              onClear={onclearpage}
              onDelete={ondeletepage}
            />
          {/if}
        </div>
      {/each}
    </div>
    <button class="add-page" onclick={onaddpage} aria-label="Add page"
      ><Plus size={16}></Plus></button
    >
    {#if hasOverflow}
      <button
        class="icon-button page-scroll-button"
        aria-label="Scroll tabs right"
        disabled={!canScrollRight}
        onclick={() => scrollTabs(1)}><ChevronRight size={17}></ChevronRight></button
      >
    {/if}
    {#if previewPage}
      <div class="page-tab-preview visible" role="tooltip" style:left={`${previewLeft}px`}>
        <strong>{previewPage.name}</strong>
        <div
          class="page-tab-preview-canvas"
          style={`aspect-ratio: ${previewPage.width} / ${previewPage.height}; background: ${previewPage.style.transparentBackground ? 'transparent' : previewPage.style.backgroundColor}`}
        >
          {#each resolveLayout(previewPage) as frame (frame.slotId)}
            {@const content = previewPage.slots[frame.slotId]}
            {@const rotation = content?.placement.rotation ?? 0}
            {@const sourcePosition = content ? sourceImagePosition(content.placement) : undefined}
            <i
              class:populated={Boolean(content)}
              style={`left:${(frame.x / previewPage.width) * 100}%;top:${(frame.y / previewPage.height) * 100}%;width:${(frame.width / previewPage.width) * 100}%;height:${(frame.height / previewPage.height) * 100}%;border-radius:${Math.min(previewPage.style.cornerRadius / Math.max(previewPage.width, previewPage.height), 0.1) * 100}%`}
              >{#if content && assetRegistry.getThumbnailUrl(content.assetId)}<img
                  src={assetRegistry.getThumbnailUrl(content.assetId)}
                  alt=""
                  style={`width:${rotation === 90 || rotation === 270 ? (frame.height / frame.width) * 100 : 100}%;height:${rotation === 90 || rotation === 270 ? (frame.width / frame.height) * 100 : 100}%;object-position:${sourcePosition!.x * 100}% ${sourcePosition!.y * 100}%;transform:translate(-50%, -50%) scaleX(${content.placement.flipHorizontal ? -1 : 1}) scaleY(${content.placement.flipVertical ? -1 : 1}) rotate(${rotation}deg) scale(${content.placement.zoom})`}
                />{/if}</i
            >{/each}
        </div>
      </div>
    {/if}
  </footer>
</section>
