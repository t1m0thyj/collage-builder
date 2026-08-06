<script lang="ts">
  import { onMount } from 'svelte'
  import { Circle, Group, Image, Layer, Rect, Stage, Text } from 'svelte-konva'
  import { resolveCoverPlacement } from '../../domain/crop'
  import { createPageRenderModel } from '../../render/pageRenderer'
  import type { AssetId, AssetRecordV1, PageV1, SlotId } from '../../domain/types'

  export let page: PageV1
  export let selectedSlotId: SlotId | null = null
  export let onselect: (slotId: SlotId) => void
  export let onrequestimage: (slotId: SlotId) => void
  export let getImage: (assetId: AssetId) => HTMLImageElement | undefined
  export let assets: Record<AssetId, AssetRecordV1>

  let host: HTMLDivElement
  let viewportWidth = 600
  let viewportHeight = 500
  let resizeObserver: ResizeObserver | undefined

  $: model = createPageRenderModel(page)
  $: fitScale = Math.min((viewportWidth - 96) / page.width, (viewportHeight - 96) / page.height, 1)
  $: stageX = Math.max(0, (viewportWidth - page.width * fitScale) / 2)
  $: stageY = Math.max(0, (viewportHeight - page.height * fitScale) / 2)

  onMount(() => {
    const resize = () => {
      const bounds = host.getBoundingClientRect()
      viewportWidth = Math.max(1, Math.floor(bounds.width))
      viewportHeight = Math.max(1, Math.floor(bounds.height))
    }
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()
    return () => resizeObserver?.disconnect()
  })
</script>

<div class="canvas-host" bind:this={host} aria-label="Collage canvas">
  <Stage width={viewportWidth} height={viewportHeight}>
    <Layer>
      <Group x={stageX} y={stageY} scaleX={fitScale} scaleY={fitScale}>
        <Rect width={page.width} height={page.height} fill={page.style.backgroundColor} />

        {#if page.style.shadow.enabled}
          {#each model.frames as frame (frame.slotId)}
            <Rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} cornerRadius={model.cornerRadius} fill="#000000" opacity={page.style.shadow.opacity} shadowColor={page.style.shadow.color} shadowBlur={page.style.shadow.blur} shadowOffsetX={page.style.shadow.offsetX} shadowOffsetY={page.style.shadow.offsetY} />
          {/each}
        {/if}

        {#each model.frames as frame, index (frame.slotId)}
          {@const content = page.slots[frame.slotId]}
          {@const asset = content ? assets[content.assetId] : undefined}
          {@const image = content ? getImage(content.assetId) : undefined}
          {@const placement = content && asset ? resolveCoverPlacement(frame.width, frame.height, asset.width, asset.height, content.placement) : undefined}
          <Group>
            <Rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} cornerRadius={model.cornerRadius} fill="#E5E2D9" onpointerclick={() => onselect(frame.slotId)} />
            {#if image && placement}
              <Group clipX={frame.x} clipY={frame.y} clipWidth={frame.width} clipHeight={frame.height}>
                <Image image={image} x={frame.x + placement.x} y={frame.y + placement.y} width={placement.width} height={placement.height} />
              </Group>
            {:else}
              <Text x={frame.x} y={frame.y + frame.height / 2 - 9} width={frame.width} text="Empty frame" align="center" fill="#817C73" fontSize={18} />
              <Circle x={frame.x + frame.width / 2} y={frame.y + frame.height / 2 + 36} radius={22} fill="#315C9C" onpointerclick={() => onrequestimage(frame.slotId)} />
              <Text x={frame.x + frame.width / 2 - 11} y={frame.y + frame.height / 2 + 23} width={22} text="+" align="center" fill="#FFFFFF" fontStyle="bold" fontSize={25} listening={false} />
            {/if}
            <Rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} cornerRadius={model.cornerRadius} stroke={selectedSlotId === frame.slotId ? '#315C9C' : '#B9B4A9'} strokeWidth={selectedSlotId === frame.slotId ? 7 : 2} dash={selectedSlotId === frame.slotId ? [] : [10, 9]} listening={false} />
            {#if selectedSlotId === frame.slotId}
              <Text x={frame.x + 16} y={frame.y + 16} text={`Frame ${index + 1}`} fill="#315C9C" fontStyle="bold" fontSize={15} />
            {/if}
          </Group>
        {/each}
      </Group>
    </Layer>
  </Stage>
</div>
