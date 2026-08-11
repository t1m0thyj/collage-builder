<script lang="ts">
  import { Dialog as DialogPrimitive } from 'bits-ui'
  import { cn, type WithoutChildrenOrChild } from '$lib/utils.js'
  import DialogPortal from './dialog-portal.svelte'
  import type { ComponentProps } from 'svelte'

  let {
    ref = $bindable(null),
    class: className,
    portalProps,
    ...restProps
  }: DialogPrimitive.ContentProps & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>
  } = $props()
</script>

<DialogPortal {...portalProps}>
  <DialogPrimitive.Overlay class="dialog-backdrop" />
  <DialogPrimitive.Content
    bind:ref
    data-slot="dialog-content"
    class={cn('dialog fixed top-1/2 left-1/2 z-200 max-h-[calc(100vh-48px)] -translate-x-1/2 -translate-y-1/2 overflow-auto outline-none', className)}
    {...restProps}
  />
</DialogPortal>
