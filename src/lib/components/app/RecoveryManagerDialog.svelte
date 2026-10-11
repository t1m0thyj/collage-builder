<script lang="ts">
  import { Database, ShieldCheck, TriangleAlert, X } from '@lucide/svelte'
  import { RecoveryController, type RecoveryState } from '../../app/recovery'
  import type { RecoveryManagementSnapshot } from '../../persistence/autosave'
  import * as Dialog from '../ui/dialog'
  import RecoveryThumbnail from './RecoveryThumbnail.svelte'

  export let open: boolean
  export let recovery: RecoveryController
  export let state: RecoveryState
  export let activeProjectId: string
  export let formatBytes: (bytes: number) => string
  export let announce: (message: string) => void

  let loading = false
  let snapshot: RecoveryManagementSnapshot | null = null
  let pendingRestoreId: string | null = null
  let pendingRemoveId: string | null = null
  let confirmRemoveAll = false

  function setOpen(value: boolean) {
    open = value
  }

  $: if (open) void refresh()
  $: if (!open) {
    pendingRestoreId = null
    pendingRemoveId = null
    confirmRemoveAll = false
  }

  function formatDate(value?: string): string {
    if (!value) return 'Date unavailable'
    const date = new Date(value)
    return Number.isNaN(date.valueOf()) ? 'Date unavailable' : date.toLocaleString()
  }

  async function refresh() {
    loading = true
    try {
      snapshot = await recovery.managementSnapshot()
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to read browser storage details.')
    } finally {
      loading = false
    }
  }

  async function restore(projectId: string) {
    try {
      await recovery.restoreProject(projectId)
      open = false
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to restore that local project.')
      await refresh()
    }
  }

  async function remove(projectId: string) {
    try {
      await recovery.deleteProject(projectId)
      pendingRemoveId = null
      announce('Local recovery removed.')
      await refresh()
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to remove that local recovery.')
    }
  }

  async function removeAll() {
    try {
      await recovery.clearProjects()
      confirmRemoveAll = false
      announce('All local recoveries removed.')
      await refresh()
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to remove local recoveries.')
    }
  }

  async function requestPersistence() {
    try {
      const granted = await recovery.requestPersistence()
      announce(
        granted === true
          ? 'Local data is now protected from automatic browser cleanup.'
          : granted === false
            ? 'The browser did not grant persistent storage.'
            : 'Persistent storage is not supported by this browser.',
      )
      await refresh()
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Unable to request persistent storage.')
    }
  }
</script>

