<script lang="ts">
  import type { AssetRecordV1, LayoutPresetDefinition, PageV1 } from '../../domain/types'
  import type { AssetFilter, AssetSort, ImportBatchStatus } from '../../app/assetManagement'
  import type { AssetRegistry } from '../../render/assetRegistry'
  import AssetPanel from './AssetPanel.svelte'
  import LayoutPanel from './LayoutPanel.svelte'

  export let activeTab: 'layouts' | 'images'
  export let page: PageV1
  export let libraryTargetSlotId: string | null
  export let assets: AssetRecordV1[]
  export let filteredAssets: AssetRecordV1[]
  export let selectedAssetIds: string[]
  export let missingAssetIds: Set<string>
  export let assetRegistry: AssetRegistry
  export let imageRevision: number
  export let assetQuery: string
  export let assetSort: AssetSort
  export let assetFilter: AssetFilter
  export let onselectlayout: (preset: LayoutPresetDefinition) => void
  export let onerror: (message: string) => void
  export let ondrop: (event: DragEvent) => void
  export let onselectasset: (assetId: string, multi?: boolean) => void
  export let onstartdrag: (event: DragEvent, assetId: string) => void
  export let onaddtopage: (assetId: string) => void
  export let onreplace: (assetId: string) => void
  export let onrelink: (assetId: string) => void
  export let onremove: (assetIds: string[]) => void
  export let onchooseimages: () => void
  export let onmanageimages: () => void
  export let assetUsage: (assetId: string) => number
  export let formatBytes: (bytes: number) => string
  export let importStatus: ImportBatchStatus | null
  export let ondismissimport: () => void

  const tabs = ['layouts', 'images'] as const

  function focusTab(tab: (typeof tabs)[number]) {
    requestAnimationFrame(() => globalThis.document.getElementById(`editor-${tab}-tab`)?.focus())
  }

  function handleTabKeydown(event: KeyboardEvent, currentTab: (typeof tabs)[number]) {
    const currentIndex = tabs.indexOf(currentTab)
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    event.stopPropagation()
    activeTab = tabs[nextIndex]
    focusTab(activeTab)
  }
</script>

<aside
  class="sidebar left-panel"
  aria-label="Layouts and images"
  ondragover={(event) => event.preventDefault()}
  {ondrop}
>
  <div class="panel-tabs" role="tablist" aria-label="Editor panel">
    <button
      id="editor-layouts-tab"
      class:active={activeTab === 'layouts'}
      role="tab"
      aria-selected={activeTab === 'layouts'}
      aria-controls="editor-layouts-panel"
      tabindex={activeTab === 'layouts' ? 0 : -1}
      onkeydown={(event) => handleTabKeydown(event, 'layouts')}
      onclick={() => (activeTab = 'layouts')}>Layouts</button
    >
    <button
      id="editor-images-tab"
      class:active={activeTab === 'images'}
      role="tab"
      aria-selected={activeTab === 'images'}
      aria-controls="editor-images-panel"
      tabindex={activeTab === 'images' ? 0 : -1}
      onkeydown={(event) => handleTabKeydown(event, 'images')}
      onclick={() => (activeTab = 'images')}>Images</button
    >
  </div>

  <div
    id="editor-layouts-panel"
    class="sidebar-tab-panel"
    role="tabpanel"
    aria-labelledby="editor-layouts-tab"
    hidden={activeTab !== 'layouts'}
  >
    {#if activeTab === 'layouts'}
      <LayoutPanel {page} onselect={onselectlayout} {onerror}></LayoutPanel>
    {/if}
  </div>
  <div
    id="editor-images-panel"
    class="sidebar-tab-panel"
    role="tabpanel"
    aria-labelledby="editor-images-tab"
    hidden={activeTab !== 'images'}
  >
    {#if activeTab === 'images'}
      <AssetPanel
        {libraryTargetSlotId}
        {assets}
        {filteredAssets}
        bind:selectedAssetIds
        {missingAssetIds}
        {assetRegistry}
        {imageRevision}
        bind:assetQuery
        bind:assetSort
        bind:assetFilter
        {onselectasset}
        {onstartdrag}
        {onaddtopage}
        {onreplace}
        {onrelink}
        {onremove}
        {onchooseimages}
        {onmanageimages}
        {assetUsage}
        {formatBytes}
        {importStatus}
        {ondismissimport}
      ></AssetPanel>
    {/if}
  </div>
</aside>
