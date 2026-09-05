import { resizePage } from './pageAppearance'
import type { CollageDocumentV1, LayoutPresetDefinition, PageV1 } from '../domain/types'
import type { ProjectStore } from '../state/projectStore'

export type SidebarTab = 'layouts' | 'images'
export type PageStyleControl =
  | 'padding'
  | 'gap'
  | 'cornerRadius'
  | 'shadow.opacity'
  | 'shadow.blur'
  | 'shadow.distance'
  | 'shadow.angle'

interface PageWorkflowHost {
  project: ProjectStore
  document: () => CollageDocumentV1
  page: () => PageV1
  pageAspectLinked: () => boolean
  viewportZoom: () => number
  fittedViewportZoom: () => number
  isViewportFit: () => boolean
  setActivePageId: (pageId: string) => void
  setSelectedSlotId: (slotId: string | null) => void
  setLibraryTargetSlotId: (slotId: string | null) => void
  setActiveTab: (tab: SidebarTab) => void
  setViewportZoom: (zoom: number) => void
  setViewportFit: (fit: boolean) => void
  announce: (message: string) => void
}

export class PageWorkflowController {
  constructor(private readonly host: PageWorkflowHost) {}

  selectLayout = (preset: LayoutPresetDefinition) => {
    this.host.project.changeLayout(this.host.page().id, preset)
    this.host.announce(`${preset.name} layout selected.`)
  }

  requestImage = (slotId: string) => {
    this.host.setSelectedSlotId(slotId)
    this.host.setLibraryTargetSlotId(slotId)
    this.host.setActiveTab('images')
    this.host.announce(
      'Choose an image from the library, or upload one to add it to the collection.',
    )
  }

  setViewportZoom = (zoom: number) => {
    this.host.setViewportFit(false)
    this.host.setViewportZoom(Math.min(2, Math.max(0.5, zoom)))
  }

  stepViewportZoom = (delta: number) => {
    const current = this.host.isViewportFit()
      ? this.host.fittedViewportZoom()
      : this.host.viewportZoom()
    this.setViewportZoom(current + delta)
  }

  applyViewportWheelZoom = (factor: number) => {
    const current = this.host.isViewportFit()
      ? this.host.fittedViewportZoom()
      : this.host.viewportZoom()
    this.setViewportZoom(current * factor)
  }

  updateStyle = (patch: Partial<PageV1['style']>) => {
    this.host.project.setPageStyle(this.host.page().id, patch)
  }

  previewStyle = (control: PageStyleControl, patch: Partial<PageV1['style']>) => {
    this.host.project.previewPageStyle(this.host.page().id, control, patch)
  }

  commitStyle = (control: PageStyleControl) => {
    this.host.project.commitPageStyle(this.host.page().id, control)
  }

  resize = (axis: 'width' | 'height', value: number) => {
    try {
      resizePage(this.host.project, this.host.page(), axis, value, this.host.pageAspectLinked())
    } catch (error) {
      this.host.announce(error instanceof Error ? error.message : 'Unable to resize page')
    }
  }

  add = () => {
    const page = this.host.page()
    this.host.project.addPage(page.id)
    const pages = this.host.document().pages
    this.host.setActivePageId(pages[pages.length - 1].id)
  }

  rename = () => {
    const page = this.host.page()
    const name = globalThis.prompt('Page name', page.name)
    if (name !== null) this.host.project.renamePage(page.id, name)
  }

  assignAsset = (assetId: string, slotId: string) => {
    this.host.project.assignAsset(this.host.page().id, slotId, assetId)
    this.host.setLibraryTargetSlotId(null)
  }

  delete = () => {
    this.host.project.deletePage(this.host.page().id)
    this.host.setActivePageId(this.host.document().pages[0].id)
  }
}
