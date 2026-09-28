<script lang="ts">
  import { afterUpdate, onMount } from 'svelte'
  import type { PageV1 } from '../../domain/types'
  import { scrollTabsWithWheel } from './tabWheel'

  export let pages: PageV1[]
  export let total: number

  let viewport: HTMLDivElement
  let pagebar: HTMLElement

  onMount(() => {
    const handleWheel = (event: WheelEvent) => scrollTabsWithWheel(event, viewport)
    pagebar.addEventListener('wheel', handleWheel, { passive: false })
    return () => pagebar.removeEventListener('wheel', handleWheel)
  })

  afterUpdate(() => {
    if (viewport) viewport.scrollLeft = viewport.scrollWidth
  })
</script>

<section class="editor-column opening-editor" aria-label="Opening collage">
  <section
    id="collage-canvas"
    class="canvas-area opening-canvas"
    aria-label="Canvas preview"
    tabindex="-1"
  >
    <div class="opening-canvas-message">
      <strong>{total ? 'Preparing pages…' : 'Reading collage…'}</strong>
      {#if total}<span>{pages.length} of {total} pages ready</span>{/if}
    </div>
  </section>
  <footer bind:this={pagebar} class="pagebar opening-pagebar" aria-label="Pages loading">
    <div bind:this={viewport} class="page-tab-viewport" aria-live="polite">
      {#each pages as page (page.id)}
        <span class="page-tab opening-page-tab" data-title={page.name} title={page.name}
          ><span class="page-tab-label">{page.name}</span></span
        >
      {/each}
    </div>
    {#if total}<span class="opening-page-count">{pages.length}/{total} pages</span>{/if}
  </footer>
</section>
