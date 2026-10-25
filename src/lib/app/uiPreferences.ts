import type { PageV1 } from '../domain/types'
import type { ProjectStore } from '../state/projectStore'
import { loadRecentColors, storeRecentColor } from './colorPreferences'
import { loadSidebarWidths, saveSidebarWidths } from './sidebarStorage'

interface UiPreferencesHost {
  project: ProjectStore
  page: () => PageV1
  recentColors: () => string[]
  leftSidebarWidth: () => number
  rightSidebarWidth: () => number
  setRecentColors: (colors: string[]) => void
  setLeftSidebarWidth: (width: number) => void
  setRightSidebarWidth: (width: number) => void
  setDark: (dark: boolean) => void
}

export class UiPreferencesController {
  constructor(
    private readonly host: UiPreferencesHost,
    private readonly sidebarStorageKey: string,
    private readonly colorStorageKey: string,
  ) {}

  initialize = () => {
    const widths = loadSidebarWidths(this.sidebarStorageKey)
    this.host.setLeftSidebarWidth(widths.left)
    this.host.setRightSidebarWidth(widths.right)
    this.host.setRecentColors(loadRecentColors(this.colorStorageKey))
  }

  applyTheme = (dark: boolean) => {
    this.host.setDark(dark)
    globalThis.document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }

  persistSidebarWidth = (side: 'left' | 'right', width: number) => {
    saveSidebarWidths(this.sidebarStorageKey, {
      left: side === 'left' ? width : this.host.leftSidebarWidth(),
      right: side === 'right' ? width : this.host.rightSidebarWidth(),
    })
  }

  rememberColor = (color: string) => {
    this.host.setRecentColors(
      storeRecentColor(this.colorStorageKey, this.host.recentColors(), color),
    )
  }

  setBackground = (color: string, rememberCustom = false) => {
    if (rememberCustom) this.rememberColor(color)
    this.host.project.setPageStyle(this.host.page().id, {
      backgroundColor: `${color.slice(0, 7).toUpperCase()}FF`,
    })
  }

  setShadow = (color: string, rememberCustom = false) => {
    const normalized = color.slice(0, 7).toUpperCase()
    if (rememberCustom) this.rememberColor(normalized)
    const page = this.host.page()
    this.host.project.setPageStyle(page.id, {
      shadow: { ...page.style.shadow, color: normalized },
    })
  }
}
