import { resolveLayout } from '../domain/geometry'
import type { PageV1, SlotContentV1 } from '../domain/types'
import type { ProjectStore } from '../state/projectStore'

interface EditorSessionHost {
  project: ProjectStore
  page: () => PageV1
  selectedSlotId: () => string | null
  selectedContent: () => SlotContentV1 | null
  cropModeSlotId: () => string | null
  selectedAssetId: () => string | null
  setSelectedSlotId: (slotId: string | null) => void
  setCropModeSlotId: (slotId: string | null) => void
  setSelectedAssetId: (assetId: string | null) => void
}

export class EditorSessionController {
  private cropOrigin: {
    pageId: string
    slotId: string
    placement: SlotContentV1['placement']
  } | null = null

  constructor(private readonly host: EditorSessionHost) {}

  beginCrop(slotId: string) {
    if (this.host.cropModeSlotId() && this.host.cropModeSlotId() !== slotId) this.finishCrop()
    const page = this.host.page()
    const content = page.slots[slotId]
    this.host.setSelectedSlotId(slotId)
    if (!content) {
      this.host.setCropModeSlotId(null)
      this.cropOrigin = null
      return
    }
    if (this.host.cropModeSlotId() !== slotId)
      this.cropOrigin = {
        pageId: page.id,
        slotId,
        placement: structuredClone(content.placement),
      }
    this.host.setCropModeSlotId(slotId)
  }

  selectFrame(slotId: string) {
    const selectedAssetId = this.host.selectedAssetId()
    if (selectedAssetId) {
      this.host.project.assignAsset(this.host.page().id, slotId, selectedAssetId)
      this.host.setSelectedSlotId(slotId)
      this.host.setCropModeSlotId(null)
      this.cropOrigin = null
      return
    }
    if (this.host.cropModeSlotId() && this.host.cropModeSlotId() !== slotId) this.finishCrop()
    this.host.setSelectedSlotId(slotId)
  }

  finishCrop() {
    if (this.cropOrigin)
      this.host.project.commitCrop(
        this.cropOrigin.pageId,
        this.cropOrigin.slotId,
        this.cropOrigin.placement,
      )
    this.host.setCropModeSlotId(null)
    this.cropOrigin = null
  }

  cancelCrop() {
    if (this.cropOrigin)
      this.host.project.cancelCrop(
        this.cropOrigin.pageId,
        this.cropOrigin.slotId,
        this.cropOrigin.placement,
      )
    this.cropOrigin = null
    this.host.setCropModeSlotId(null)
    this.host.setSelectedAssetId(null)
  }

  updateZoom(zoom: number) {
    const slotId = this.host.selectedSlotId()
    const selectedContent = this.host.selectedContent()
    if (!slotId || !selectedContent) return
    const content = {
      ...selectedContent,
      placement: { ...selectedContent.placement, zoom },
    }
    if (this.host.cropModeSlotId() === slotId)
      this.host.project.previewSlotContent(this.host.page().id, slotId, content)
    else this.host.project.setSlotContent(this.host.page().id, slotId, content)
  }

  updatePosition(axis: 'positionX' | 'positionY', percent: number) {
    const slotId = this.host.selectedSlotId()
    const selectedContent = this.host.selectedContent()
    if (!slotId || !selectedContent) return
    const content = {
      ...selectedContent,
      placement: {
        ...selectedContent.placement,
        [axis]: Math.min(1, Math.max(0, percent / 100)),
      },
    }
    if (this.host.cropModeSlotId() === slotId)
      this.host.project.previewSlotContent(this.host.page().id, slotId, content)
    else this.host.project.setSlotContent(this.host.page().id, slotId, content)
  }

  commitPan(slotId: string, placement: SlotContentV1['placement']) {
    const content = this.host.page().slots[slotId]
    if (content)
      this.host.project.previewSlotContent(this.host.page().id, slotId, { ...content, placement })
  }

  resetCrop() {
    const slotId = this.host.selectedSlotId()
    const selectedContent = this.host.selectedContent()
    if (!slotId || !selectedContent) return
    this.host.project.setSlotContent(this.host.page().id, slotId, {
      ...selectedContent,
      placement: { zoom: 1, positionX: 0.5, positionY: 0.5 },
    })
  }

  removeSelectedImage() {
    const slotId = this.host.selectedSlotId()
    if (slotId) this.host.project.clearSlot(this.host.page().id, slotId)
  }

  moveSelection(key: string) {
    const frames = resolveLayout(this.host.page())
    const index = frames.findIndex((frame) => frame.slotId === this.host.selectedSlotId())
    const offset = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1
    const next = frames[index < 0 ? 0 : (index + offset + frames.length) % frames.length]
    this.host.setSelectedSlotId(next.slotId)
  }
}
