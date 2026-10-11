<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { X } from '@lucide/svelte'
  import { hasOpenDialog } from '../../app/appLifecycle'

  export let compact = false
  export let open = false
  let panel: HTMLDivElement
  let dragging = false
  let dragPending = false

  export function close(restoreFocus = false) {
    if (!compact || !open) return
    open = false
    dragging = false
    dragPending = false
    if (restoreFocus) globalThis.document.getElementById('left-sidebar-toggle')?.focus()
  }

  export async function show() {
    if (!compact) return
    open = true
    await tick()
    panel.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
  }

  export function toggle() {
    if (open) close(true)
    else void show()
  }

  export function beginDrag() {
    dragPending = compact && open
  }

  onMount(() => {
    let lastFocused = globalThis.document.activeElement
    const rememberFocus = (event: FocusEvent) => {
      lastFocused = event.target as Element
    }
    const media = matchMedia('(width < 960px)')
    const sync = () => {
      const focusedInside =
        panel.contains(globalThis.document.activeElement) || panel.contains(lastFocused)
      const focusedToggle = globalThis.document.activeElement?.id === 'left-sidebar-toggle'
      compact = media.matches
      open = false
      dragging = false
      dragPending = false
      if (compact && focusedInside)
        void tick().then(() => globalThis.document.getElementById('left-sidebar-toggle')?.focus())
      else if (!compact && focusedToggle)
        void tick().then(() =>
          panel.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus(),
        )
    }
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (
        !target ||
        panel.contains(target) ||
        target.closest('#left-sidebar-toggle') ||
        target.closest('[role="menu"], [role="listbox"], [role="dialog"]') ||
        hasOpenDialog()
      )
        return
      close()
    }
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        !compact ||
        !open ||
        event.defaultPrevented ||
        hasOpenDialog() ||
        globalThis.document.querySelector(
          '[role="menu"][data-state="open"], [role="listbox"][data-state="open"]',
        )
      )
        return
      event.preventDefault()
      event.stopPropagation()
      close(true)
    }
    const revealCanvas = () => {
      if (!dragPending) return
      // The native drag image is captured by the first dragover. Linux WebKit
      // can suspend animation frames during a native drag, so use the event.
      dragPending = false
      if (compact && open) dragging = true
    }
    const finishDrag = () => {
      if (dragging || dragPending) close()
      dragging = false
      dragPending = false
    }
    sync()
    media.addEventListener('change', sync)
    globalThis.document.addEventListener('pointerdown', outside)
    globalThis.document.addEventListener('focusin', rememberFocus)
    globalThis.addEventListener('keydown', escape, true)
    globalThis.addEventListener('dragover', revealCanvas, true)
    globalThis.addEventListener('dragend', finishDrag)
    return () => {
      media.removeEventListener('change', sync)
      globalThis.document.removeEventListener('pointerdown', outside)
      globalThis.document.removeEventListener('focusin', rememberFocus)
      globalThis.removeEventListener('keydown', escape, true)
      globalThis.removeEventListener('dragover', revealCanvas, true)
      globalThis.removeEventListener('dragend', finishDrag)
    }
  })
</script>

<div
  id="left-sidebar-panel"
  class="left-sidebar-container"
  class:sidebar-open={open}
  class:sidebar-dragging={dragging}
  bind:this={panel}
  inert={compact && !open}
>
  <button
    class="icon-button sidebar-close"
    aria-label="Close layouts and images"
    onclick={() => close(true)}
  >
    <X size={17} aria-hidden="true" />
  </button>
  <slot />
</div>
