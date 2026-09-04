<script lang="ts">
  export let side: 'left' | 'right'
  export let width: number
  export let min = 210
  export let max = 360
  export let defaultWidth = 255
  export let label: string
  export let oncommit: (width: number) => void

  let resize: { startX: number; startWidth: number } | null = null

  function clamp(value: number) {
    return Math.min(max, Math.max(min, value))
  }

  function start(event: PointerEvent) {
    if (event.button !== 0) return
    resize = { startX: event.clientX, startWidth: width }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function move(event: PointerEvent) {
    if (!resize) return
    const delta = (event.clientX - resize.startX) * (side === 'left' ? 1 : -1)
    width = clamp(resize.startWidth + delta)
  }

  function stop(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
    if (resize) oncommit(width)
    resize = null
  }

  function reset() {
    width = defaultWidth
    oncommit(width)
  }

  function resizeWithKeyboard(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const direction = side === 'left' ? 1 : -1
    width =
      event.key === 'Home'
        ? min
        : event.key === 'End'
          ? max
          : clamp(width + (event.key === 'ArrowRight' ? 12 : -12) * direction)
    oncommit(width)
    event.preventDefault()
  }
</script>

<button
  class:active-resizer={resize}
  class={`sidebar-resizer sidebar-resizer-${side}`}
  type="button"
  role="slider"
  aria-label={label}
  aria-orientation="vertical"
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={width}
  tabindex="0"
  onpointerdown={start}
  onpointermove={move}
  onpointerup={stop}
  onpointercancel={stop}
  ondblclick={reset}
  onkeydown={resizeWithKeyboard}
></button>
