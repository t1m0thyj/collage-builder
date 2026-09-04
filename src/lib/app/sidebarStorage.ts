export interface SidebarWidths {
  left: number
  right: number
}

const minWidth = 210
const defaultWidth = 255
const maxWidth = 360

function clamp(width: number) {
  return Math.min(maxWidth, Math.max(minWidth, Math.round(width)))
}

export function loadSidebarWidths(storageKey: string): SidebarWidths {
  const widths = { left: defaultWidth, right: defaultWidth }
  try {
    const stored = JSON.parse(globalThis.localStorage.getItem(storageKey) ?? '{}') as {
      left?: unknown
      right?: unknown
    }
    if (typeof stored.left === 'number' && Number.isFinite(stored.left))
      widths.left = clamp(stored.left)
    if (typeof stored.right === 'number' && Number.isFinite(stored.right))
      widths.right = clamp(stored.right)
  } catch {
    // Local storage may be unavailable or contain stale data.
  }
  return widths
}

export function saveSidebarWidths(storageKey: string, widths: SidebarWidths): void {
  try {
    globalThis.localStorage.setItem(
      storageKey,
      JSON.stringify({
        left: widths.left > defaultWidth ? widths.left : undefined,
        right: widths.right > defaultWidth ? widths.right : undefined,
      }),
    )
  } catch {
    // Resizing should still work when persistent storage is unavailable.
  }
}
