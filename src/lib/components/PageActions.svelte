<script lang="ts">
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

<div class="page-actions">
  <button
    class="page-actions-button"
    aria-label="Page actions"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}>▾</button
  >
  {#if open}
    <div class="page-actions-menu" role="menu">
      <button role="menuitem" onclick={() => run(onRename)}>Rename</button>
      <button role="menuitem" onclick={() => run(onDuplicate)}>Duplicate</button>
      <button role="menuitem" disabled={pageIndex === 0} onclick={() => run(onMoveLeft)}
        >Move left</button
      >
      <button
        role="menuitem"
        disabled={pageIndex === pageCount - 1}
        onclick={() => run(onMoveRight)}>Move right</button
      >
      <button role="menuitem" class="danger" onclick={() => run(onClear)}>Clear page</button>
      {#if pageCount > 1}
        <button role="menuitem" class="danger" onclick={() => run(onDelete)}>Delete page</button>
      {/if}
    </div>
  {/if}
</div>
