<script lang="ts">
  import type { LayoutPresetDefinition, PageV1 } from '../../domain/types'
  import {
    loadLayouts,
    layoutFrameCounts,
    layoutGroupForFrameCount,
    preloadOptionalLayouts,
  } from '../../layouts/loader'
  import { layoutShapeSummary } from '../../layouts/displayName'
  import { previewFrames, previewFrameStyle } from '../../layouts/preview'

  export let page: PageV1
  export let onselect: (preset: LayoutPresetDefinition) => void
  export let onerror: (message: string) => void

  let expandedFrameCount = layoutGroupForFrameCount(Object.keys(page.slots).length)
  let syncedPageId = ''
  let presets: LayoutPresetDefinition[] = []
  let loading = false
  let requestId = 0

  function focusCountTab(frameCount: number) {
    requestAnimationFrame(() =>
      globalThis.document.getElementById(`layout-count-tab-${frameCount}`)?.focus(),
    )
  }

  function handleCountKeydown(event: KeyboardEvent, currentIndex: number) {
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % layoutFrameCounts.length
    else if (event.key === 'ArrowLeft')
      nextIndex = (currentIndex - 1 + layoutFrameCounts.length) % layoutFrameCounts.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = layoutFrameCounts.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    event.stopPropagation()
    const frameCount = layoutFrameCounts[nextIndex]
    void selectGroup(frameCount)
    focusCountTab(frameCount)
  }

  async function selectGroup(frameCount: number) {
    expandedFrameCount = frameCount
    loading = true
    presets = []
    const currentRequest = ++requestId
    try {
      const loaded = await loadLayouts(frameCount)
      if (currentRequest === requestId) presets = loaded
    } catch (error) {
      if (currentRequest === requestId)
        onerror(error instanceof Error ? error.message : 'Unable to load layouts')
    } finally {
      if (currentRequest === requestId) loading = false
    }
  }

  function syncPageGroup(pageId: string, frameCount: number) {
    if (pageId === syncedPageId) return
    syncedPageId = pageId
    void selectGroup(layoutGroupForFrameCount(frameCount))
  }

  $: syncPageGroup(page.id, Object.keys(page.slots).length)
</script>

<div class="panel-body layout-panel">
  <p class="eyebrow">Choose a layout</p>
  <p class="panel-copy">Pick a preset grid for your page.</p>
  <div class="layout-count-tabs" role="tablist" aria-label="Photo count">
    {#each layoutFrameCounts as frameCount, index (frameCount)}
      <button
        id={`layout-count-tab-${frameCount}`}
        role="tab"
        aria-selected={expandedFrameCount === frameCount}
        aria-controls="layout-options-panel"
        tabindex={expandedFrameCount === frameCount ? 0 : -1}
        class:active={expandedFrameCount === frameCount}
        onpointerenter={preloadOptionalLayouts}
        onfocus={preloadOptionalLayouts}
        onkeydown={(event) => handleCountKeydown(event, index)}
        aria-label={frameCount === 11 ? '11 or more photos' : undefined}
        onclick={() => selectGroup(frameCount)}>{frameCount === 11 ? '11+' : frameCount}</button
      >
    {/each}
  </div>
  <div
    id="layout-options-panel"
    role="tabpanel"
    aria-labelledby={`layout-count-tab-${expandedFrameCount}`}
    class="layout-options"
    aria-busy={loading}
  >
    {#if loading}
      <p class="loading-note" role="status">Loading layouts…</p>
    {:else}
      {#each presets as preset, index (preset.id)}
        {#if expandedFrameCount === 11 && (index === 0 || presets[index - 1].frameCount !== preset.frameCount)}
          <p class="layout-count-heading">{preset.frameCount} photos</p>
        {/if}
        {@const frames = previewFrames(preset, 80, 80)}
        {@const summary = layoutShapeSummary(preset)}
        <button
          class:selected={page.layout.presetId === preset.id}
          class="layout-card"
          data-layout-id={preset.id}
          aria-label={`${preset.frameCount}-photo layout, option ${index + 1}: ${summary}`}
          title={summary}
          onclick={() => onselect(preset)}
        >
          <span class="layout-preview" aria-hidden="true"
            >{#each frames as frame (frame.slotId)}<i style={previewFrameStyle(frame, 80, 80)}
              ></i>{/each}</span
          >
        </button>
      {/each}
    {/if}
  </div>
</div>
