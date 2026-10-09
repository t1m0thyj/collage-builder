<script lang="ts">
  import { Circle, Group, Image, Layer, Line, Rect } from 'svelte-konva'
  import type { SceneContext } from 'konva/lib/Context'
  import { createPageRenderModel } from '../../render/pageRenderer'
  import { resolveCoverPlacement, rotatedImageGeometry } from '../../domain/crop'
  import type { SlotContentV1 } from '../../domain/types'

  type Frame = ReturnType<typeof createPageRenderModel>['frames'][number]
  type Placement = ReturnType<typeof resolveCoverPlacement>

  export let frame: Frame
  export let content: SlotContentV1
  export let image: HTMLImageElement
  export let placement: Placement
  export let stageX: number
  export let stageY: number
  export let fitScale: number
  export let cornerRadius: number
  type StagePointerEvent = {
    target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
  }

  export let beginPan: (
    event: StagePointerEvent,
    frame: Frame,
    placement: Placement,
    content: SlotContentV1,
    slotId: string,
  ) => void
  export let previewPan: (event: StagePointerEvent) => void
  export let finishPan: (event: StagePointerEvent) => void
  export let cropDragBound: (
    position: { x: number; y: number },
    frame: Frame,
    placement: Placement,
  ) => { x: number; y: number }
  export let roundedClip: (
    x: number,
    y: number,
    width: number,
    height: number,
    polygon?: { x: number; y: number }[],
  ) => (context: SceneContext) => void
  export let polygonPoints: (frame: Frame) => number[]
  export let setCursor: (
    event: { target: { getStage(): { container(): HTMLDivElement } | null } },
    cursor: string,
  ) => void
  export let beginSideZoom: (
    event: {
      target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
    },
    placement: Placement,
    content: SlotContentV1,
    slotId: string,
    directionX: number,
    directionY: number,
  ) => void
  export let cornerDragBound: (
    position: { x: number; y: number },
    frame: Frame,
    placement: Placement,
    content: SlotContentV1,
    cornerX: number,
    cornerY: number,
  ) => { x: number; y: number }
  export let beginCornerZoom: (
    event: StagePointerEvent,
    frame: Frame,
    placement: Placement,
    content: SlotContentV1,
    slotId: string,
    cornerX: number,
    cornerY: number,
  ) => void
  export let previewCornerZoom: (event: StagePointerEvent) => void
  export let finishCornerZoom: (event: StagePointerEvent) => void
  type Bounds = { x: number; y: number; width: number; height: number }

  function edgeHitboxes(bounds: Bounds, hitSize: number) {
    return [
      {
        x: bounds.x,
        y: bounds.y - hitSize / 2,
        width: bounds.width,
        height: hitSize,
        cursor: 'ns-resize',
        directionX: 0,
        directionY: -1,
      },
      {
        x: bounds.x,
        y: bounds.y + bounds.height - hitSize / 2,
        width: bounds.width,
        height: hitSize,
        cursor: 'ns-resize',
        directionX: 0,
        directionY: 1,
      },
      {
        x: bounds.x - hitSize / 2,
        y: bounds.y,
        width: hitSize,
        height: bounds.height,
        cursor: 'ew-resize',
        directionX: -1,
        directionY: 0,
      },
      {
        x: bounds.x + bounds.width - hitSize / 2,
        y: bounds.y,
        width: hitSize,
        height: bounds.height,
        cursor: 'ew-resize',
        directionX: 1,
        directionY: 0,
      },
    ]
  }

  $: imageGeometry = rotatedImageGeometry(placement, content.placement)
  $: imageBounds = {
    x: frame.x + placement.x,
    y: frame.y + placement.y,
    width: placement.width,
    height: placement.height,
  }
  // Keep handles and their hit areas usable at every canvas zoom.
  $: handleRadius = 5 / fitScale
  $: imageEdges = edgeHitboxes(imageBounds, 16 / fitScale)
  $: frameEdges = edgeHitboxes(frame, 16 / fitScale)
</script>

