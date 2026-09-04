<script lang="ts">
  import {
    FolderOpen,
    ImageIcon,
    MoreHorizontal,
    Plus,
    RefreshCw,
    SlidersHorizontal,
    Trash2,
  } from '@lucide/svelte'
  import type { AssetRecordV1 } from '../../domain/types'
  import type { AssetRegistry } from '../../render/assetRegistry'
  import * as DropdownMenu from '../ui/dropdown-menu'
  import Input from '../ui/input/input.svelte'
  import * as ToggleGroup from '../ui/toggle-group'

  export let libraryTargetSlotId: string | null
  export let assets: AssetRecordV1[]
  export let filteredAssets: AssetRecordV1[]
  export let selectedAssetIds: string[]
  export let missingAssetIds: Set<string>
  export let assetRegistry: AssetRegistry
  export let assetQuery: string
  export let assetSort: 'import' | 'name' | 'size' | 'usage'
  export let assetFilter: 'all' | 'used' | 'unused' | 'missing'
  export let ondrop: (event: DragEvent) => void
  export let onselectasset: (assetId: string, multi: boolean) => void
  export let onstartdrag: (event: DragEvent, assetId: string) => void
  export let onaddtopage: (assetId: string) => void
  export let onreplace: (assetId: string) => void
  export let onrelink: (assetId: string) => void
  export let onremove: (assetIds: string[]) => void
  export let onchooseimages: () => void
  export let onmanageimages: () => void
  export let assetUsage: (assetId: string) => number
  export let formatBytes: (bytes: number) => string

  let listOverflows = false

  function trackOverflow(element: HTMLElement) {
    const update = () => {
      listOverflows = element.scrollHeight > element.clientHeight + 1
      element.style.setProperty(
        '--image-list-scrollbar-width',
        `${Math.max(0, element.offsetWidth - element.clientWidth)}px`,
      )
    }
    const resizeObserver = new ResizeObserver(update)
    const mutationObserver = new MutationObserver(update)
    resizeObserver.observe(element)
    mutationObserver.observe(element, { childList: true, subtree: true })
    requestAnimationFrame(update)
    return {
      destroy() {
        resizeObserver.disconnect()
        mutationObserver.disconnect()
      },
    }
  }
</script>

<div
  class="panel-body image-panel"
  role="region"
  aria-label="Image collection drop zone"
  ondragover={(event) => event.preventDefault()}
  {ondrop}
