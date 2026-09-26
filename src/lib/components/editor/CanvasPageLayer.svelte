<script lang="ts">
  import { Circle, Group, Image, Layer, Line, Rect, Text } from 'svelte-konva'
  import type { SceneContext } from 'konva/lib/Context'
  import { resolveCoverPlacement } from '../../domain/crop'
  import { dividerCenter, type DividerSnapTarget } from '../../domain/dividerSnapping'
  import { resolveDividers } from '../../domain/geometry'
  import { createPageRenderModel } from '../../render/pageRenderer'
  import type { AssetId, AssetRecordV1, PageV1, SlotContentV1, SlotId } from '../../domain/types'

  type Model = ReturnType<typeof createPageRenderModel>
  type Frame = Model['frames'][number]
  type Divider = ReturnType<typeof resolveDividers>[number]
  type StagePointerEvent = {
    target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
  }
  type DividerPointerEvent = {
    evt?: { altKey?: boolean; shiftKey?: boolean }
    target: {
      x(): number
      y(): number
      getStage(): { getPointerPosition(): { x: number; y: number } | null } | null
    }
  }

  export let viewportWidth: number
  export let viewportHeight: number
  export let darkMode: boolean
  export let stageX: number
  export let stageY: number
  export let fitScale: number
  export let page: PageV1
  export let model: Model
  export let assets: Record<AssetId, AssetRecordV1>
  export let imageRevision: number
  export let cropSlotId: SlotId | null
  export let cropDraft: {
    pageId: string
    slotId: SlotId
    placement: SlotContentV1['placement']
  } | null
  export let selectedSlotId: SlotId | null
  export let dragTargetSlotId: SlotId | null
  export let displayDividers: Divider[]
  export let dividers: Divider[]
  export let hoveredDividerKey: string | null
  export let activeDividerKey: string | null
  export let snapTarget: DividerSnapTarget | null
  export let equalSizeAvailable: boolean
  export let getImage: (assetId: AssetId, revision?: number) => HTMLImageElement | undefined
  export let onexitcrop: () => void
  export let onselect: (slotId: SlotId) => void
  export let onrequestimage: (slotId: SlotId) => void
  export let polygonPoints: (frame: Frame) => number[]
  export let roundedClip: (
    x: number,
    y: number,
    width: number,
    height: number,
    polygon?: { x: number; y: number }[],
  ) => (context: SceneContext) => void
  export let cropDragBound: (
    position: { x: number; y: number },
    frame: Frame,
    placement: ReturnType<typeof resolveCoverPlacement>,
  ) => { x: number; y: number }
  export let selectOrCropFrame: (slotId: SlotId) => void
  export let beginPan: (
    event: StagePointerEvent,
    frame: { x: number; y: number },
    placement: ReturnType<typeof resolveCoverPlacement>,
    content: SlotContentV1,
    slotId: SlotId,
  ) => void
  export let previewPan: (event: StagePointerEvent) => void
  export let finishPan: (event: StagePointerEvent) => void
  export let beginFrameDrag: (slotId: SlotId) => void
  export let previewFrameDrag: (event: StagePointerEvent, sourceSlotId: SlotId) => void
  export let endFrameDrag: (event: StagePointerEvent, sourceSlotId: SlotId) => void
  export let dividerKey: (divider: Divider) => string
  export let setCursor: (
    event: { target: { getStage(): { container(): HTMLDivElement } | null } },
    cursor: string,
  ) => void
  export let beginDividerDrag: (event: DividerPointerEvent, divider: Divider) => void
  export let prepareDividerDrag: (event: DividerPointerEvent, divider: Divider) => void
  export let cancelPreparedDividerDrag: () => void
  export let previewDividerDrag: (event: DividerPointerEvent) => void
  export let commitDividerDrag: (event: DividerPointerEvent, divider: Divider) => void
  export let equalizeDivider: (divider: Divider) => void

  function frameEdge(frame: Frame, axis: Divider['axis'], edge: DividerSnapTarget['sourceEdge']) {
    if (axis === 'x') return edge === 'min' ? frame.x : frame.x + frame.width
    return edge === 'min' ? frame.y : frame.y + frame.height
  }

  function edgeLinePoints(
    frame: Frame,
    axis: Divider['axis'],
    edge: DividerSnapTarget['sourceEdge'],
  ) {
    const coordinate = frameEdge(frame, axis, edge)
    return axis === 'x'
      ? [coordinate, frame.y, coordinate, frame.y + frame.height]
      : [frame.x, coordinate, frame.x + frame.width, coordinate]
  }

  function bridgeLinePoints(
    source: Frame,
    target: Frame,
    axis: Divider['axis'],
    coordinate: number,
  ) {
    if (axis === 'x') {
      const start =
        source.y + source.height <= target.y ? source.y + source.height : target.y + target.height
      const end = source.y + source.height <= target.y ? target.y : source.y
      return [coordinate, start, coordinate, end]
    }
    const start =
      source.x + source.width <= target.x ? source.x + source.width : target.x + target.width
    const end = source.x + source.width <= target.x ? target.x : source.x
    return [start, coordinate, end, coordinate]
  }
</script>

