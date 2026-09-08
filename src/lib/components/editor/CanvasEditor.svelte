<script lang="ts">
  import { onMount } from 'svelte'
  import { Stage } from 'svelte-konva'
  import type { SceneContext } from 'konva/lib/Context'
  import { panPlacement, resolveCoverPlacement, zoomPlacement } from '../../domain/crop'
  import { resolveDividers } from '../../domain/geometry'
  import { createPageRenderModel } from '../../render/pageRenderer'
  import type { AssetId, AssetRecordV1, PageV1, SlotContentV1, SlotId } from '../../domain/types'
  import CropOverlay from './CropOverlay.svelte'
  import CanvasPageLayer from './CanvasPageLayer.svelte'

  export let page: PageV1
  export let selectedSlotId: SlotId | null = null
  export let onselect: (slotId: SlotId) => void
  export let onrequestimage: (slotId: SlotId) => void
  export let cropSlotId: SlotId | null = null
  export let onplacementchange: (slotId: SlotId, placement: SlotContentV1['placement']) => void
  export let ondividerchange: (
    changes: Array<{ path: number[]; index: number; position: number }>,
  ) => void
  export let onframeswap: (sourceSlotId: SlotId, targetSlotId: SlotId) => void
  export let onwheelzoom: (slotId: SlotId, factor: number) => void
  export let onassetdrop: (assetId: AssetId, slotId: SlotId) => void
  export let viewportZoom = 1
  export let fitToViewport = true
  export let darkMode = false
  export let imageRevision = 0
  export let onfitzoomchange: (zoom: number) => void = () => undefined
  export let onannounce: (message: string) => void
  export let onrequestcrop: (slotId: SlotId) => void
  export let onviewportzoom: (factor: number) => void
  export let onexitcrop: () => void
  export let getImage: (assetId: AssetId, revision?: number) => HTMLImageElement | undefined
  export let assets: Record<AssetId, AssetRecordV1>

  let host: HTMLDivElement
  let viewportWidth = 600
  let viewportHeight = 500
  let resizeObserver: ResizeObserver | undefined
  let hoveredDividerKey: string | null = null
  let activeDividerKey: string | null = null
  let dragSourceSlotId: SlotId | null = null
  let dragTargetSlotId: SlotId | null = null
  let frameDragCancelled = false
  let lastFrameClick: { slotId: SlotId; at: number } | null = null
  let sideCropDrag: {
    slotId: SlotId
    startX: number
    startY: number
    directionX: number
    directionY: number
    dimension: number
    placement: SlotContentV1['placement']
    dimensions: ReturnType<typeof resolveCoverPlacement>
  } | null = null

  function commitPan(
    event: { target: { x(): number; y(): number } },
    frame: { x: number; y: number },
    placement: ReturnType<typeof resolveCoverPlacement>,
    content: SlotContentV1,
    slotId: SlotId,
  ) {
    onplacementchange(
      slotId,
      panPlacement(
        content.placement,
        placement,
        event.target.x() - (frame.x + placement.x),
        event.target.y() - (frame.y + placement.y),
      ),
    )
  }

  function roundedClip(
    x: number,
    y: number,
    width: number,
    height: number,
    polygon?: { x: number; y: number }[],
  ) {
    const radius = Math.min(model.cornerRadius, width / 2, height / 2)
    return (context: SceneContext) => {
      context.beginPath()
      if (polygon) {
        context.moveTo(x + polygon[0].x * width, y + polygon[0].y * height)
        polygon
          .slice(1)
          .forEach((point) => context.lineTo(x + point.x * width, y + point.y * height))
      } else context.roundRect(x, y, width, height, radius)
      context.closePath()
    }
  }

  function polygonPoints(frame: {
    x: number
    y: number
    width: number
    height: number
    polygon?: { x: number; y: number }[]
  }) {
    return (
      frame.polygon?.flatMap((point) => [
        frame.x + point.x * frame.width,
        frame.y + point.y * frame.height,
      ]) ?? []
    )
  }

  function previewCornerZoom(
    event: { target: { x(): number; y(): number } },
    frame: { x: number; y: number },
    placement: ReturnType<typeof resolveCoverPlacement>,
    content: SlotContentV1,
    slotId: SlotId,
    cornerX: number,
    cornerY: number,
  ) {
    const anchorX = frame.x + placement.x + cornerX * placement.width
    const anchorY = frame.y + placement.y + cornerY * placement.height
    const centerX = frame.x + placement.x + placement.width / 2
    const centerY = frame.y + placement.y + placement.height / 2
    const originalDistance = Math.hypot(anchorX - centerX, anchorY - centerY)
    const movedDistance = Math.hypot(event.target.x() - centerX, event.target.y() - centerY)
    const zoom =
      content.placement.zoom *
      (1 + (movedDistance - originalDistance) / Math.max(placement.width, placement.height))
    onplacementchange(slotId, zoomPlacement(content.placement, placement, zoom))
  }

  function cropDragBound(
    position: { x: number; y: number },
    frame: { x: number; y: number; width: number; height: number },
    placement: ReturnType<typeof resolveCoverPlacement>,
  ) {
    const documentX = (position.x - stageX) / fitScale
    const documentY = (position.y - stageY) / fitScale
    const boundedX = Math.min(frame.x, Math.max(frame.x + frame.width - placement.width, documentX))
    const boundedY = Math.min(
      frame.y,
      Math.max(frame.y + frame.height - placement.height, documentY),
    )
    return {
      x: stageX + boundedX * fitScale,
      y: stageY + boundedY * fitScale,
    }
  }

  function cornerDragBound(
    position: { x: number; y: number },
    frame: { x: number; y: number },
    placement: ReturnType<typeof resolveCoverPlacement>,
    content: SlotContentV1,
    cornerX: number,
    cornerY: number,
  ) {
    const centerX = frame.x + placement.x + placement.width / 2
    const centerY = frame.y + placement.y + placement.height / 2
    const anchorX = frame.x + placement.x + cornerX * placement.width
    const anchorY = frame.y + placement.y + cornerY * placement.height
    const originalDistance = Math.hypot(anchorX - centerX, anchorY - centerY)
    const denominator = Math.max(placement.width, placement.height)
    const minDistance = Math.max(
      0,
      originalDistance + denominator * (1 / content.placement.zoom - 1),
    )
    const maxDistance = originalDistance + denominator * (8 / content.placement.zoom - 1)
    const directionX = (anchorX - centerX) / originalDistance
    const directionY = (anchorY - centerY) / originalDistance
    const documentX = (position.x - stageX) / fitScale
    const documentY = (position.y - stageY) / fitScale
    const projected = (documentX - centerX) * directionX + (documentY - centerY) * directionY
    const distance = Math.min(maxDistance, Math.max(minDistance, projected))
    return {
      x: stageX + (centerX + directionX * distance) * fitScale,
      y: stageY + (centerY + directionY * distance) * fitScale,
    }
  }

  function beginSideZoom(
    event: {
      target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
    },
    placement: ReturnType<typeof resolveCoverPlacement>,
    content: SlotContentV1,
    slotId: SlotId,
    directionX: number,
    directionY: number,
  ) {
    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) return
    sideCropDrag = {
      slotId,
      startX: (pointer.x - stageX) / fitScale,
      startY: (pointer.y - stageY) / fitScale,
      directionX,
      directionY,
      dimension: directionX ? placement.width : placement.height,
      placement: structuredClone(content.placement),
      dimensions: placement,
    }
  }

  function previewSideZoom(event: {
    target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
  }) {
    if (!sideCropDrag) return
    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) return
    const x = (pointer.x - stageX) / fitScale
    const y = (pointer.y - stageY) / fitScale
    const outwardDelta =
      (x - sideCropDrag.startX) * sideCropDrag.directionX +
      (y - sideCropDrag.startY) * sideCropDrag.directionY
    const zoom = sideCropDrag.placement.zoom * (1 + (2 * outwardDelta) / sideCropDrag.dimension)
    onplacementchange(
      sideCropDrag.slotId,
      zoomPlacement(sideCropDrag.placement, sideCropDrag.dimensions, zoom),
    )
  }

  function commitDivider(
    event: { target: { x(): number; y(): number } },
    divider: (typeof dividers)[number],
  ) {
    const coordinate =
      divider.axis === 'x'
        ? event.target.x() + divider.width / 2
        : event.target.y() + divider.height / 2
    const linked = linkedDividers(divider)
    ondividerchange(
      linked.map((candidate) => ({
        path: candidate.path,
        index: candidate.index,
        position: Math.min(
          0.95,
          Math.max(
            0.05,
            (coordinate - (candidate.axis === 'x' ? candidate.parentX : candidate.parentY)) /
              (candidate.axis === 'x' ? candidate.parentWidth : candidate.parentHeight),
          ),
        ),
      })),
    )
  }

  function dividerKey(divider: (typeof dividers)[number]) {
    return `${divider.path.join('.')}-${divider.index}`
  }

  function dividerPercent(divider: (typeof dividers)[number]) {
    const center =
      divider.axis === 'x' ? divider.x + divider.width / 2 : divider.y + divider.height / 2
    const start = divider.axis === 'x' ? divider.parentX : divider.parentY
    const length = divider.axis === 'x' ? divider.parentWidth : divider.parentHeight
    return Math.round(((center - start) / length) * 100)
  }

  function dividerName(divider: (typeof dividers)[number]) {
    const orientation = divider.axis === 'x' ? 'Vertical' : 'Horizontal'
    return `${orientation} divider ${keyboardDividers.indexOf(divider) + 1}`
  }

  function setDividerPercent(divider: (typeof dividers)[number], percent: number) {
    const position = Math.min(95, Math.max(5, percent))
    ondividerchange(
      linkedDividers(divider).map((candidate) => ({
        path: candidate.path,
        index: candidate.index,
        position: position / 100,
      })),
    )
    onannounce(`${dividerName(divider)} set to ${position} percent.`)
  }

  function adjustDividerWithKeyboard(event: KeyboardEvent, divider: (typeof dividers)[number]) {
    const increaseKey = divider.axis === 'x' ? 'ArrowRight' : 'ArrowDown'
    const decreaseKey = divider.axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
    const current = dividerPercent(divider)
    const increment = event.shiftKey ? 5 : 1
    let next: number | undefined
    if (event.key === increaseKey) next = current + increment
    else if (event.key === decreaseKey) next = current - increment
    else if (event.key === 'PageUp') next = current + 10
    else if (event.key === 'PageDown') next = current - 10
    else if (event.key === 'Home') next = 5
    else if (event.key === 'End') next = 95
    if (next === undefined) return
    event.preventDefault()
    event.stopPropagation()
    setDividerPercent(divider, next)
  }

  function nudgeCrop(axis: 'positionX' | 'positionY', delta: number, label: string) {
    if (!cropSlotId || !cropContent) return
    onplacementchange(cropSlotId, {
      ...cropContent.placement,
      [axis]: Math.min(1, Math.max(0, cropContent.placement[axis] + delta)),
    })
    onannounce(`Crop moved ${label}.`)
  }

  function adjustCropZoom(factor: number) {
    if (!cropSlotId || !cropContent) return
    const zoom = Math.min(8, Math.max(1, cropContent.placement.zoom * factor))
    onplacementchange(cropSlotId, { ...cropContent.placement, zoom })
    onannounce(`Crop zoom ${Math.round(zoom * 100)} percent.`)
  }

  function selectFrameControl(slotId: SlotId, index: number) {
    onselect(slotId)
    const content = page.slots[slotId]
    const asset = content ? assets[content.assetId] : undefined
    onannounce(`Frame ${index + 1} selected${asset ? `, ${asset.originalName}` : ', empty'}.`)
  }

  function stopCanvasShortcut(event: KeyboardEvent) {
    event.stopPropagation()
  }

  function linkedDividers(divider: (typeof dividers)[number]) {
    const center = (candidate: typeof divider) =>
      candidate.axis === 'x'
        ? candidate.x + candidate.width / 2
        : candidate.y + candidate.height / 2
    const axisLength = (candidate: typeof divider) =>
      candidate.axis === 'x' ? candidate.parentWidth : candidate.parentHeight
    return dividers.filter(
      (candidate) =>
        candidate.axis === divider.axis &&
        (Math.abs(center(candidate) - center(divider)) < 1 ||
          (candidate.index === divider.index &&
            candidate.path.length === divider.path.length &&
            Math.abs(axisLength(candidate) - axisLength(divider)) < 1)),
    )
  }
  function setCursor(
    event: { target: { getStage(): { container(): HTMLDivElement } | null } },
    cursor: string,
  ) {
    event.target.getStage()?.container().style.setProperty('cursor', cursor)
  }
  function handleWheel(event: { evt: WheelEvent }) {
    event.evt.preventDefault()
    if (cropSlotId && (event.evt.ctrlKey || event.evt.metaKey)) {
      onwheelzoom(cropSlotId, event.evt.deltaY < 0 ? 1.08 : 1 / 1.08)
      return
    }
    onviewportzoom(event.evt.deltaY < 0 ? 1.08 : 1 / 1.08)
  }
  function dropAsset(event: DragEvent) {
    event.preventDefault()
    const assetId = event.dataTransfer?.getData('application/x-collage-asset')
    if (!assetId) return
    const bounds = host.getBoundingClientRect()
    const x = (event.clientX - bounds.left + host.scrollLeft - stageX) / fitScale
    const y = (event.clientY - bounds.top + host.scrollTop - stageY) / fitScale
    const frame = model.frames.find(
      (candidate) =>
        candidate.x <= x &&
        x <= candidate.x + candidate.width &&
        candidate.y <= y &&
        y <= candidate.y + candidate.height,
    )
    if (frame) onassetdrop(assetId, frame.slotId)
  }
  function frameAtPoint(x: number, y: number) {
    return model.frames.find(
      (frame) =>
        frame.x <= x && x <= frame.x + frame.width && frame.y <= y && y <= frame.y + frame.height,
    )
  }
  function beginFrameDrag(slotId: SlotId) {
    if (!cropSlotId) {
      frameDragCancelled = false
      dragSourceSlotId = slotId
      dragTargetSlotId = null
    }
  }
  function selectOrCropFrame(slotId: SlotId) {
    const now = Date.now()
    const doubleClick = lastFrameClick?.slotId === slotId && now - lastFrameClick.at < 375
    lastFrameClick = doubleClick ? null : { slotId, at: now }
    onselect(slotId)
    if (doubleClick) onrequestcrop(slotId)
  }
  function previewFrameDrag(
    event: {
      target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
    },
    sourceSlotId: SlotId,
  ) {
    if (cropSlotId) return
    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) return
    const frame = frameAtPoint((pointer.x - stageX) / fitScale, (pointer.y - stageY) / fitScale)
    dragTargetSlotId = frame && frame.slotId !== sourceSlotId ? frame.slotId : null
  }
  function endFrameDrag(
    event: {
      target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
    },
    sourceSlotId: SlotId,
  ) {
    if (frameDragCancelled) {
      frameDragCancelled = false
      dragSourceSlotId = null
      dragTargetSlotId = null
      return
    }
    previewFrameDrag(event, sourceSlotId)
    const target = dragTargetSlotId
    dragSourceSlotId = null
    dragTargetSlotId = null
    if (target) onframeswap(sourceSlotId, target)
  }

  $: model = createPageRenderModel(page)
  $: dividers = resolveDividers(page)
  $: displayDividers = [...dividers].sort((left, right) =>
    left.axis === right.axis ? 0 : left.axis === 'x' ? 1 : -1,
  )
  $: keyboardDividers = dividers.filter(
    (divider, index) =>
      !dividers
        .slice(0, index)
        .some((candidate) =>
          linkedDividers(divider).some((linked) => dividerKey(linked) === dividerKey(candidate)),
        ),
  )
  $: cropFrame = cropSlotId ? model.frames.find((frame) => frame.slotId === cropSlotId) : undefined
  $: cropContent = cropFrame ? page.slots[cropFrame.slotId] : null
  $: cropAsset = cropContent ? assets[cropContent.assetId] : undefined
  $: cropImage = cropContent ? getImage(cropContent.assetId, imageRevision) : undefined
  $: cropPlacement =
    cropFrame && cropContent && cropAsset
      ? resolveCoverPlacement(
          cropFrame.width,
          cropFrame.height,
          cropAsset.width,
          cropAsset.height,
          cropContent.placement,
        )
      : undefined
  $: fittedZoom = Math.min(
    (viewportWidth - 48) / page.width,
    (viewportHeight - 48) / page.height,
    1,
  )
  $: fitScale = fitToViewport ? fittedZoom : viewportZoom
  $: onfitzoomchange(fittedZoom)
  $: stageWidth = Math.max(viewportWidth, Math.ceil(page.width * fitScale + 48))
  $: stageHeight = Math.max(viewportHeight, Math.ceil(page.height * fitScale + 48))
  $: stageX = Math.max(24, (stageWidth - page.width * fitScale) / 2)
  $: stageY = Math.max(24, (stageHeight - page.height * fitScale) / 2)

  onMount(() => {
    const resize = () => {
      const bounds = host.getBoundingClientRect()
      viewportWidth = Math.max(1, Math.floor(bounds.width))
      viewportHeight = Math.max(1, Math.floor(bounds.height))
    }
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()
    const cancelDrag = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragSourceSlotId) {
        frameDragCancelled = true
        dragSourceSlotId = null
        dragTargetSlotId = null
        event.preventDefault()
      }
    }
    globalThis.addEventListener('keydown', cancelDrag)
    return () => {
      resizeObserver?.disconnect()
      globalThis.removeEventListener('keydown', cancelDrag)
    }
  })
