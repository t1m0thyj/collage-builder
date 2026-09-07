interface AppLifecycleHost {
  initializePreferences: () => void
  initializeStartup: () => void
  applyTheme: (dark: boolean) => void
  pendingNavigation: () => boolean
  cancelPendingNavigation: () => void
  saveProject: (saveAs: boolean) => void
  openProject: () => void
  undo: () => void
  redo: () => void
  selectedSlotId: () => string | null
  hasSelectedContent: () => boolean
  clearSelectedSlot: () => void
  beginCrop: (slotId: string) => void
  cancelCrop: () => void
  moveSelection: (key: string) => void
  isDirty: () => boolean
  cleanup: () => void
}

export function attachAppLifecycle(host: AppLifecycleHost): () => void {
  host.initializePreferences()
  const darkMedia = globalThis.matchMedia('(prefers-color-scheme: dark)')
  const syncDarkMode = () => host.applyTheme(darkMedia.matches)
  syncDarkMode()
  darkMedia.addEventListener('change', syncDarkMode)
  host.initializeStartup()

  const keyboard = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
    const dialog = target?.closest<HTMLElement>('[role="dialog"]')
    if (
      dialog &&
      dialog.getAttribute('data-state') !== 'closed' &&
      dialog.getAttribute('aria-hidden') !== 'true'
    )
      return
    if (event.key === 'Escape' && host.pendingNavigation()) {
      host.cancelPendingNavigation()
      event.preventDefault()
      return
    }
    const modifier = event.ctrlKey || event.metaKey
    if (modifier && event.key.toLowerCase() === 's') {
      event.preventDefault()
      host.saveProject(event.shiftKey)
      return
    }
    if (modifier && event.key.toLowerCase() === 'o') {
      event.preventDefault()
      host.openProject()
      return
    }
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) host.redo()
      else host.undo()
      return
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      host.redo()
      return
    }
    const selectedSlotId = host.selectedSlotId()
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedSlotId) {
      host.clearSelectedSlot()
      return
    }
    if (event.key === 'Enter' && host.hasSelectedContent() && selectedSlotId) {
      host.beginCrop(selectedSlotId)
      return
    }
    if (event.key === 'Escape') {
      host.cancelCrop()
      return
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      host.moveSelection(event.key)
      event.preventDefault()
    }
  }
  globalThis.addEventListener('keydown', keyboard)

  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!host.isDirty()) return
    event.preventDefault()
    event.returnValue = ''
  }
  globalThis.addEventListener('beforeunload', beforeUnload)

  return () => {
    host.cleanup()
    globalThis.removeEventListener('keydown', keyboard)
    globalThis.removeEventListener('beforeunload', beforeUnload)
    darkMedia.removeEventListener('change', syncDarkMode)
  }
}