<Dialog.Root {open} onOpenChange={setOpen}>
  <Dialog.Content class="dialog recovery-dialog" aria-labelledby="recovery-manager-title">
    <div class="dialog-header">
      <div>
        <p class="eyebrow">Browser storage</p>
        <h2 id="recovery-manager-title">Local recovery</h2>
      </div>
      <button class="icon-button" aria-label="Close local recovery" onclick={() => setOpen(false)}
        ><X size={17}></X></button
      >
    </div>

    <div class="recovery-content">
      {#if state.status === 'failed' || state.status === 'conflict'}
        <section class="recovery-alert" class:recovery-conflict={state.status === 'conflict'}>
          <TriangleAlert size={18} aria-hidden="true"></TriangleAlert>
          <div>
            <strong>{state.message}</strong>
            <p>{state.detail}</p>
            {#if state.status === 'conflict'}
              <button class="button" onclick={() => recovery.takeOver()}
                >Use this tab instead</button
              >
            {/if}
          </div>
        </section>
      {:else}
        <section class="recovery-state">
          <Database size={18} aria-hidden="true"></Database>
          <div>
            <strong>{state.message}</strong>
            <p>
              Recovery copies are stored only in this browser. Downloaded project files are not
              affected by the controls below.
            </p>
          </div>
        </section>
      {/if}

      <section class="storage-summary" aria-labelledby="storage-summary-title">
        <div>
          <h3 id="storage-summary-title">Storage usage</h3>
          <p>
            Recovery copies are limited to 2 GB. Older copies are removed automatically as needed.
          </p>
          {#if snapshot?.storage.usage !== undefined && snapshot.storage.quota !== undefined}
            <p>
              {formatBytes(snapshot.storage.usage)} of {formatBytes(snapshot.storage.quota)} used by this
              site
            </p>
            <meter
              min="0"
              max={snapshot.storage.quota}
              value={snapshot.storage.usage}
              aria-label="Browser storage used"
            ></meter>
          {:else}
            <p>This browser does not report storage usage and quota.</p>
          {/if}
        </div>
        <div class="storage-persistence">
          {#if snapshot?.storage.persisted}
            <ShieldCheck size={18} aria-hidden="true"></ShieldCheck>
            <span>Protected from automatic browser cleanup</span>
          {:else if snapshot?.storage.persistenceSupported}
            <span>The browser may clear local copies when space is low.</span>
            <button class="button" onclick={() => void requestPersistence()}
              >Protect local data</button
            >
          {:else}
            <span>Persistent storage is not supported by this browser.</span>
          {/if}
        </div>
      </section>

      <section aria-labelledby="recovery-copies-title">
        <div class="recovery-section-heading">
          <div>
            <h3 id="recovery-copies-title">Recovery copies</h3>
            <p>Up to five recent projects are kept.</p>
          </div>
          <button class="text-button" onclick={() => void refresh()} disabled={loading}
            >Refresh</button
          >
        </div>

        {#if loading && !snapshot}
          <p class="recovery-empty">Checking local storage…</p>
        {:else if !snapshot?.recoveries.length}
          <p class="recovery-empty">No local recovery copies are stored.</p>
        {:else}
          <ul class="recovery-list">
            {#each snapshot.recoveries as recovery (recovery.projectId)}
              <li class:corrupt-recovery={recovery.corrupt}>
                <RecoveryThumbnail blob={recovery.preview} alt={`Preview of ${recovery.title}`}
                ></RecoveryThumbnail>
                <div class="recovery-copy-details">
                  <strong>{recovery.title}</strong>
                  <span>
                    {formatDate(recovery.updatedAt)} · {formatBytes(recovery.bytes)} · {recovery.assetCount}
                    image{recovery.assetCount === 1 ? '' : 's'}
                  </span>
                  {#if recovery.projectId === activeProjectId}<small>Current project</small>{/if}
                  {#if recovery.corrupt}<small>Unreadable — safe to remove</small>{/if}
                </div>
                <div class="recovery-copy-actions">
                  {#if !recovery.corrupt && recovery.projectId !== activeProjectId}
                    {#if pendingRestoreId === recovery.projectId}
                      <button
                        class="button button-primary"
                        onclick={() => void restore(recovery.projectId)}>Confirm restore</button
                      >
                    {:else}
                      <button class="button" onclick={() => (pendingRestoreId = recovery.projectId)}
                        >Restore</button
                      >
                    {/if}
                  {/if}
                  {#if pendingRemoveId === recovery.projectId}
                    <button class="button danger" onclick={() => void remove(recovery.projectId)}
                      >Confirm remove</button
                    >
                  {:else}
                    <button
                      class="text-button"
                      onclick={() => (pendingRemoveId = recovery.projectId)}>Remove</button
                    >
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>

    <div class="dialog-footer recovery-footer">
      {#if confirmRemoveAll}
        <span>Remove every local recovery copy?</span>
        <span>
          <button class="button" onclick={() => (confirmRemoveAll = false)}>Cancel</button>
          <button class="button danger" onclick={() => void removeAll()}>Remove all</button>
        </span>
      {:else}
        <button
          class="text-button danger-text"
          disabled={!snapshot?.recoveries.length}
          onclick={() => (confirmRemoveAll = true)}>Remove all recoveries</button
        >
        <button class="button" onclick={() => setOpen(false)}>Done</button>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