</script>

<div
  class="canvas-host"
  bind:this={host}
  aria-label="Collage canvas"
  role="region"
  data-stage-x={stageX}
  data-stage-y={stageY}
  data-fit-scale={fitScale}
  data-image-revision={imageRevision}
  data-divider-hitboxes={JSON.stringify(
    displayDividers.map(({ axis, x, y, width, height }) => ({ axis, x, y, width, height })),
  )}
  ondragover={(event) => event.preventDefault()}
  ondrop={dropAsset}
>
  <Stage
    width={stageWidth}
    height={stageHeight}
    onwheel={handleWheel}
    onpointermove={previewSideZoom}
    onpointerup={() => (sideCropDrag = null)}
  >
    <CanvasPageLayer
      {viewportWidth}
      {viewportHeight}
      {darkMode}
      {stageX}
      {stageY}
      {fitScale}
      {page}
      {model}
      {assets}
      {imageRevision}
      {cropSlotId}
      {selectedSlotId}
      {dragTargetSlotId}
      {displayDividers}
      {dividers}
      bind:hoveredDividerKey
      bind:activeDividerKey
      {getImage}
      {onexitcrop}
      {onselect}
      {onrequestimage}
      {polygonPoints}
      {roundedClip}
      {cropDragBound}
      {selectOrCropFrame}
      {commitPan}
      {beginFrameDrag}
      {previewFrameDrag}
      {endFrameDrag}
      {dividerKey}
      {linkedDividers}
      {setCursor}
      {commitDivider}
    ></CanvasPageLayer>
    {#if cropFrame && cropContent && cropImage && cropPlacement}
      <CropOverlay
        frame={cropFrame}
        content={cropContent}
        image={cropImage}
        placement={cropPlacement}
        {stageX}
        {stageY}
        {fitScale}
        cornerRadius={model.cornerRadius}
        {commitPan}
        {cropDragBound}
        {roundedClip}
        {polygonPoints}
        {setCursor}
        {beginSideZoom}
        {cornerDragBound}
        {previewCornerZoom}
      ></CropOverlay>
    {/if}
  </Stage>
  <div class="canvas-frame-controls" aria-label="Collage frames">
    {#each model.frames as frame, index (frame.slotId)}
      {@const content = page.slots[frame.slotId]}
      {@const asset = content ? assets[content.assetId] : undefined}
      <button
        type="button"
        aria-pressed={selectedSlotId === frame.slotId}
        aria-label={`Frame ${index + 1}, ${asset ? asset.originalName : 'empty'}`}
        aria-keyshortcuts={content ? 'Enter Delete' : undefined}
        onclick={() =>
          content ? selectFrameControl(frame.slotId, index) : onrequestimage(frame.slotId)}
      >
        Frame {index + 1}: {asset ? asset.originalName : 'Empty — add an image'}
      </button>
    {/each}
  </div>
  {#if keyboardDividers.length}
    <div
      class="canvas-keyboard-controls canvas-divider-controls"
      role="group"
      aria-label="Layout dividers"
    >
      {#each keyboardDividers as divider (dividerKey(divider))}
        {@const name = dividerName(divider)}
        <button
          type="button"
          role="slider"
          aria-label={name}
          aria-orientation={divider.axis === 'x' ? 'horizontal' : 'vertical'}
          aria-valuemin="5"
          aria-valuemax="95"
          aria-valuenow={dividerPercent(divider)}
          aria-valuetext={`${dividerPercent(divider)} percent`}
          aria-keyshortcuts={divider.axis === 'x'
            ? 'ArrowLeft ArrowRight PageUp PageDown Home End'
            : 'ArrowUp ArrowDown PageUp PageDown Home End'}
          onkeydown={(event) => adjustDividerWithKeyboard(event, divider)}
        >
          {name}: {dividerPercent(divider)}%. Use arrow keys to adjust.
        </button>
      {/each}
    </div>
  {/if}
  {#if cropSlotId && cropContent}
    <div
      class="canvas-keyboard-controls canvas-crop-controls"
      role="group"
      aria-label="Crop controls"
    >
      <button
        type="button"
        aria-label="Move crop image left"
        onkeydown={stopCanvasShortcut}
        onclick={() => nudgeCrop('positionX', 0.05, 'left')}>Move crop image left</button
      >
      <button
        type="button"
        aria-label="Move crop image right"
        onkeydown={stopCanvasShortcut}
        onclick={() => nudgeCrop('positionX', -0.05, 'right')}>Move crop image right</button
      >
      <button
        type="button"
        aria-label="Move crop image up"
        onkeydown={stopCanvasShortcut}
        onclick={() => nudgeCrop('positionY', 0.05, 'up')}>Move crop image up</button
      >
      <button
        type="button"
        aria-label="Move crop image down"
        onkeydown={stopCanvasShortcut}
        onclick={() => nudgeCrop('positionY', -0.05, 'down')}>Move crop image down</button
      >
      <button
        type="button"
        aria-label="Zoom crop image in"
        onkeydown={stopCanvasShortcut}
        onclick={() => adjustCropZoom(1.05)}>Zoom crop image in</button
      >
      <button
        type="button"
        aria-label="Zoom crop image out"
        onkeydown={stopCanvasShortcut}
        onclick={() => adjustCropZoom(1 / 1.05)}>Zoom crop image out</button
      >
    </div>
  {/if}
</div>
