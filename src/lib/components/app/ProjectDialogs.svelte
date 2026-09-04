<script lang="ts">
  import { X } from '@lucide/svelte'
  import type { ExportSettings } from '../../app/exportProject'
  import type { CollageDocumentV1, PageV1 } from '../../domain/types'
  import * as Dialog from '../ui/dialog'
  import * as Select from '../ui/select'

  type SaveFormat = 'embedded' | 'linked'

  export let document: CollageDocumentV1
  export let activePage: PageV1
  export let pendingRemovalAssetIds: string[] | null
  export let isSaveFormatOpen: boolean
  export let pendingNavigation: 'new' | 'open' | null
  export let pendingLinkedDocument: CollageDocumentV1 | null
  export let isExportOpen: boolean
  export let exportScope: 'current' | 'all' | 'range'
  export let exportRange: string
  export let exportWidth: number
  export let exportFormat: 'png' | 'jpeg'
  export let exportQuality: number
  export let isExporting: boolean
  export let exportProgress: string
  export let assetUsage: (assetId: string) => number
  export let formatBytes: (bytes: number) => string
  export let exportUpscaleCount: () => number
  export let onremoveassets: (assetIds: string[]) => void
  export let onresolvesaveformat: (format: SaveFormat | null) => void
  export let oncontinuenavigation: () => void
  export let onsavethencontinue: () => void
  export let onrequestlinkedfolder: () => void
  export let onexport: (settings: ExportSettings) => void | Promise<void>
  export let oncancelexport: () => void
</script>

<Dialog.Root
  open={Boolean(pendingRemovalAssetIds?.length)}
  onOpenChange={(open) => !open && (pendingRemovalAssetIds = null)}
