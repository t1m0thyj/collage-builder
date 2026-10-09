<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { AssetRecordV1, PageV1 } from '../../domain/types'
  import type { AssetRegistry } from '../../render/assetRegistry'
  import { drawPagePreview } from '../../render/exportCanvas'

  export let page: PageV1
  export let assets: Record<string, AssetRecordV1>
  export let assetRegistry: AssetRegistry
  export let imageRevision: number

  let canvas: HTMLCanvasElement
  let renderVersion = 0
  $: scale = Math.min(258 / page.width, 220 / page.height)
  $: width = Math.max(1, page.width * scale)
  $: height = Math.max(1, page.height * scale)
  $: if (canvas) void render(page, assets, assetRegistry, imageRevision, width, height)

  async function render(
    currentPage: PageV1,
    currentAssets: Record<string, AssetRecordV1>,
    registry: AssetRegistry,
    revision: number,
    width: number,
    height: number,
  ) {
    void revision
    const version = ++renderVersion
    const target = canvas
    const paint = () => {
      if (version !== renderVersion) return
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      target.width = Math.round(width * pixelRatio)
      target.height = Math.round(height * pixelRatio)
      const context = target.getContext('2d')
      if (!context) return
      drawPagePreview(
        context,
        currentPage,
        currentAssets,
        (assetId) => registry.getImage(assetId),
        target.width,
        target.height,
      )
    }
    paint()
    try {
      const changed = await registry.ensureThumbnailImages(
        Object.values(currentPage.slots).flatMap((content) => (content ? [content.assetId] : [])),
      )
      if (changed) paint()
    } catch {
      // Missing or unsupported images retain their frame placeholders.
      paint()
    }
  }

  onDestroy(() => renderVersion++)
</script>

<div class="page-tab-preview-canvas" role="img" aria-label={`Preview of ${page.name}`}>
  <canvas
    bind:this={canvas}
    style:width={`${width}px`}
    style:height={`${height}px`}
    aria-hidden="true"
  ></canvas>
</div>
