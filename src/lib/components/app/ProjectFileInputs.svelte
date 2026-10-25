<script lang="ts">
  import type { LinkedFolderFile } from '../../persistence/linkedAssets'

  type DirectoryPickerWindow = Window & {
    showDirectoryPicker?: (options: { mode: 'read' }) => Promise<FileSystemDirectoryHandle>
  }

  export let onimport: (files: FileList | null) => void | Promise<void>
  export let onreplace: (file: File | undefined) => void | Promise<void>
  export let onrelink: (file: File | undefined) => void | Promise<void>
  export let onrelinkmany: (files: FileList | null) => void | Promise<void>
  export let onopen: (file: File | undefined) => void | Promise<void>

  let uploadInput: HTMLInputElement
  let replaceInput: HTMLInputElement
  let relinkInput: HTMLInputElement
  let relinkManyInput: HTMLInputElement
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

  export function chooseRelinkMany() {
    relinkManyInput.click()
  }

  export function chooseProject() {
    projectInput.click()
  }

  export function chooseLinkedFolder(): Promise<Iterable<File | LinkedFolderFile> | null> {
    const pickerWindow = window as DirectoryPickerWindow
    if (pickerWindow.showDirectoryPicker)
      return chooseReadableDirectory(pickerWindow.showDirectoryPicker.bind(pickerWindow))
    linkedFolderInput.value = ''
    linkedFolderInput.click()
    return new Promise((resolve) => (linkedFolderResolver = resolve))
  }

  async function chooseReadableDirectory(
    pickDirectory: NonNullable<DirectoryPickerWindow['showDirectoryPicker']>,
  ): Promise<LinkedFolderFile[] | null> {
    let root: FileSystemDirectoryHandle
    try {
      root = await pickDirectory({ mode: 'read' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null
      throw error
    }

    const files: LinkedFolderFile[] = []
    async function visit(directory: FileSystemDirectoryHandle, path = ''): Promise<void> {
      for await (const [name, handle] of directory.entries()) {
        const relativePath = path ? `${path}/${name}` : name
        if (handle.kind === 'directory') await visit(handle, relativePath)
        else files.push({ file: await handle.getFile(), relativePath })
      }
    }
    await visit(root)
    return files
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

  async function relinkFiles(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget
    try {
      await onrelinkmany(input.files)
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
  data-testid="photo-upload-input"
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
  data-testid="photo-replacement-input"
  type="file"
  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
  onchange={replaceFile}
/>
<input
  class="sr-only"
  tabindex="-1"
  aria-hidden="true"
  bind:this={relinkInput}
  data-testid="photo-relink-input"
  type="file"
  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
  onchange={relinkFile}
/>
<input
  class="sr-only"
  tabindex="-1"
  aria-hidden="true"
  bind:this={relinkManyInput}
  data-testid="photo-relink-many-input"
  type="file"
  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
  multiple
  onchange={relinkFiles}
/>
<input
  class="sr-only"
  tabindex="-1"
  aria-hidden="true"
  bind:this={projectInput}
  data-testid="project-file-input"
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
