<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui'
  import RiArrowUpSLine from 'remixicon-svelte/icons/arrow-up-s-line'
  import { cn, type WithoutChildrenOrChild } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<SelectPrimitive.ScrollUpButtonProps> = $props()
</script>

<SelectPrimitive.ScrollUpButton
  bind:ref
  data-slot="select-scroll-up-button"
  class={cn(
    "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4 top-0 w-full",
    className,
  )}
  {...restProps}
>
  <RiArrowUpSLine />
</SelectPrimitive.ScrollUpButton>