>
  {#if pendingRemovalAssetIds}
    <Dialog.Content class="dialog" aria-modal="true" aria-labelledby="remove-images-title">
      <div class="dialog-header">
        <div>
          <p class="eyebrow">Project collection</p>
          <h2 id="remove-images-title">
            Remove {pendingRemovalAssetIds.length} image{pendingRemovalAssetIds.length === 1
              ? ''
              : 's'}?
          </h2>
        </div>
        <button
          class="icon-button"
          aria-label="Cancel removal"
          onclick={() => (pendingRemovalAssetIds = null)}><X size={17}></X></button
        >
      </div>
      <div class="export-form">
        <p>
          This clears <strong
            >{pendingRemovalAssetIds.reduce(
              (total, assetId) => total + assetUsage(assetId),
              0,
            )}</strong
          >
          frame placement{pendingRemovalAssetIds.reduce(
            (total, assetId) => total + assetUsage(assetId),
            0,
          ) === 1
            ? ''
            : 's'} and frees
          <strong
            >{formatBytes(
              pendingRemovalAssetIds.reduce(
                (total, assetId) => total + (document.assets[assetId]?.byteLength ?? 0),
                0,
              ),
            )}</strong
          > from the next saved project.
        </p>
        <p>You can undo this while the project remains open.</p>
      </div>
      <div class="dialog-footer">
        <button class="button" onclick={() => (pendingRemovalAssetIds = null)}>Cancel</button
        ><button class="button danger" onclick={() => onremoveassets(pendingRemovalAssetIds!)}
          >Remove images</button
        >
      </div>
    </Dialog.Content>
  {/if}
</Dialog.Root>

<Dialog.Root
  open={isSaveFormatOpen}
  onOpenChange={(open) => {
    if (!open) onresolvesaveformat(null)
  }}
>
  <Dialog.Content class="dialog" aria-modal="true" aria-labelledby="save-format-title">
    <div class="dialog-header">
      <div>
        <p class="eyebrow">Save project</p>
        <h2 id="save-format-title">Choose a project format</h2>
      </div>
      <button class="icon-button" aria-label="Cancel save" onclick={() => onresolvesaveformat(null)}
        ><X size={17}></X></button
      >
    </div>
    <div class="export-form">
      <p>
        <strong>Embedded archive (.collage)</strong> includes every original image and is fully portable.
      </p>
      <p>
        <strong>Linked project (.collage.json)</strong> stores relative paths and keeps image bytes in
        a chosen folder.
      </p>
    </div>
    <div class="dialog-footer">
      <button class="button" onclick={() => onresolvesaveformat(null)}>Cancel</button><span
        ><button class="button" onclick={() => onresolvesaveformat('linked')}
          >Save linked JSON</button
        ><button class="button button-primary" onclick={() => onresolvesaveformat('embedded')}
          >Save embedded archive</button
        ></span
      >
    </div>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root
  open={Boolean(pendingNavigation)}
  onOpenChange={(open) => !open && (pendingNavigation = null)}
>
  <Dialog.Content class="dialog" aria-modal="true" aria-labelledby="unsaved-title">
    <div class="dialog-header">
      <div>
        <p class="eyebrow">Unsaved changes</p>
        <h2 id="unsaved-title">Save before continuing?</h2>
      </div>
      <button class="icon-button" aria-label="Cancel" onclick={() => (pendingNavigation = null)}
        ><X size={17}></X></button
      >
    </div>
    <div class="export-form">
      <p>Your current project has changes that have not been saved.</p>
    </div>
    <div class="dialog-footer">
      <button class="button" onclick={() => (pendingNavigation = null)}>Cancel</button><span
        ><button class="button danger" onclick={oncontinuenavigation}>Discard</button><button
          class="button button-primary"
          onclick={onsavethencontinue}>Save</button
        ></span
      >
    </div>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root
  open={Boolean(pendingLinkedDocument)}
  onOpenChange={(open) => !open && (pendingLinkedDocument = null)}
>
  <Dialog.Content class="dialog" aria-modal="true" aria-labelledby="linked-assets-title">
    <div class="dialog-header">
      <div>
        <p class="eyebrow">External originals</p>
        <h2 id="linked-assets-title">Locate linked images</h2>
      </div>
    </div>
    <div class="export-form">
      <p>
        This .collage.json project keeps its originals outside the project file. Choose the root
        image folder; saved relative paths and image hashes will be used to find them safely.
      </p>
    </div>
    <div class="dialog-footer">
      <button class="button" onclick={() => (pendingLinkedDocument = null)}>Not now</button>
      <button class="button button-primary" onclick={onrequestlinkedfolder}>Choose folder…</button>
    </div>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={isExportOpen}>
  <Dialog.Content class="dialog" aria-labelledby="export-title">
    <div class="dialog-header">
      <div>
        <p class="eyebrow">{exportFormat === 'jpeg' ? 'JPEG' : 'PNG'} export</p>
        <h2 id="export-title">Export pages</h2>
      </div>
      <button
        class="icon-button"
        aria-label="Close export dialog"
        disabled={isExporting}
        onclick={() => (isExportOpen = false)}><X size={17}></X></button
      >
    </div>
    <div class="export-form">
      <label
        >Format <Select.Root
          type="single"
          value={exportFormat}
          disabled={isExporting}
          onValueChange={(value) => value && (exportFormat = value as typeof exportFormat)}
          ><Select.Trigger class="export-scope" aria-label="Export format"
            ><span>{exportFormat === 'jpeg' ? 'JPEG' : 'PNG'}</span></Select.Trigger
          ><Select.Content
            ><Select.Item value="png">PNG</Select.Item><Select.Item value="jpeg">JPEG</Select.Item
            ></Select.Content
          ></Select.Root
        ></label
      >
      <label
        >Scope <Select.Root
          type="single"
          value={exportScope}
          disabled={isExporting}
          onValueChange={(value) => value && (exportScope = value as typeof exportScope)}
          ><Select.Trigger class="export-scope" aria-label="Export scope"
            ><span
              >{exportScope === 'current'
                ? 'Current page'
                : exportScope === 'all'
                  ? 'All pages'
                  : 'Page range'}</span
            ></Select.Trigger
          ><Select.Content
            ><Select.Item value="current">Current page</Select.Item><Select.Item value="all"
              >All pages</Select.Item
            ><Select.Item value="range">Page range</Select.Item></Select.Content
          ></Select.Root
        ></label
      >{#if exportScope === 'range'}<label
          >Range <input bind:value={exportRange} placeholder="1-3" disabled={isExporting} /></label
        >{/if}<label
        >Width (px) <input
          type="number"
          min="1"
          max="8192"
          bind:value={exportWidth}
          disabled={isExporting}
        /></label
      >
      {#if exportFormat === 'jpeg'}
        <label
          >JPEG quality (%) <input
            type="number"
            min="1"
            max="100"
            bind:value={exportQuality}
            disabled={isExporting}
          /></label
        >
        {#if activePage.style.transparentBackground}<p class="export-warning" role="note">
            JPEG does not support transparency. Transparent areas will be exported as white.
          </p>{/if}
      {/if}
      <p>Height: {Math.round((exportWidth * activePage.height) / activePage.width)} px</p>
      {#if exportUpscaleCount() > 0}<p class="export-warning" role="note">
          {exportUpscaleCount()} placed image{exportUpscaleCount() === 1 ? '' : 's'} will be enlarged
          beyond their original resolution and may look soft.
        </p>{/if}
      {#if exportProgress}<p aria-live="polite">{exportProgress}</p>{/if}
    </div>
    <div class="dialog-footer">
      <span
        >{exportScope === 'all'
          ? `${document.pages.length} ${exportFormat === 'jpeg' ? 'JPEGs' : 'PNGs'} in a ZIP`
          : `${exportFormat === 'jpeg' ? 'JPEG' : 'PNG'} download`}</span
      >{#if isExporting}<button class="button" onclick={oncancelexport}>Cancel export</button
        >{:else}<button
          class="button button-primary"
          onclick={() =>
            onexport({
              scope: exportScope,
              range: exportRange,
              width: exportWidth,
              format: exportFormat,
              quality: exportQuality,
            })}>Export</button
        >{/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