<Layer>
  <Group x={stageX} y={stageY} scaleX={fitScale} scaleY={fitScale}>
    <Image
      {image}
      x={frame.x + imageGeometry.x}
      y={frame.y + imageGeometry.y}
      width={imageGeometry.width}
      height={imageGeometry.height}
      offsetX={imageGeometry.offsetX}
      offsetY={imageGeometry.offsetY}
      rotation={imageGeometry.rotation}
      scaleX={imageGeometry.scaleX}
      scaleY={imageGeometry.scaleY}
      draggable
      dragBoundFunc={(position) => cropDragBound(position, frame, placement)}
      onpointerenter={(event) => setCursor(event, 'grab')}
      onpointerleave={(event) => setCursor(event, 'default')}
      onpointerdown={(event) => beginPan(event, frame, placement, content, frame.slotId)}
      ondragstart={(event) => setCursor(event, 'grabbing')}
      ondragmove={previewPan}
      ondragend={(event) => {
        finishPan(event)
        setCursor(event, 'grab')
      }}
    />
    <Rect
      x={imageBounds.x}
      y={imageBounds.y}
      width={imageBounds.width}
      height={imageBounds.height}
      fill="rgba(31,35,41,0.5)"
      listening={false}
    />
    <Group clipFunc={roundedClip(frame.x, frame.y, frame.width, frame.height, frame.polygon)}
      ><Image
        {image}
        x={frame.x + imageGeometry.x}
        y={frame.y + imageGeometry.y}
        width={imageGeometry.width}
        height={imageGeometry.height}
        offsetX={imageGeometry.offsetX}
        offsetY={imageGeometry.offsetY}
        rotation={imageGeometry.rotation}
        scaleX={imageGeometry.scaleX}
        scaleY={imageGeometry.scaleY}
        draggable
        dragBoundFunc={(position) => cropDragBound(position, frame, placement)}
        onpointerenter={(event) => setCursor(event, 'grab')}
        onpointerleave={(event) => setCursor(event, 'default')}
        onpointerdown={(event) => beginPan(event, frame, placement, content, frame.slotId)}
        ondragstart={(event) => setCursor(event, 'grabbing')}
        ondragmove={previewPan}
        ondragend={(event) => {
          finishPan(event)
          setCursor(event, 'grab')
        }}
      /></Group
    >
    {#each [{ color: '#343A40', width: 4 }, { color: '#00FF00', width: 2 }] as outline (outline.color)}
      <Rect
        x={imageBounds.x}
        y={imageBounds.y}
        width={imageBounds.width}
        height={imageBounds.height}
        stroke={outline.color}
        strokeWidth={outline.width}
        strokeScaleEnabled={false}
        listening={false}
      />
    {/each}
    {#each [{ color: '#343A40', width: 3 }, { color: '#00FF00', width: 1 }] as outline (outline.color)}
      {#if frame.polygon}<Line
          points={polygonPoints(frame)}
          closed
          stroke={outline.color}
          strokeWidth={outline.width}
          strokeScaleEnabled={false}
          listening={false}
        />{:else}<Rect
          x={frame.x}
          y={frame.y}
          width={frame.width}
          height={frame.height}
          {cornerRadius}
          stroke={outline.color}
          strokeWidth={outline.width}
          strokeScaleEnabled={false}
          listening={false}
        />{/if}
    {/each}
    {#each [...imageEdges, ...frameEdges] as side, index (index)}<Rect
        x={side.x}
        y={side.y}
        width={side.width}
        height={side.height}
        fill="rgba(0, 0, 0, 0.01)"
        onpointerenter={(event) => setCursor(event, side.cursor)}
        onpointerleave={(event) => setCursor(event, 'default')}
        onpointerdown={(event) =>
          beginSideZoom(event, placement, content, frame.slotId, side.directionX, side.directionY)}
      />{/each}
    {#each imageEdges as side, index (index)}
      {#each [{ color: '#343A40', width: 3 }, { color: '#00FF00', width: 1.5 }] as outline (outline.color)}
        <Rect
          x={side.x + side.width / 2 - (side.directionX ? 3 : 6) / fitScale}
          y={side.y + side.height / 2 - (side.directionX ? 6 : 3) / fitScale}
          width={(side.directionX ? 6 : 12) / fitScale}
          height={(side.directionX ? 12 : 6) / fitScale}
          cornerRadius={2 / fitScale}
          fill="#FFFFFF"
          stroke={outline.color}
          strokeWidth={outline.width}
          strokeScaleEnabled={false}
          listening={false}
        />
      {/each}
    {/each}
    {#each [[0, 0], [1, 0], [0, 1], [1, 1]] as corner (corner.join('-'))}
      <Circle
        x={imageBounds.x + corner[0] * imageBounds.width}
        y={imageBounds.y + corner[1] * imageBounds.height}
        radius={handleRadius}
        fill="#FFFFFF"
        stroke="#343A40"
        strokeWidth={3}
        strokeScaleEnabled={false}
        listening={false}
      />
      <Circle
        x={imageBounds.x + corner[0] * imageBounds.width}
        y={imageBounds.y + corner[1] * imageBounds.height}
        radius={handleRadius}
        fill="#FFFFFF"
        stroke="#00FF00"
        strokeWidth={1.5}
        strokeScaleEnabled={false}
        hitStrokeWidth={14}
        draggable
        onpointerdown={(event) =>
          beginCornerZoom(event, frame, placement, content, frame.slotId, corner[0], corner[1])}
        onpointerenter={(event) =>
          setCursor(event, corner[0] === corner[1] ? 'nwse-resize' : 'nesw-resize')}
        onpointerleave={(event) => setCursor(event, 'default')}
        dragBoundFunc={(position) =>
          cornerDragBound(position, frame, placement, content, corner[0], corner[1])}
        ondragmove={previewCornerZoom}
        ondragend={finishCornerZoom}
      />
    {/each}
  </Group>
</Layer>