<Layer>
  <Rect
    width={viewportWidth}
    height={viewportHeight}
    fill={darkMode ? '#1C1C1C' : '#E8E6E0'}
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
      {@const persistedContent = page.slots[frame.slotId]}
      {@const content =
        persistedContent && cropDraft?.pageId === page.id && cropDraft.slotId === frame.slotId
          ? { ...persistedContent, placement: cropDraft.placement }
          : persistedContent}
      {@const asset = content ? assets[content.assetId] : undefined}
      {@const image = content ? getImage(content.assetId, imageRevision) : undefined}
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
          <Group clipFunc={roundedClip(frame.x, frame.y, frame.width, frame.height, frame.polygon)}>
            <Image
              {image}
              x={frame.x + placement.x}
              y={frame.y + placement.y}
              width={placement.width}
              height={placement.height}
              draggable={cropSlotId === frame.slotId}
              dragBoundFunc={(position) => cropDragBound(position, frame, placement)}
              onpointerclick={() => selectOrCropFrame(frame.slotId)}
              onpointerdown={(event) => {
                if (cropSlotId === frame.slotId)
                  beginPan(event, frame, placement, content!, frame.slotId)
              }}
              ondragmove={(event) => {
                if (cropSlotId === frame.slotId) previewPan(event)
              }}
              ondragend={(event) => {
                if (cropSlotId === frame.slotId) finishPan(event)
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
    {@const snapSource = snapTarget
      ? model.frames.find((frame) => frame.slotId === snapTarget?.sourceSlotId)
      : undefined}
    {@const snapDestination = snapTarget
      ? model.frames.find((frame) => frame.slotId === snapTarget?.targetSlotId)
      : undefined}
    {@const draggedDivider = activeDividerKey
      ? dividers.find((divider) => dividerKey(divider) === activeDividerKey)
      : undefined}
    {#if snapTarget && snapSource && snapDestination && draggedDivider}
      {#if snapTarget.kind === 'edge'}
        {@const sourceCoordinate = frameEdge(
          snapSource,
          draggedDivider.axis,
          snapTarget.sourceEdge,
        )}
        <Line
          points={edgeLinePoints(snapSource, draggedDivider.axis, snapTarget.sourceEdge)}
          stroke="#61A16A"
          strokeWidth={4}
          listening={false}
        />
        <Line
          points={edgeLinePoints(snapDestination, draggedDivider.axis, snapTarget.targetEdge)}
          stroke="#61A16A"
          strokeWidth={4}
          listening={false}
        />
        <Line
          points={bridgeLinePoints(
            snapSource,
            snapDestination,
            draggedDivider.axis,
            sourceCoordinate,
          )}
          stroke="#61A16A"
          strokeWidth={4}
          dash={[7, 5]}
          listening={false}
        />
        <Text
          x={draggedDivider.axis === 'x'
            ? sourceCoordinate + 10
            : Math.min(snapSource.x, snapDestination.x)}
          y={draggedDivider.axis === 'x'
            ? Math.min(snapSource.y, snapDestination.y) + 12
            : sourceCoordinate - 29}
          text={snapTarget.label}
          fill="#315C9C"
          fontStyle="bold"
          fontSize={15}
          listening={false}
        />
      {:else}
        <Line
          points={draggedDivider.axis === 'x'
            ? [
                dividerCenter(draggedDivider),
                draggedDivider.y,
                dividerCenter(draggedDivider),
                draggedDivider.y + draggedDivider.height,
              ]
            : [
                draggedDivider.x,
                dividerCenter(draggedDivider),
                draggedDivider.x + draggedDivider.width,
                dividerCenter(draggedDivider),
              ]}
          stroke="#61A16A"
          strokeWidth={4}
          dash={[7, 5]}
          listening={false}
        />
        <Text
          x={draggedDivider.axis === 'x'
            ? dividerCenter(draggedDivider) + 10
            : draggedDivider.x + 12}
          y={draggedDivider.axis === 'x'
            ? draggedDivider.y + 12
            : dividerCenter(draggedDivider) - 29}
          text={snapTarget.label}
          fill="#315C9C"
          fontStyle="bold"
          fontSize={15}
          listening={false}
        />
      {/if}
    {/if}
    {#if equalSizeAvailable && !snapTarget && draggedDivider}
      <Text
        x={draggedDivider.axis === 'x' ? dividerCenter(draggedDivider) + 10 : draggedDivider.x + 12}
        y={draggedDivider.axis === 'x' ? draggedDivider.y + 12 : dividerCenter(draggedDivider) - 29}
        text="Hold Shift to equalize"
        fill="#315C9C"
        opacity={0.8}
        fontSize={14}
        listening={false}
      />
    {/if}
    {#each displayDividers as divider (dividerKey(divider))}
      {@const key = dividerKey(divider)}
      {@const active = (activeDividerKey ?? hoveredDividerKey) === key}
      <Rect
        x={divider.x}
        y={divider.y}
        width={divider.width}
        height={divider.height}
        fill="rgba(49,92,156,0.01)"
        listening={!cropSlotId}
        draggable={!cropSlotId}
        onpointerdown={(event) => prepareDividerDrag(event, divider)}
        ondblclick={() => equalizeDivider(divider)}
        onpointerup={cancelPreparedDividerDrag}
        onpointercancel={cancelPreparedDividerDrag}
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
          beginDividerDrag(event, divider)
          setCursor(event, divider.axis === 'x' ? 'col-resize' : 'row-resize')
        }}
        ondragmove={(event) => previewDividerDrag(event)}
        ondragend={(event) => {
          commitDividerDrag(event, divider)
          activeDividerKey = null
          setCursor(event, 'default')
        }}
      />
      {#if active}<Rect
          x={divider.axis === 'x' ? divider.x + divider.width / 2 - 2 : divider.x}
          y={divider.axis === 'x' ? divider.y : divider.y + divider.height / 2 - 2}
          width={divider.axis === 'x' ? 4 : divider.width}
          height={divider.axis === 'x' ? divider.height : 4}
          fill="#315C9C"
          opacity={0.85}
          listening={false}
        />{/if}
    {/each}
  </Group>
</Layer>
