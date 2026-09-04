export function loadRecentColors(storageKey: string): string[] {
  try {
    const stored = JSON.parse(globalThis.localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(stored)) return []
    return [
      ...new Set(
        stored
          .filter(
            (color): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color),
          )
          .map((color) => color.toUpperCase()),
      ),
    ].slice(0, 4)
  } catch {
    return []
  }
}

export function storeRecentColor(storageKey: string, colors: string[], color: string): string[] {
  const normalized = color.slice(0, 7).toUpperCase()
  const next = [normalized, ...colors.filter((candidate) => candidate !== normalized)].slice(0, 4)
  try {
    globalThis.localStorage.setItem(storageKey, JSON.stringify(next))
  } catch {
    // Color selection should still work when persistent storage is unavailable.
  }
  return next
}
