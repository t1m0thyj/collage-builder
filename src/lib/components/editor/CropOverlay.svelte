<script lang="ts">
  import { Circle, Group, Image, Layer, Line, Rect } from 'svelte-konva'
  import type { SceneContext } from 'konva/lib/Context'
  import { createPageRenderModel } from '../../render/pageRenderer'
  import { resolveCoverPlacement } from '../../domain/crop'
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
</script>

<Layer>
  <Group x={stageX} y={stageY} scaleX={fitScale} scaleY={fitScale}>
    <Image
      {image}
      x={frame.x + placement.x}
      y={frame.y + placement.y}
      width={placement.width}
      height={placement.height}
      draggable
      dragBoundFunc={(position) => cropDragBound(position, frame, placement)}
      onpointerdown={(event) => beginPan(event, frame, placement, content, frame.slotId)}
      ondragmove={previewPan}
      ondragend={finishPan}
    />
    <Rect
      x={frame.x + placement.x}
      y={frame.y + placement.y}
      width={placement.width}
      height={placement.height}
      fill="rgba(45,43,38,0.8)"
      listening={false}
    />
    <Group clipFunc={roundedClip(frame.x, frame.y, frame.width, frame.height, frame.polygon)}
      ><Image
        {image}
        x={frame.x + placement.x}
        y={frame.y + placement.y}
        width={placement.width}
        height={placement.height}
        draggable
        dragBoundFunc={(position) => cropDragBound(position, frame, placement)}
        onpointerdown={(event) => beginPan(event, frame, placement, content, frame.slotId)}
        ondragmove={previewPan}
        ondragend={finishPan}
      /></Group
    >
    {#if frame.polygon}<Line
        points={polygonPoints(frame)}
        closed
        stroke="#00FF00"
        strokeWidth={1}
        dash={[]}
        shadowColor="#5C3700"
        shadowOpacity={0.55}
        shadowBlur={3}
        listening={false}
      />{:else}<Rect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        {cornerRadius}
        stroke="#00FF00"
        strokeWidth={1}
        dash={[]}
        shadowColor="#5C3700"
        shadowOpacity={0.55}
        shadowBlur={3}
        listening={false}
      />{/if}
    <Rect
      x={frame.x + placement.x}
      y={frame.y + placement.y}
      width={placement.width}
      height={placement.height}
      stroke="#00FF00"
      strokeWidth={4}
      dash={[]}
      shadowColor="#5C3700"
      shadowOpacity={0.55}
      shadowBlur={3}
      listening={false}
    />
    {#each [{ x: frame.x + placement.x, y: frame.y + placement.y - 24, width: placement.width, height: 48, cursor: 'ns-resize', directionX: 0, directionY: -1 }, { x: frame.x + placement.x, y: frame.y + placement.y + placement.height - 24, width: placement.width, height: 48, cursor: 'ns-resize', directionX: 0, directionY: 1 }, { x: frame.x + placement.x - 24, y: frame.y + placement.y, width: 48, height: placement.height, cursor: 'ew-resize', directionX: -1, directionY: 0 }, { x: frame.x + placement.x + placement.width - 24, y: frame.y + placement.y, width: 48, height: placement.height, cursor: 'ew-resize', directionX: 1, directionY: 0 }] as side (side.cursor + side.x + side.y)}<Rect
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
    {#each [{ x: frame.x, y: frame.y - 24, width: frame.width, height: 48, cursor: 'ns-resize', directionX: 0, directionY: -1 }, { x: frame.x, y: frame.y + frame.height - 24, width: frame.width, height: 48, cursor: 'ns-resize', directionX: 0, directionY: 1 }, { x: frame.x - 24, y: frame.y, width: 48, height: frame.height, cursor: 'ew-resize', directionX: -1, directionY: 0 }, { x: frame.x + frame.width - 24, y: frame.y, width: 48, height: frame.height, cursor: 'ew-resize', directionX: 1, directionY: 0 }] as side (`frame-${side.cursor}-${side.x}-${side.y}`)}<Rect
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
    {#each [[0, 0], [1, 0], [0, 1], [1, 1]] as corner (corner.join('-'))}<Circle
        x={frame.x + placement.x + corner[0] * placement.width}
        y={frame.y + placement.y + corner[1] * placement.height}
        radius={8}
        fill="#00FF00"
        stroke="#00FF00"
        strokeWidth={1}
        hitStrokeWidth={32}
        shadowColor="#126B12"
        shadowOpacity={0.28}
        shadowBlur={2}
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
      />{/each}
  </Group>
</Layer>
