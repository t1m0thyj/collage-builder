<script lang="ts">
  import { ChevronDown } from '@lucide/svelte'
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
      ><DropdownMenu.Item onclick={() => run(onRename)}>Rename</DropdownMenu.Item
      ><DropdownMenu.Item onclick={() => run(onDuplicate)}>Duplicate</DropdownMenu.Item
      ><DropdownMenu.Item disabled={pageIndex === 0} onclick={() => run(onMoveLeft)}>Move left</DropdownMenu.Item
      ><DropdownMenu.Item disabled={pageIndex === pageCount - 1} onclick={() => run(onMoveRight)}>Move right</DropdownMenu.Item
      ><DropdownMenu.Item variant="destructive" onclick={() => run(onClear)}>Clear page</DropdownMenu.Item
      >{#if pageCount > 1}<DropdownMenu.Item variant="destructive" onclick={() => run(onDelete)}
          >Delete page</DropdownMenu.Item
        >{/if}
    </DropdownMenu.Content>
  </div>
</DropdownMenu.Root>
