<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui'
  import RiArrowDownSLine from 'remixicon-svelte/icons/arrow-down-s-line'
  import { cn, type WithoutChildrenOrChild } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<SelectPrimitive.ScrollDownButtonProps> = $props()
</script>

<SelectPrimitive.ScrollDownButton
  bind:ref
  data-slot="select-scroll-down-button"
  class={cn(
    "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4 bottom-0 w-full",
    className,
  )}
  {...restProps}
>
  <RiArrowDownSLine />
</SelectPrimitive.ScrollDownButton>
