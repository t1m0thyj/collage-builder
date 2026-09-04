<script lang="ts">
  export let onimport: (files: FileList | null) => void | Promise<void>
  export let onreplace: (file: File | undefined) => void | Promise<void>
  export let onrelink: (file: File | undefined) => void | Promise<void>
  export let onopen: (file: File | undefined) => void | Promise<void>

  let uploadInput: HTMLInputElement
  let replaceInput: HTMLInputElement
  let relinkInput: HTMLInputElement
  let projectInput: HTMLInputElement
  let linkedFolderInput: HTMLInputElement
  let linkedFolderResolver: ((files: FileList | null) => void) | null = null

  export function chooseImages() {
    uploadInput.click()
  }

  export function chooseReplacement() {
    replaceInput.click()
  }

  export function chooseRelink() {
    relinkInput.click()
  }

  export function chooseProject() {
    projectInput.click()
  }

  export function chooseLinkedFolder(): Promise<FileList | null> {
    linkedFolderInput.value = ''
    linkedFolderInput.click()
    return new Promise((resolve) => (linkedFolderResolver = resolve))
  }

  function finishLinkedFolderSelection(files: FileList | null) {
    const resolve = linkedFolderResolver
    linkedFolderResolver = null
    resolve?.(files?.length ? files : null)
  }

  async function importFiles(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget
    try {
      await onimport(input.files)
    } finally {
      input.value = ''
    }
  }

  async function replaceFile(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget
    try {
      await onreplace(input.files?.[0])
    } finally {
      input.value = ''
    }
  }

  async function relinkFile(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget
    try {
      await onrelink(input.files?.[0])
    } finally {
      input.value = ''
    }
  }

  async function openProject(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget
    try {
      await onopen(input.files?.[0])
    } finally {
      input.value = ''
    }
  }
</script>

<input
  class="sr-only"
  tabindex="-1"
  aria-hidden="true"
  bind:this={uploadInput}
  type="file"
  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
  multiple
  onchange={importFiles}
/>
<input
  class="sr-only"
  tabindex="-1"
  aria-hidden="true"
  bind:this={replaceInput}
  type="file"
  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
  onchange={replaceFile}
/>
<input
  class="sr-only"
  tabindex="-1"
  aria-hidden="true"
  bind:this={relinkInput}
  type="file"
  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
  onchange={relinkFile}
/>
<input
  class="sr-only"
  tabindex="-1"
  aria-hidden="true"
  bind:this={projectInput}
  type="file"
  accept=".collage,.collage.json,application/vnd.collage-builder+zip,application/json"
  onchange={openProject}
/>
<input
  class="sr-only"
  tabindex="-1"
  aria-hidden="true"
  bind:this={linkedFolderInput}
  type="file"
  multiple
  webkitdirectory
  onchange={(event) => finishLinkedFolderSelection(event.currentTarget.files)}
  oncancel={() => finishLinkedFolderSelection(null)}
/>
