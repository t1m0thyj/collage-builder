<script lang="ts">
  import {
    Check,
    FolderOpen,
    Grid2X2,
    ImageIcon,
    List,
    MoreHorizontal,
    RefreshCw,
    Trash2,
    Upload,
    X,
  } from '@lucide/svelte'
  import type { AssetRecordV1 } from '../../domain/types'
  import type { AssetRegistry } from '../../render/assetRegistry'
  import * as Dialog from '../ui/dialog'
  import * as DropdownMenu from '../ui/dropdown-menu'
  import Input from '../ui/input/input.svelte'
  import * as Select from '../ui/select'
  import * as ToggleGroup from '../ui/toggle-group'

  export let open: boolean
  export let assets: AssetRecordV1[]
  export let filteredAssets: AssetRecordV1[]
  export let unusedAssetIds: string[]
  export let selectedAssetIds: string[]
  export let missingAssetIds: Set<string>
  export let assetLibraryBytes: number
  export let assetRegistry: AssetRegistry
  export let imageRevision: number
  export let assetQuery: string
  export let assetSort: 'import' | 'name' | 'size' | 'usage'
  export let assetFilter: 'all' | 'used' | 'unused' | 'missing'
  export let view: 'grid' | 'list'
  export let ondrop: (event: DragEvent) => void
  export let onchooseimages: () => void
  export let onselectasset: (assetId: string, multi: boolean) => void
  export let onstartdrag: (event: DragEvent, assetId: string) => void
  export let onreplace: (assetId: string) => void
  export let onrelink: (assetId: string) => void
  export let onrelinkmissing: () => void
  export let onremove: (assetIds: string[]) => void
  export let assetUsage: (assetId: string) => number
  export let formatBytes: (bytes: number) => string
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="dialog image-manager-dialog"
    aria-modal="true"
    aria-labelledby="image-manager-title"
  >
    <div class="dialog-header">
      <div>
        <p class="eyebrow">Photo library</p>
        <h2 id="image-manager-title">Photo library</h2>
      </div>
      <button class="icon-button" aria-label="Close image manager" onclick={() => (open = false)}
        ><X size={17}></X></button
      >
    </div>
    {#if !assets.length}
      <div
        class="upload-well"
        role="region"
        aria-label="Add photos drop zone"
        ondragover={(event) => event.preventDefault()}
        {ondrop}
      >
        <div class="upload-mark" aria-hidden="true"><Upload size={19}></Upload></div>
        <strong>Drop PNG, JPEG, or WebP photos here</strong><span
          >Original files remain on this device and are included when you save with photos.</span
        ><button class="button button-primary" onclick={onchooseimages}>Choose photos</button>
      </div>
    {:else}
      <div
        class="manager-add-images"
        role="region"
        aria-label="Add photos drop zone"
        ondragover={(event) => event.preventDefault()}
        {ondrop}
      >
        <span>Drop more photos here, or</span><button class="text-button" onclick={onchooseimages}
          ><Upload size={14}></Upload> Add photos</button
        >
      </div>
    {/if}
    {#if assets.length}<div class="manager-content">
        <div class="manager-toolbar">
          <div class="asset-tools">
            <Input
              class="asset-search"
              aria-label="Search project photos"
              bind:value={assetQuery}
              placeholder="Search photos"
            /><Select.Root
              type="single"
              value={assetSort}
              onValueChange={(value) => value && (assetSort = value as typeof assetSort)}
              ><Select.Trigger class="asset-sort" aria-label="Sort project photos"
                ><span
                  >{assetSort === 'import'
                    ? 'Import order'
                    : assetSort === 'name'
                      ? 'Filename'
                      : assetSort === 'size'
                        ? 'File size'
                        : 'Usage'}</span
                ></Select.Trigger
              ><Select.Content class="asset-sort-content"
                ><Select.Item value="import">Import order</Select.Item><Select.Item value="name"
                  >Filename</Select.Item
                ><Select.Item value="size">File size</Select.Item><Select.Item value="usage"
                  >Usage</Select.Item
                ></Select.Content
              ></Select.Root
            >
          </div>
          <div class="manager-view">
            <ToggleGroup.Root
              type="single"
              value={view}
              onValueChange={(value) => value && (view = value as typeof view)}
              aria-label="Image manager view"
              ><ToggleGroup.Item value="grid" aria-label="Grid view"
                ><Grid2X2 size={15}></Grid2X2></ToggleGroup.Item
              ><ToggleGroup.Item value="list" aria-label="List view"
                ><List size={15}></List></ToggleGroup.Item
              ></ToggleGroup.Root
            >
          </div>
          <div class="manager-filter-row">
            <ToggleGroup.Root
              class="asset-filters"
              type="single"
              value={assetFilter}
              onValueChange={(value) => value && (assetFilter = value as typeof assetFilter)}
              aria-label="Filter project photos"
              ><ToggleGroup.Item value="all">All</ToggleGroup.Item><ToggleGroup.Item value="used"
                >Used</ToggleGroup.Item
              ><ToggleGroup.Item value="unused">Unused</ToggleGroup.Item><ToggleGroup.Item
                value="missing">Missing ({missingAssetIds.size})</ToggleGroup.Item
              ></ToggleGroup.Root
            >
            <span class="manager-summary"
              >{assets.length} photos · {formatBytes(assetLibraryBytes)} included</span
            >
          </div>
        </div>
        <div class="asset-list manager-asset-list" class:manager-list-view={view === 'list'}>
          {#each filteredAssets as asset (asset.id)}<div
              class:selected-asset={selectedAssetIds.includes(asset.id)}
              class="manager-asset-card"
            >
              <button
                draggable={!missingAssetIds.has(asset.id)}
                class="asset-row"
                aria-pressed={selectedAssetIds.includes(asset.id)}
                ondragstart={(event) => onstartdrag(event, asset.id)}
                onclick={(event) => onselectasset(asset.id, event.ctrlKey || event.metaKey)}
                >{#if selectedAssetIds.includes(asset.id)}<span
                    class="asset-selection-check"
                    aria-hidden="true"><Check size={12} strokeWidth={3} /></span
                  >{/if}{#if assetRegistry.getThumbnailUrl(asset.id, imageRevision)}<img
                    class="asset-thumb"
                    draggable="false"
                    src={assetRegistry.getThumbnailUrl(asset.id, imageRevision)}
                    alt=""
                  />{:else}<span class="asset-thumb"><ImageIcon size={20}></ImageIcon></span
                  >{/if}<span
                  ><strong class:asset-missing={missingAssetIds.has(asset.id)}
                    >{asset.originalName}</strong
                  ><small class:asset-missing={missingAssetIds.has(asset.id)}
                    >{missingAssetIds.has(asset.id)
                      ? `Missing — relink required · ${asset.width} × ${asset.height} · ${formatBytes(asset.byteLength)} · ${assetUsage(asset.id)} use${assetUsage(asset.id) === 1 ? '' : 's'}`
                      : `${asset.width} × ${asset.height} · ${formatBytes(asset.byteLength)} · ${assetUsage(asset.id)} use${assetUsage(asset.id) === 1 ? '' : 's'}`}</small
                  ></span
                ></button
              ><DropdownMenu.Root
                ><DropdownMenu.Trigger
                  class="asset-overflow"
                  aria-label={`Actions for ${asset.originalName}`}
                  ><MoreHorizontal size={17}></MoreHorizontal></DropdownMenu.Trigger
                ><DropdownMenu.Content class="asset-menu"
                  >{#if missingAssetIds.has(asset.id)}<DropdownMenu.Item
                      onclick={() => onrelink(asset.id)}
                      ><FolderOpen size={14}></FolderOpen> Locate image</DropdownMenu.Item
                    >{:else}<DropdownMenu.Item onclick={() => onreplace(asset.id)}
                      ><RefreshCw size={14}></RefreshCw> Replace original</DropdownMenu.Item
                    >{/if}<DropdownMenu.Item
                    variant="destructive"
                    onclick={() => onremove([asset.id])}
                    ><Trash2 size={14}></Trash2> Remove from project</DropdownMenu.Item
                  ></DropdownMenu.Content
                ></DropdownMenu.Root
              >
            </div>{/each}
        </div>
        {#if !filteredAssets.length}<p class="empty-filter">No photos match this view.</p>{/if}
        <div class="manager-bulk-actions">
          {#if selectedAssetIds.length > 1}<button
              class="button"
              onclick={() => onremove(selectedAssetIds)}
              >Remove selected ({selectedAssetIds.length})</button
            >{/if}
        </div>
      </div>{/if}
    <div class="dialog-footer image-manager-footer">
      <button
        class="text-button danger"
        disabled={unusedAssetIds.length === 0}
        onclick={() => onremove(unusedAssetIds)}>Remove unused photos</button
      >{#if missingAssetIds.size}<button class="button" onclick={onrelinkmissing}
          ><FolderOpen size={14}></FolderOpen> Locate missing photos</button
        >{/if}<button class="button" onclick={() => (open = false)}>Done</button>
    </div>
  </Dialog.Content>
</Dialog.Root>
