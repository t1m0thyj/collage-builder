<script lang="ts">
  import { FolderOpen, Images, LayoutTemplate, ShieldCheck, X } from '@lucide/svelte'
  import type { StartupRecovery } from '../../app/recovery'
  import * as Dialog from '../ui/dialog'
  import RecoveryThumbnail from './RecoveryThumbnail.svelte'

  export let onboardingOpen: boolean
  export let startupRecovery: StartupRecovery | null
  export let restoringRecovery: boolean
  export let oncloseonboarding: () => void
  export let onimportimages: () => void
  export let onopenproject: () => void
  export let onrestorerecovery: () => void
  export let onstartblank: () => void
  export let onmanagerecovery: () => void

  function formatDate(value: string): string {
    const date = new Date(value)
    return Number.isNaN(date.valueOf()) ? 'Date unavailable' : date.toLocaleString()
  }
</script>

<Dialog.Root
  open={Boolean(startupRecovery)}
  onOpenChange={(open) => !open && !restoringRecovery && onstartblank()}
>
  {#if startupRecovery}
    <Dialog.Content class="dialog startup-dialog" aria-labelledby="startup-recovery-title">
      <div class="dialog-header">
        <div>
          <p class="eyebrow">Recent collage found</p>
          <h2 id="startup-recovery-title">Pick up where you left off?</h2>
        </div>
      </div>
      <div class="startup-content">
        <div class="startup-recovery-card">
          <RecoveryThumbnail
            blob={startupRecovery.preview}
            alt={`Preview of ${startupRecovery.title}`}
          ></RecoveryThumbnail>
          <div>
            <strong>{startupRecovery.title}</strong>
            <span>
              Last changed {formatDate(startupRecovery.updatedAt)} · {startupRecovery.assetCount}
              image{startupRecovery.assetCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <p>
          This draft is saved on this device. Continue editing it, or start a new collage and keep
          this one for later.
        </p>
      </div>
      <div class="dialog-footer startup-footer">
        <button class="text-button" disabled={restoringRecovery} onclick={onmanagerecovery}
          >See saved drafts</button
        >
        <span>
          <button class="button" disabled={restoringRecovery} onclick={onstartblank}
            >Start a new collage</button
          ><button
            class="button button-primary"
            disabled={restoringRecovery}
            onclick={onrestorerecovery}
            >{restoringRecovery ? 'Opening…' : 'Continue this collage'}</button
          >
        </span>
      </div>
    </Dialog.Content>
  {/if}
</Dialog.Root>

<Dialog.Root
  open={onboardingOpen && !startupRecovery}
  onOpenChange={(open) => !open && oncloseonboarding()}
>
  <Dialog.Content class="dialog startup-dialog" aria-labelledby="quick-start-title">
    <div class="dialog-header">
      <div>
        <p class="eyebrow">Welcome to Collage Builder</p>
        <h2 id="quick-start-title">Create your first collage</h2>
      </div>
      <button class="icon-button" aria-label="Close quick start" onclick={oncloseonboarding}
        ><X size={17}></X></button
      >
    </div>
    <div class="startup-content">
      <ol class="quick-start-steps">
        <li>
          <Images size={20} aria-hidden="true"></Images>
          <div>
            <strong>Import images</strong><span>Add photos from this device to a new project.</span>
          </div>
        </li>
        <li>
          <LayoutTemplate size={20} aria-hidden="true"></LayoutTemplate>
          <div>
            <strong>Choose a layout</strong><span
              >Then drag photos into frames and crop them as desired.</span
            >
          </div>
        </li>
        <li>
          <ShieldCheck size={20} aria-hidden="true"></ShieldCheck>
          <div>
            <strong>Save a copy you can keep</strong>
            <span>Export collage images and download the project to edit later.</span>
          </div>
        </li>
      </ol>
      <p class="privacy-note">Your photos stay on this device and are not uploaded to the cloud.</p>
    </div>
    <div class="dialog-footer startup-footer">
      <button class="button" onclick={onopenproject}
        ><FolderOpen size={15} aria-hidden="true"></FolderOpen> Open project</button
      ><button class="button button-primary" onclick={onimportimages}
        ><Images size={15} aria-hidden="true"></Images> Import images</button
      >
    </div>
  </Dialog.Content>
</Dialog.Root>
