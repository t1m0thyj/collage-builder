<script lang="ts">
  import { ImageIcon } from '@lucide/svelte'
  import { onDestroy } from 'svelte'

  export let blob: Blob | undefined
  export let alt: string

  let url: string | undefined

  function releaseUrl() {
    if (url) URL.revokeObjectURL(url)
    url = undefined
  }

  function updateUrl(value: Blob | undefined) {
    releaseUrl()
    if (value) url = URL.createObjectURL(value)
  }

  $: updateUrl(blob)

  onDestroy(releaseUrl)
</script>

<div class="recovery-thumbnail">
  {#if url}
    <img src={url} {alt} />
  {:else}
    <ImageIcon size={22} aria-hidden="true"></ImageIcon>
    <span class="sr-only">{alt} unavailable</span>
  {/if}
</div>
