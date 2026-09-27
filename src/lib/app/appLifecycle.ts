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
  isCropping: () => boolean
  finishCrop: () => void
  cancelCrop: () => void
  moveSelection: (key: string) => void
  isDirty: () => boolean
  flushRecovery: () => Promise<boolean>
  recoverFromLoadError: () => void
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
    if (event.defaultPrevented) return
    const target = event.target as HTMLElement | null
    const cropNumberInput = target?.matches('.crop-controls input[type="number"]') ?? false
    if (
      target?.matches('input, textarea, select, [contenteditable="true"]') &&
      !(event.key === 'Enter' && cropNumberInput && host.isCropping())
    )
      return
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
    if (event.key === 'Escape') {
      host.cancelCrop()
      return
    }
    if (event.key === 'Enter' && cropNumberInput && host.isCropping()) {
      // Blurring fires the input's change handler before the crop transaction closes.
      target?.blur()
      host.finishCrop()
      event.preventDefault()
      return
    }
    // Keep canvas shortcuts off controls whose keys already have a native or
    // component-specific meaning. Frame buttons are the canvas keyboard entry.
    if (
      !target?.closest('.canvas-frame-controls') &&
      target?.closest(
        'button, a, summary, [role="tablist"], [role="menuitem"], [role="option"], [role="radio"], [role="slider"], [role="switch"], [role="checkbox"]',
      )
    )
      return
    const selectedSlotId = host.selectedSlotId()
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedSlotId) {
      host.clearSelectedSlot()
      return
    }
    if (event.key === 'Enter' && host.isCropping()) {
      host.finishCrop()
      event.preventDefault()
      return
    }
    if (event.key === 'Enter' && host.hasSelectedContent() && selectedSlotId) {
      host.beginCrop(selectedSlotId)
      event.preventDefault()
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

  const visibilityChange = () => {
    if (globalThis.document.visibilityState === 'hidden') void host.flushRecovery()
  }
  globalThis.document.addEventListener('visibilitychange', visibilityChange)

  const preloadError = (event: Event) => {
    event.preventDefault()
    host.recoverFromLoadError()
  }
  globalThis.addEventListener('vite:preloadError', preloadError)

  return () => {
    host.cleanup()
    globalThis.removeEventListener('keydown', keyboard)
    globalThis.removeEventListener('beforeunload', beforeUnload)
    globalThis.document.removeEventListener('visibilitychange', visibilityChange)
    globalThis.removeEventListener('vite:preloadError', preloadError)
    darkMedia.removeEventListener('change', syncDarkMode)
  }
}
