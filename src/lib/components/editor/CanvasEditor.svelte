<script lang="ts">
  import { onMount } from 'svelte'
  import { Stage } from 'svelte-konva'
  import type { SceneContext } from 'konva/lib/Context'
  import { panPlacement, resolveCoverPlacement, zoomPlacement } from '../../domain/crop'
  import {
    applyDividerChange,
    dividerCenter,
    dividerChangeForCoordinate,
    dividerKey,
    findDividerSnapTargets,
    type DividerChange,
    type DividerSnapTarget,
  } from '../../domain/dividerSnapping'
  import { resolveDividers } from '../../domain/geometry'
  import { createPageRenderModel } from '../../render/pageRenderer'
  import type { AssetId, AssetRecordV1, PageV1, SlotContentV1, SlotId } from '../../domain/types'
  import CropOverlay from './CropOverlay.svelte'
  import CanvasPageLayer from './CanvasPageLayer.svelte'

  type Divider = ReturnType<typeof resolveDividers>[number]
  type DividerPointerEvent = {
    evt?: { altKey?: boolean; shiftKey?: boolean }
    target: {
      x(): number
      y(): number
      getStage(): { getPointerPosition(): { x: number; y: number } | null } | null
    }
  }

  export let page: PageV1
  export let selectedSlotId: SlotId | null = null
  export let onselect: (slotId: SlotId) => void
  export let onrequestimage: (slotId: SlotId) => void
  export let cropSlotId: SlotId | null = null
  export let onplacementchange: (slotId: SlotId, placement: SlotContentV1['placement']) => void
  export let ondividerchange: (
    changes: Array<{ path: number[]; index: number; position: number }>,
  ) => void
  export let onequalizesplit: (path: number[]) => void
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
  let cropDraft: {
    pageId: string
    slotId: SlotId
    placement: SlotContentV1['placement']
  } | null = null
  let panCropDrag: {
    slotId: SlotId
    startX: number
    startY: number
    placement: SlotContentV1['placement']
    dimensions: ReturnType<typeof resolveCoverPlacement>
  } | null = null
  let cornerCropDrag: {
    slotId: SlotId
    startX: number
    startY: number
    directionX: number
    directionY: number
    placement: SlotContentV1['placement']
    dimensions: ReturnType<typeof resolveCoverPlacement>
  } | null = null
  let dividerDrag: {
    divider: Divider
    startPointerCoordinate: number
    startCoordinate: number
    targets: DividerSnapTarget[]
    change: DividerChange
    previewPage: PageV1
    snapTarget: DividerSnapTarget | null
  } | null = null
  let dividerPointerOrigin: { key: string; coordinate: number } | null = null

  function cropPointer(event: {
    target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
  }) {
    const pointer = event.target.getStage()?.getPointerPosition()
    return pointer
      ? { x: (pointer.x - stageX) / fitScale, y: (pointer.y - stageY) / fitScale }
      : null
  }

  function previewCrop(slotId: SlotId, placement: SlotContentV1['placement']) {
    cropDraft = { pageId: page.id, slotId, placement }
  }

  function commitCropDrag(slotId: SlotId) {
    if (cropDraft?.pageId === page.id && cropDraft.slotId === slotId)
      onplacementchange(slotId, cropDraft.placement)
    cropDraft = null
    panCropDrag = null
    cornerCropDrag = null
    sideCropDrag = null
  }

  function beginPan(
    event: {
      target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
    },
    _frame: { x: number; y: number },
    placement: ReturnType<typeof resolveCoverPlacement>,
    content: SlotContentV1,
    slotId: SlotId,
  ) {
    const pointer = cropPointer(event)
    if (!pointer) return
    panCropDrag = {
      slotId,
      startX: pointer.x,
      startY: pointer.y,
      placement: content.placement,
      dimensions: placement,
    }
  }

  function previewPan(event: {
    target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
  }) {
    const pointer = cropPointer(event)
    if (!pointer || !panCropDrag) return
    previewCrop(
      panCropDrag.slotId,
      panPlacement(
        panCropDrag.placement,
        panCropDrag.dimensions,
        pointer.x - panCropDrag.startX,
        pointer.y - panCropDrag.startY,
      ),
    )
  }

  function finishPan(event: {
    target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
  }) {
    previewPan(event)
    if (panCropDrag) commitCropDrag(panCropDrag.slotId)
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

  function beginCornerZoom(
    event: {
      target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
    },
    frame: { x: number; y: number },
    placement: ReturnType<typeof resolveCoverPlacement>,
    content: SlotContentV1,
    slotId: SlotId,
    cornerX: number,
    cornerY: number,
  ) {
    const pointer = cropPointer(event)
    if (!pointer) return
    const anchorX = frame.x + placement.x + cornerX * placement.width
    const anchorY = frame.y + placement.y + cornerY * placement.height
    const centerX = frame.x + placement.x + placement.width / 2
    const centerY = frame.y + placement.y + placement.height / 2
    const distance = Math.hypot(anchorX - centerX, anchorY - centerY)
    cornerCropDrag = {
      slotId,
      startX: pointer.x,
      startY: pointer.y,
      directionX: (anchorX - centerX) / distance,
      directionY: (anchorY - centerY) / distance,
      placement: content.placement,
      dimensions: placement,
    }
  }

  function previewCornerZoom(event: {
    target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
  }) {
    const pointer = cropPointer(event)
    if (!pointer || !cornerCropDrag) return
    const delta =
      (pointer.x - cornerCropDrag.startX) * cornerCropDrag.directionX +
      (pointer.y - cornerCropDrag.startY) * cornerCropDrag.directionY
    const zoom =
      cornerCropDrag.placement.zoom *
      (1 + delta / Math.max(cornerCropDrag.dimensions.width, cornerCropDrag.dimensions.height))
    previewCrop(
      cornerCropDrag.slotId,
      zoomPlacement(cornerCropDrag.placement, cornerCropDrag.dimensions, zoom),
    )
  }

  function finishCornerZoom(event: {
    target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
  }) {
    previewCornerZoom(event)
    if (cornerCropDrag) commitCropDrag(cornerCropDrag.slotId)
  }

  function cropDragBound(
    position: { x: number; y: number },
    frame: { x: number; y: number; width: number; height: number },
    placement: ReturnType<typeof resolveCoverPlacement>,
  ) {
    placement = panCropDrag?.dimensions ?? placement
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
    if (cornerCropDrag) {
      placement = cornerCropDrag.dimensions
      content = { ...content, placement: cornerCropDrag.placement }
    }
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
    previewCrop(
      sideCropDrag.slotId,
      zoomPlacement(sideCropDrag.placement, sideCropDrag.dimensions, zoom),
    )
  }

  function finishSideZoom(event: {
    target: { getStage(): { getPointerPosition(): { x: number; y: number } | null } | null }
  }) {
    previewSideZoom(event)
    if (sideCropDrag) commitCropDrag(sideCropDrag.slotId)
  }

  function documentPointer(event: DividerPointerEvent) {
    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) return undefined
    return {
      x: (pointer.x - stageX) / fitScale,
      y: (pointer.y - stageY) / fitScale,
    }
  }

  function prepareDividerDrag(event: DividerPointerEvent, divider: Divider) {
    const pointer = documentPointer(event)
    if (!pointer) return
    dividerPointerOrigin = {
      key: dividerKey(divider),
      coordinate: divider.axis === 'x' ? pointer.x : pointer.y,
    }
  }

  function cancelPreparedDividerDrag() {
    dividerPointerOrigin = null
  }

  function beginDividerDrag(event: DividerPointerEvent, divider: Divider) {
    const pointer = documentPointer(event)
    if (!pointer) return
    const startCoordinate = dividerCenter(divider)
    const pointerCoordinate =
      dividerPointerOrigin?.key === dividerKey(divider)
        ? dividerPointerOrigin.coordinate
        : divider.axis === 'x'
          ? pointer.x
          : pointer.y
    const pointerPerpendicularCoordinate = divider.axis === 'x' ? pointer.y : pointer.x
    dividerPointerOrigin = null
    dividerDrag = {
      divider: structuredClone(divider),
      startPointerCoordinate: pointerCoordinate,
      startCoordinate,
      targets: findDividerSnapTargets(
        page,
        divider,
        selectedSlotId,
        pointerPerpendicularCoordinate,
      ),
      change: dividerChangeForCoordinate(page, divider, startCoordinate),
      previewPage: page,
      snapTarget: null,
    }
  }

  function previewDividerDrag(event: DividerPointerEvent) {
    if (!dividerDrag) return
    const pointer = documentPointer(event)
    if (!pointer) return
    const pointerCoordinate = dividerDrag.divider.axis === 'x' ? pointer.x : pointer.y
    const rawCoordinate =
      dividerDrag.startCoordinate + pointerCoordinate - dividerDrag.startPointerCoordinate
    const allowEqualSize = Boolean(event.evt?.shiftKey)
    const allowSnap = !event.evt?.altKey
    const availableTargets = allowSnap
      ? dividerDrag.targets.filter((target) => target.kind === 'edge' || allowEqualSize)
      : []
    const retainedTarget = dividerDrag.snapTarget
      ? availableTargets.find((target) => target.id === dividerDrag?.snapTarget?.id)
      : undefined
    const retainedDistance = retainedTarget
      ? Math.abs(retainedTarget.coordinate - rawCoordinate) * fitScale
      : Number.POSITIVE_INFINITY
    const nearbyTargets = availableTargets
      .filter((target) => Math.abs(target.coordinate - rawCoordinate) * fitScale <= 4)
      .sort((left, right) => {
        const distance =
          Math.abs(left.coordinate - rawCoordinate) - Math.abs(right.coordinate - rawCoordinate)
        if (Math.abs(distance) > 0.001) return distance
        if (allowEqualSize && left.kind !== right.kind) return left.kind === 'equal-size' ? -1 : 1
        return left.id.localeCompare(right.id)
      })
    const snapTarget = retainedDistance <= 8 ? retainedTarget! : (nearbyTargets[0] ?? null)
    const effectiveCoordinate = snapTarget?.coordinate ?? rawCoordinate
    const change = dividerChangeForCoordinate(page, dividerDrag.divider, effectiveCoordinate)
    dividerDrag = {
      ...dividerDrag,
      change,
      previewPage: applyDividerChange(page, change),
      snapTarget,
    }
    if (snapTarget?.id !== retainedTarget?.id && snapTarget)
      onannounce(
        snapTarget.kind === 'equal-size'
          ? `${snapTarget.label}.`
          : 'Aligned with an adjacent frame edge.',
      )
  }

  function commitDividerDrag(event: DividerPointerEvent, divider: Divider) {
    previewDividerDrag(event)
    const drag = dividerDrag
    if (!drag || dividerKey(drag.divider) !== dividerKey(divider)) return
    const initial = dividerChangeForCoordinate(page, drag.divider, drag.startCoordinate)
    if (Math.abs(drag.change.position - initial.position) > 0.000001) ondividerchange([drag.change])
    dividerDrag = null
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
    const start = divider.axis === 'x' ? divider.parentX : divider.parentY
    const length = divider.axis === 'x' ? divider.parentWidth : divider.parentHeight
    const coordinate = start + (length * position) / 100
    ondividerchange([dividerChangeForCoordinate(page, divider, coordinate)])
    onannounce(`${dividerName(divider)} set to ${position} percent.`)
  }

  function equalizeDivider(divider: Divider) {
    onequalizesplit(divider.path)
    onannounce('Frames evenly split.')
  }

  function adjustDividerWithKeyboard(event: KeyboardEvent, divider: (typeof dividers)[number]) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      equalizeDivider(divider)
      return
    }
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

  $: canvasPage = dividerDrag?.previewPage ?? page
  $: model = createPageRenderModel(canvasPage)
  $: dividers = resolveDividers(canvasPage)
  $: displayDividers = [...dividers].sort((left, right) =>
    left.axis === right.axis ? 0 : left.axis === 'x' ? 1 : -1,
  )
  $: keyboardDividers = dividers
  $: cropFrame = cropSlotId ? model.frames.find((frame) => frame.slotId === cropSlotId) : undefined
  $: if (cropDraft && (cropDraft.pageId !== page.id || cropDraft.slotId !== cropSlotId))
    cropDraft = null
  $: cropContent = cropFrame
    ? cropDraft?.slotId === cropFrame.slotId
      ? { ...page.slots[cropFrame.slotId]!, placement: cropDraft.placement }
      : page.slots[cropFrame.slotId]
    : null
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
      if (event.key === 'Escape' && cropDraft) {
        cropDraft = null
        panCropDrag = null
        cornerCropDrag = null
        sideCropDrag = null
        event.preventDefault()
        return
      }
      if (event.key === 'Escape' && dividerDrag) {
        dividerDrag = null
        activeDividerKey = null
        hoveredDividerKey = null
        onannounce('Divider resize cancelled.')
        event.preventDefault()
        return
      }
      if (event.key === 'Escape' && dragSourceSlotId) {
        frameDragCancelled = true
        dragSourceSlotId = null
        dragTargetSlotId = null
        event.preventDefault()
      }
    }
    const finishOutsideSideDrag = () => {
      if (sideCropDrag) commitCropDrag(sideCropDrag.slotId)
    }
    globalThis.addEventListener('keydown', cancelDrag)
    globalThis.addEventListener('pointerup', finishOutsideSideDrag)
    return () => {
      resizeObserver?.disconnect()
      globalThis.removeEventListener('keydown', cancelDrag)
      globalThis.removeEventListener('pointerup', finishOutsideSideDrag)
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
  data-divider-dragging={dividerDrag ? 'true' : undefined}
  data-snap-target={dividerDrag?.snapTarget?.kind}
  data-frame-hitboxes={JSON.stringify(
    model.frames.map(({ x, y, width, height }) => ({ x, y, width, height })),
  )}
  data-crop-placement={cropFrame && cropPlacement
    ? JSON.stringify({
        x: cropFrame.x + cropPlacement.x,
        y: cropFrame.y + cropPlacement.y,
        width: cropPlacement.width,
        height: cropPlacement.height,
      })
    : undefined}
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
    onpointerup={finishSideZoom}
  >
    <CanvasPageLayer
      {viewportWidth}
      {viewportHeight}
      {darkMode}
      {stageX}
      {stageY}
      {fitScale}
      page={canvasPage}
      {model}
      {assets}
      {imageRevision}
      {cropSlotId}
      {cropDraft}
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
      {beginPan}
      {previewPan}
      {finishPan}
      {beginFrameDrag}
      {previewFrameDrag}
      {endFrameDrag}
      {dividerKey}
      {setCursor}
      snapTarget={dividerDrag?.snapTarget ?? null}
      equalSizeAvailable={Boolean(
        dividerDrag?.targets.some((target) => target.kind === 'equal-size'),
      )}
      {prepareDividerDrag}
      {cancelPreparedDividerDrag}
      {beginDividerDrag}
      {previewDividerDrag}
      {commitDividerDrag}
      {equalizeDivider}
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
        {beginPan}
        {previewPan}
        {finishPan}
        {cropDragBound}
        {roundedClip}
        {polygonPoints}
        {setCursor}
        {beginSideZoom}
        {cornerDragBound}
        {beginCornerZoom}
        {previewCornerZoom}
        {finishCornerZoom}
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
            ? 'ArrowLeft ArrowRight PageUp PageDown Home End Enter'
            : 'ArrowUp ArrowDown PageUp PageDown Home End Enter'}
          onkeydown={(event) => adjustDividerWithKeyboard(event, divider)}
        >
          {name}: {dividerPercent(divider)}%. Use arrow keys to adjust or Enter to split evenly.
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