>
  <p class="eyebrow">Project collection</p>
  {#if libraryTargetSlotId}<p class="library-target">
      Choose an image for the selected frame.
    </p>{/if}
  {#if assets.length}
    <ToggleGroup.Root
      class="asset-filters"
      type="single"
      value={assetFilter}
      onValueChange={(value) => value && (assetFilter = value as typeof assetFilter)}
      aria-label="Filter images"
      ><ToggleGroup.Item value="all">All</ToggleGroup.Item><ToggleGroup.Item value="used"
        >Used</ToggleGroup.Item
      ><ToggleGroup.Item value="unused">Unused</ToggleGroup.Item><ToggleGroup.Item value="missing"
        >Missing ({missingAssetIds.size})</ToggleGroup.Item
      ></ToggleGroup.Root
    >
    <div class="asset-tools">
      <div class="asset-search-wrap">
        <Input
          class="asset-search"
          aria-label="Search images"
          bind:value={assetQuery}
          placeholder={`Search ${assets.length} image${assets.length === 1 ? '' : 's'}`}
        /><DropdownMenu.Root
          ><DropdownMenu.Trigger
            class="asset-sort-menu"
            aria-label={`Sort images: ${
              assetSort === 'import'
                ? 'Import order'
                : assetSort === 'name'
                  ? 'Filename'
                  : assetSort === 'size'
                    ? 'File size'
                    : 'Usage'
            }`}
            title="Sort images"
            ><SlidersHorizontal size={15} strokeWidth={2}></SlidersHorizontal></DropdownMenu.Trigger
          ><DropdownMenu.Content class="asset-menu asset-sort-menu-content" align="end"
            ><DropdownMenu.Item onclick={() => (assetSort = 'import')}
              >Import order</DropdownMenu.Item
            ><DropdownMenu.Item onclick={() => (assetSort = 'name')}>Filename</DropdownMenu.Item
            ><DropdownMenu.Item onclick={() => (assetSort = 'size')}>File size</DropdownMenu.Item
            ><DropdownMenu.Item onclick={() => (assetSort = 'usage')}>Usage</DropdownMenu.Item
            ></DropdownMenu.Content
          ></DropdownMenu.Root
        >
      </div>
    </div>
    <div use:trackOverflow class:image-list-overflow={listOverflows} class="asset-list">
      {#each filteredAssets as asset (asset.id)}<div class="sidebar-asset-card">
          <button
            draggable={!missingAssetIds.has(asset.id)}
            class:selected-asset={selectedAssetIds.includes(asset.id)}
            class="asset-row"
            title={`${asset.originalName} · ${asset.width} × ${asset.height} · ${
              missingAssetIds.has(asset.id)
                ? 'Missing — relink required'
                : `${formatBytes(asset.byteLength)} · ${assetUsage(asset.id)} use${assetUsage(asset.id) === 1 ? '' : 's'}`
            }`}
            ondragstart={(event) => onstartdrag(event, asset.id)}
            onclick={(event) => onselectasset(asset.id, event.ctrlKey || event.metaKey)}
            >{#if assetRegistry.getThumbnailUrl(asset.id)}<img
                class="asset-thumb"
                src={assetRegistry.getThumbnailUrl(asset.id)}
                alt=""
              />{:else}<span class="asset-thumb"><ImageIcon size={20}></ImageIcon></span>{/if}<span
              ><strong
                class:asset-unused={assetUsage(asset.id) === 0}
                class:asset-missing={missingAssetIds.has(asset.id)}>{asset.originalName}</strong
              ><small
                >{missingAssetIds.has(asset.id)
                  ? 'Missing — relink required'
                  : `${asset.width} × ${asset.height} · ${assetUsage(asset.id)} use${assetUsage(asset.id) === 1 ? '' : 's'}`}</small
              ></span
            ></button
          ><DropdownMenu.Root
            ><DropdownMenu.Trigger
              class="asset-overflow"
              aria-label={`Actions for ${asset.originalName}`}
              ><MoreHorizontal size={17}></MoreHorizontal></DropdownMenu.Trigger
            ><DropdownMenu.Content class="asset-menu" align="end"
              ><DropdownMenu.Item onclick={() => onaddtopage(asset.id)}
                ><Plus size={14}></Plus> Add to page</DropdownMenu.Item
              >{#if missingAssetIds.has(asset.id)}<DropdownMenu.Item
                  onclick={() => onrelink(asset.id)}
                  ><FolderOpen size={14}></FolderOpen> Locate image</DropdownMenu.Item
                >{:else}<DropdownMenu.Item onclick={() => onreplace(asset.id)}
                  ><RefreshCw size={14}></RefreshCw> Replace original</DropdownMenu.Item
                >{/if}<DropdownMenu.Item variant="destructive" onclick={() => onremove([asset.id])}
                ><Trash2 size={14}></Trash2> Remove from project</DropdownMenu.Item
              ></DropdownMenu.Content
            ></DropdownMenu.Root
          >
        </div>{/each}
    </div>
    {#if selectedAssetIds.length > 1}<button
        class="text-button danger"
        onclick={() => onremove(selectedAssetIds)}
        >Remove selected ({selectedAssetIds.length})</button
      >{/if}
  {:else}
    <div class="empty-library">
      <div class="image-icon" aria-hidden="true"><ImageIcon size={30}></ImageIcon></div>
      <p>Upload photos to use them across every page in this project.</p>
    </div>
  {/if}
  <div class="image-panel-actions">
    <button class="button button-primary" onclick={onchooseimages}>Upload images</button>
    <button class="button" onclick={onmanageimages}>Manage images</button>
  </div>
</div>
