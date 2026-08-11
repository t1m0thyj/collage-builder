<script lang="ts">
  import { ArrowLeft, ArrowRight, ChevronDown, Copy, Eraser, Pencil, Trash2 } from '@lucide/svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'

  export let open = false
  export let pageIndex: number
  export let pageCount: number
  export let onRename: () => void
  export let onDuplicate: () => void
  export let onMoveLeft: () => void
  export let onMoveRight: () => void
  export let onClear: () => void
  export let onDelete: () => void

  function run(action: () => void) {
    action()
    open = false
  }
</script>

<DropdownMenu.Root bind:open>
  <div class="page-actions">
    <DropdownMenu.Trigger
      class="page-actions-button"
      aria-label="Page actions"
      onclick={(event) => event.stopPropagation()}
      ><ChevronDown size={14}></ChevronDown></DropdownMenu.Trigger
    >
    <DropdownMenu.Content class="page-actions-menu" align="end"
      ><DropdownMenu.Item onclick={() => run(onRename)}><Pencil size={14}></Pencil> Rename</DropdownMenu.Item
      ><DropdownMenu.Item onclick={() => run(onDuplicate)}><Copy size={14}></Copy> Duplicate</DropdownMenu.Item
      ><DropdownMenu.Item disabled={pageIndex === 0} onclick={() => run(onMoveLeft)}><ArrowLeft size={14}></ArrowLeft>
        Move left</DropdownMenu.Item
      ><DropdownMenu.Item disabled={pageIndex === pageCount - 1} onclick={() => run(onMoveRight)}><ArrowRight size={14}></ArrowRight>
        Move right</DropdownMenu.Item
      ><DropdownMenu.Item variant="destructive" onclick={() => run(onClear)}><Eraser size={14}></Eraser>
        Clear page</DropdownMenu.Item
      >{#if pageCount > 1}<DropdownMenu.Item variant="destructive" onclick={() => run(onDelete)}
          ><Trash2 size={14}></Trash2> Delete page</DropdownMenu.Item
        >{/if}
    </DropdownMenu.Content>
  </div>
</DropdownMenu.Root>
