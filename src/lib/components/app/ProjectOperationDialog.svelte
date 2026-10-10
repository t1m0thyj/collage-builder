<script lang="ts">
  import type { ProjectOperation } from '../../app/projectOperation'
  import { operationPercent } from '../../app/projectOperation'
  import * as Dialog from '../ui/dialog'

  export let operation: ProjectOperation | null = null
  export let visible = false

  $: percent = operation ? operationPercent(operation) : undefined
  $: title = operation?.kind === 'save' ? 'Saving project' : 'Opening project'
</script>

{#if operation && visible}
  <Dialog.Root open onOpenChange={() => undefined}>
    <Dialog.Content
      class="dialog project-operation-dialog"
      aria-labelledby="project-operation-title"
      aria-describedby="project-operation-detail"
      onInteractOutside={(event) => event.preventDefault()}
      onEscapeKeydown={(event) => event.preventDefault()}
    >
      <header class="dialog-header project-operation-header">
        <div>
          <p class="eyebrow">Project file</p>
          <h2 id="project-operation-title">{title}</h2>
        </div>
      </header>
      <div class="project-operation-content" aria-live="polite">
        <p id="project-operation-detail" class="project-operation-phase">{operation.phase}</p>
        {#if percent !== undefined}
          <div
            class="project-operation-progress"
            role="progressbar"
            aria-label={operation.phase}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={percent}
          >
            <span style={`width:${percent}%`}></span>
          </div>
          <p class="project-operation-count">
            {percent}%{operation.detail ? ` · ${operation.detail}` : ''}
          </p>
        {:else}
          <div
            class="project-operation-progress project-operation-indeterminate"
            role="progressbar"
          >
            <span></span>
          </div>
          {#if operation.detail}<p class="project-operation-count">{operation.detail}</p>{/if}
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Root>
{/if}

<style>
  :global(.project-operation-dialog) {
    width: min(390px, calc(100vw - 48px));
  }
  .project-operation-header {
    align-items: flex-start;
  }
  .project-operation-header .eyebrow {
    margin: 0 0 3px;
  }
  h2 {
    margin: 0;
    font-size: 17px;
  }
  .project-operation-content {
    padding: 20px;
  }
  .project-operation-phase {
    margin: 0;
    color: var(--app-text);
    font-size: 14px;
    font-weight: 650;
  }
  .project-operation-progress {
    height: 8px;
    margin-top: 18px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--app-surface-muted);
  }
  .project-operation-progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary);
    transition: width 120ms linear;
  }
  .project-operation-count {
    margin: 9px 0 0;
    color: var(--app-text-muted);
    font-size: 13px;
  }
  .project-operation-indeterminate span {
    width: 38%;
    animation: sweep 1.15s ease-in-out infinite;
  }
  @keyframes sweep {
    from {
      transform: translateX(-120%);
    }
    to {
      transform: translateX(310%);
    }
  }
</style>
