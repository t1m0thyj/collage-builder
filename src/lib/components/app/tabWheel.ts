export function scrollTabsWithWheel(event: WheelEvent, viewport: HTMLElement): void {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.deltaY === 0 ||
    Math.abs(event.deltaX) >= Math.abs(event.deltaY)
  )
    return
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientWidth : 1
  const before = viewport.scrollLeft
  viewport.scrollLeft += event.deltaY * scale
  if (viewport.scrollLeft !== before) event.preventDefault()
}
