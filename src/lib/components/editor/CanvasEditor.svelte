<script lang="ts">
  import { onMount } from 'svelte'
  import { Circle, Group, Image, Layer, Line, Rect, Stage, Text } from 'svelte-konva'
  import type { SceneContext } from 'konva/lib/Context'
  import { panPlacement, resolveCoverPlacement, zoomPlacement } from '../../domain/crop'
  import { resolveDividers } from '../../domain/geometry'
  import { createPageRenderModel } from '../../render/pageRenderer'
  import type { AssetId, AssetRecordV1, PageV1, SlotContentV1, SlotId } from '../../domain/types'

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
  export let onfitzoomchange: (zoom: number) => void = () => undefined
  export let onrequestcrop: (slotId: SlotId) => void
  export let onviewportzoom: (factor: number) => void
  export let onexitcrop: () => void
  export let getImage: (assetId: AssetId) => HTMLImageElement | undefined
  export let assets: Record<AssetId, AssetRecordV1>

  let host: HTMLDivElement
  let viewportWidth = 600
  let viewportHeight = 500
  let resizeObserver: ResizeObserver | undefined
  let hoveredDividerKey: string | null = null
  let activeDividerKey: string | null = null
  let dragSourceSlotId: SlotId | null = null
  let dragTargetSlotId: SlotId | null = null
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
    event: { target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null } },
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
    const zoom =
      sideCropDrag.placement.zoom * (1 + (2 * outwardDelta) / sideCropDrag.dimension)
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
    const x = (event.clientX - bounds.left - stageX) / fitScale
    const y = (event.clientY - bounds.top - stageY) / fitScale
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
  $: cropFrame = cropSlotId ? model.frames.find((frame) => frame.slotId === cropSlotId) : undefined
  $: cropContent = cropFrame ? page.slots[cropFrame.slotId] : null
  $: cropAsset = cropContent ? assets[cropContent.assetId] : undefined
  $: cropImage = cropContent ? getImage(cropContent.assetId) : undefined
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
    (viewportWidth - 96) / page.width,
    (viewportHeight - 96) / page.height,
    1,
  )
  $: fitScale = fitToViewport ? fittedZoom : viewportZoom
  $: onfitzoomchange(fittedZoom)
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
    const cancelDrag = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragSourceSlotId) {
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
  ondragover={(event) => event.preventDefault()}
  ondrop={dropAsset}
>
  <Stage
    width={viewportWidth}
    height={viewportHeight}
    onwheel={handleWheel}
    onpointermove={previewSideZoom}
    onpointerup={() => (sideCropDrag = null)}
  >
    <Layer>
      <Rect
        width={viewportWidth}
        height={viewportHeight}
        fill="#E8E6E0"
        onpointerclick={onexitcrop}
      />
      <Group x={stageX} y={stageY} scaleX={fitScale} scaleY={fitScale}>
        <Rect
          width={page.width}
          height={page.height}
          fill={page.style.transparentBackground ? 'rgba(0,0,0,0)' : page.style.backgroundColor}
          onpointerclick={onexitcrop}
        />

        {#each model.frames as frame, index (frame.slotId)}
          {@const content = page.slots[frame.slotId]}
          {@const asset = content ? assets[content.assetId] : undefined}
          {@const image = content ? getImage(content.assetId) : undefined}
          {@const placement =
            content && asset
              ? resolveCoverPlacement(
                  frame.width,
                  frame.height,
                  asset.width,
                  asset.height,
                  content.placement,
                )
              : undefined}
          <Group>
            {#if frame.polygon}<Line
                points={polygonPoints(frame)}
                closed
                fill="#E5E2D9"
                shadowColor={page.style.shadow.color}
                shadowOpacity={page.style.shadow.enabled ? page.style.shadow.opacity : 0}
                shadowBlur={page.style.shadow.blur}
                shadowOffsetX={page.style.shadow.offsetX}
                shadowOffsetY={page.style.shadow.offsetY}
                onpointerclick={() => onselect(frame.slotId)}
              />{:else}<Rect
                x={frame.x}
                y={frame.y}
                width={frame.width}
                height={frame.height}
                cornerRadius={model.cornerRadius}
                fill="#E5E2D9"
                shadowColor={page.style.shadow.color}
                shadowOpacity={page.style.shadow.enabled ? page.style.shadow.opacity : 0}
                shadowBlur={page.style.shadow.blur}
                shadowOffsetX={page.style.shadow.offsetX}
                shadowOffsetY={page.style.shadow.offsetY}
                onpointerclick={() => onselect(frame.slotId)}
              />{/if}
            {#if image && placement}
              <Group
                clipFunc={roundedClip(frame.x, frame.y, frame.width, frame.height, frame.polygon)}
              >
                <Image
                  {image}
                  x={frame.x + placement.x}
                  y={frame.y + placement.y}
                  width={placement.width}
                  height={placement.height}
                  draggable={cropSlotId === frame.slotId}
                  dragBoundFunc={(position) => cropDragBound(position, frame, placement)}
                  onpointerclick={() => selectOrCropFrame(frame.slotId)}
                  ondragmove={(event) => {
                    if (cropSlotId === frame.slotId)
                      commitPan(event, frame, placement, content!, frame.slotId)
                  }}
                  ondragend={(event) => {
                    if (cropSlotId === frame.slotId)
                      commitPan(event, frame, placement, content!, frame.slotId)
                  }}
                />
              </Group>
              {#if !cropSlotId}<Rect
                  x={frame.x}
                  y={frame.y}
                  width={frame.width}
                  height={frame.height}
                  cornerRadius={model.cornerRadius}
                  fill="rgba(49,92,156,0.01)"
                  draggable
                  dragBoundFunc={() => ({ x: frame.x, y: frame.y })}
                  onpointerclick={() => selectOrCropFrame(frame.slotId)}
                  ondragstart={() => beginFrameDrag(frame.slotId)}
                  ondragmove={(event) => previewFrameDrag(event, frame.slotId)}
                  ondragend={(event) => endFrameDrag(event, frame.slotId)}
                />{/if}
            {:else}
              <Circle
                x={frame.x + frame.width / 2}
                y={frame.y + frame.height / 2}
                radius={27}
                fill="#315C9C"
                onpointerclick={() => onrequestimage(frame.slotId)}
              />
              <Text
                x={frame.x + frame.width / 2 - 14}
                y={frame.y + frame.height / 2 - 16}
                width={28}
                text="+"
                align="center"
                fill="#FFFFFF"
                fontStyle="bold"
                fontSize={31}
                listening={false}
              />
            {/if}
            {#if selectedSlotId === frame.slotId || cropSlotId === frame.slotId}
              {#if frame.polygon}<Line
                  points={polygonPoints(frame)}
                  closed
                  stroke={cropSlotId === frame.slotId ? '#00FF00' : '#315C9C'}
                  strokeWidth={cropSlotId === frame.slotId ? 4 : 3}
                  dash={[]}
                  shadowColor={cropSlotId === frame.slotId ? '#5C3700' : undefined}
                  shadowOpacity={cropSlotId === frame.slotId ? 0.55 : 0}
                  shadowBlur={cropSlotId === frame.slotId ? 3 : 0}
                  listening={false}
                />{:else}<Rect
                  x={frame.x}
                  y={frame.y}
                  width={frame.width}
                  height={frame.height}
                  cornerRadius={model.cornerRadius}
                  stroke={cropSlotId === frame.slotId ? '#00FF00' : '#315C9C'}
                  strokeWidth={cropSlotId === frame.slotId ? 4 : 3}
                  dash={[]}
                  shadowColor={cropSlotId === frame.slotId ? '#5C3700' : undefined}
                  shadowOpacity={cropSlotId === frame.slotId ? 0.55 : 0}
                  shadowBlur={cropSlotId === frame.slotId ? 3 : 0}
                  listening={false}
                />{/if}
            {/if}
            {#if selectedSlotId === frame.slotId}
              <Text
                x={frame.x + 16}
                y={frame.y + 16}
                text={`Frame ${index + 1}`}
                fill="#315C9C"
                fontStyle="bold"
                fontSize={15}
              />
            {/if}
            {#if dragTargetSlotId === frame.slotId}
              <Rect
                x={frame.x}
                y={frame.y}
                width={frame.width}
                height={frame.height}
                cornerRadius={model.cornerRadius}
                stroke="#61A16A"
                strokeWidth={5}
                dash={[10, 6]}
                listening={false}
              />
            {/if}
          </Group>
        {/each}
        {#each displayDividers as divider (dividerKey(divider))}
          {@const key = dividerKey(divider)}
          {@const activeKey = activeDividerKey ?? hoveredDividerKey}
          {@const activeDivider = activeKey
            ? dividers.find((candidate) => dividerKey(candidate) === activeKey)
            : undefined}
          {@const linked = activeDivider ? linkedDividers(activeDivider) : []}
          {@const active = linked.some((candidate) => dividerKey(candidate) === key)}
          {@const lead = linked[0]}
          <Rect
            x={divider.x}
            y={divider.y}
            width={divider.width}
            height={divider.height}
            fill="rgba(49,92,156,0.01)"
            listening={!cropSlotId}
            draggable={!cropSlotId}
            onpointerenter={(event) => {
              hoveredDividerKey = key
              setCursor(event, divider.axis === 'x' ? 'col-resize' : 'row-resize')
            }}
            onpointerleave={(event) => {
              if (activeDividerKey !== key) hoveredDividerKey = null
              setCursor(event, 'default')
            }}
            ondragstart={(event) => {
              activeDividerKey = key
              hoveredDividerKey = key
              setCursor(event, divider.axis === 'x' ? 'col-resize' : 'row-resize')
            }}
            ondragend={(event) => {
              commitDivider(event, divider)
              activeDividerKey = null
              setCursor(event, 'default')
            }}
          />
          {#if active && lead && key === dividerKey(lead)}<Rect
              x={divider.axis === 'x'
                ? divider.x + divider.width / 2 - 2
                : Math.min(...linked.map((candidate) => candidate.x))}
              y={divider.axis === 'x'
                ? Math.min(...linked.map((candidate) => candidate.y))
                : divider.y + divider.height / 2 - 2}
              width={divider.axis === 'x'
                ? 4
                : Math.max(...linked.map((candidate) => candidate.x + candidate.width)) -
                  Math.min(...linked.map((candidate) => candidate.x))}
              height={divider.axis === 'x'
                ? Math.max(...linked.map((candidate) => candidate.y + candidate.height)) -
                  Math.min(...linked.map((candidate) => candidate.y))
                : 4}
              fill="#315C9C"
              opacity={0.85}
              listening={false}
            />{/if}
        {/each}
      </Group>
    </Layer>
    {#if cropFrame && cropContent && cropImage && cropPlacement}
      <Layer>
        <Group x={stageX} y={stageY} scaleX={fitScale} scaleY={fitScale}>
          <Image
            image={cropImage}
            x={cropFrame.x + cropPlacement.x}
            y={cropFrame.y + cropPlacement.y}
            width={cropPlacement.width}
            height={cropPlacement.height}
            draggable
            dragBoundFunc={(position) => cropDragBound(position, cropFrame!, cropPlacement!)}
            ondragmove={(event) =>
              commitPan(event, cropFrame!, cropPlacement!, cropContent!, cropFrame!.slotId)}
            ondragend={(event) =>
              commitPan(event, cropFrame!, cropPlacement!, cropContent!, cropFrame!.slotId)}
          />
          <Rect
            x={cropFrame.x + cropPlacement.x}
            y={cropFrame.y + cropPlacement.y}
            width={cropPlacement.width}
            height={cropPlacement.height}
            fill="rgba(45,43,38,0.8)"
            listening={false}
          />
          <Group
            clipFunc={roundedClip(
              cropFrame.x,
              cropFrame.y,
              cropFrame.width,
              cropFrame.height,
              cropFrame.polygon,
            )}
            ><Image
              image={cropImage}
              x={cropFrame.x + cropPlacement.x}
              y={cropFrame.y + cropPlacement.y}
              width={cropPlacement.width}
              height={cropPlacement.height}
              draggable
              dragBoundFunc={(position) => cropDragBound(position, cropFrame!, cropPlacement!)}
              ondragmove={(event) =>
                commitPan(event, cropFrame!, cropPlacement!, cropContent!, cropFrame!.slotId)}
              ondragend={(event) =>
                commitPan(event, cropFrame!, cropPlacement!, cropContent!, cropFrame!.slotId)}
            /></Group
          >
          {#if cropFrame.polygon}<Line
              points={polygonPoints(cropFrame)}
              closed
              stroke="#00FF00"
              strokeWidth={1}
              dash={[]}
              shadowColor="#5C3700"
              shadowOpacity={0.55}
              shadowBlur={3}
              listening={false}
            />{:else}<Rect
              x={cropFrame.x}
              y={cropFrame.y}
              width={cropFrame.width}
              height={cropFrame.height}
              cornerRadius={model.cornerRadius}
              stroke="#00FF00"
              strokeWidth={1}
              dash={[]}
              shadowColor="#5C3700"
              shadowOpacity={0.55}
              shadowBlur={3}
              listening={false}
            />{/if}
          <Rect
            x={cropFrame.x + cropPlacement.x}
            y={cropFrame.y + cropPlacement.y}
            width={cropPlacement.width}
            height={cropPlacement.height}
            stroke="#00FF00"
            strokeWidth={4}
            dash={[]}
            shadowColor="#5C3700"
            shadowOpacity={0.55}
            shadowBlur={3}
            listening={false}
          />
          {#each [{ x: cropFrame.x + cropPlacement.x, y: cropFrame.y + cropPlacement.y - 24, width: cropPlacement.width, height: 48, cursor: 'ns-resize', directionX: 0, directionY: -1 }, { x: cropFrame.x + cropPlacement.x, y: cropFrame.y + cropPlacement.y + cropPlacement.height - 24, width: cropPlacement.width, height: 48, cursor: 'ns-resize', directionX: 0, directionY: 1 }, { x: cropFrame.x + cropPlacement.x - 24, y: cropFrame.y + cropPlacement.y, width: 48, height: cropPlacement.height, cursor: 'ew-resize', directionX: -1, directionY: 0 }, { x: cropFrame.x + cropPlacement.x + cropPlacement.width - 24, y: cropFrame.y + cropPlacement.y, width: 48, height: cropPlacement.height, cursor: 'ew-resize', directionX: 1, directionY: 0 }] as side (side.cursor + side.x + side.y)}<Rect
              x={side.x}
              y={side.y}
              width={side.width}
              height={side.height}
              fill="rgba(0, 0, 0, 0.01)"
              onpointerenter={(event) => setCursor(event, side.cursor)}
              onpointerleave={(event) => setCursor(event, 'default')}
              onpointerdown={(event) =>
                beginSideZoom(
                  event,
                  cropPlacement!,
                  cropContent!,
                  cropFrame!.slotId,
                  side.directionX,
                  side.directionY,
                )}
            />{/each}
          {#each [{ x: cropFrame.x, y: cropFrame.y - 24, width: cropFrame.width, height: 48, cursor: 'ns-resize', directionX: 0, directionY: -1 }, { x: cropFrame.x, y: cropFrame.y + cropFrame.height - 24, width: cropFrame.width, height: 48, cursor: 'ns-resize', directionX: 0, directionY: 1 }, { x: cropFrame.x - 24, y: cropFrame.y, width: 48, height: cropFrame.height, cursor: 'ew-resize', directionX: -1, directionY: 0 }, { x: cropFrame.x + cropFrame.width - 24, y: cropFrame.y, width: 48, height: cropFrame.height, cursor: 'ew-resize', directionX: 1, directionY: 0 }] as side (`frame-${side.cursor}-${side.x}-${side.y}`)}<Rect
              x={side.x}
              y={side.y}
              width={side.width}
              height={side.height}
              fill="rgba(0, 0, 0, 0.01)"
              onpointerenter={(event) => setCursor(event, side.cursor)}
              onpointerleave={(event) => setCursor(event, 'default')}
              onpointerdown={(event) =>
                beginSideZoom(
                  event,
                  cropPlacement!,
                  cropContent!,
                  cropFrame!.slotId,
                  side.directionX,
                  side.directionY,
                )}
            />{/each}
          {#each [[0, 0], [1, 0], [0, 1], [1, 1]] as corner (corner.join('-'))}<Circle
              x={cropFrame.x + cropPlacement.x + corner[0] * cropPlacement.width}
              y={cropFrame.y + cropPlacement.y + corner[1] * cropPlacement.height}
              radius={8}
              fill="#00FF00"
              stroke="#00FF00"
              strokeWidth={1}
              hitStrokeWidth={32}
              shadowColor="#126B12"
              shadowOpacity={0.28}
              shadowBlur={2}
              draggable
              onpointerenter={(event) =>
                setCursor(event, corner[0] === corner[1] ? 'nwse-resize' : 'nesw-resize')}
              onpointerleave={(event) => setCursor(event, 'default')}
              dragBoundFunc={(position) =>
                cornerDragBound(
                  position,
                  cropFrame!,
                  cropPlacement!,
                  cropContent!,
                  corner[0],
                  corner[1],
                )}
              ondragmove={(event) =>
                previewCornerZoom(
                  event,
                  cropFrame!,
                  cropPlacement!,
                  cropContent!,
                  cropFrame!.slotId,
                  corner[0],
                  corner[1],
                )}
              ondragend={(event) =>
                previewCornerZoom(
                  event,
                  cropFrame!,
                  cropPlacement!,
                  cropContent!,
                  cropFrame!.slotId,
                  corner[0],
                  corner[1],
                )}
            />{/each}
        </Group>
      </Layer>
    {/if}
  </Stage>
</div>
