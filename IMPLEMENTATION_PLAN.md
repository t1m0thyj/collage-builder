# Collage Builder: implementation plan

Status: approved direction with a few implementation defaults still adjustable  
Target: local-first, browser-based collage editor  
Primary implementation language: TypeScript

## 1. Product definition

Build a desktop-first web application in which a user can:

- create a project with one or more collage pages;
- choose a rectangular layout preset, including uniform grids and asymmetric combinations;
- import local PNG, JPEG, or WebP photos;
- manage a project-scoped image collection with upload, search/filter, usage tracking, replacement, and deletion;
- assign a photo to a frame, pan and zoom it without distorting it, and swap or move photos between frames;
- replace an imported original everywhere it is used, or remove it from the project with clear usage information;
- configure page background/border color, outer padding, inter-frame gap, frame corner radius, and frame shadow;
- add, duplicate, rename, reorder, and delete pages without using a scrolling document canvas;
- undo and redo document edits;
- save and reopen a `.collage` project;
- relink an intentionally external, missing, or corrupt image without losing its placements;
- export one page as PNG at a chosen resolution, or all pages as a ZIP of numbered PNGs.

The first release should be a local-only static web app. It should not require accounts, a server, or image uploads.

### Explicit v1 non-goals

- freeform text, stickers, drawing, filters, or AI features;
- arbitrary overlapping photo layers outside layout frames;
- collaborative/cloud projects;
- a fully mobile-optimized editing experience;
- animated GIF export, PDF export, print color management, or CMYK;
- arbitrary polygonal frames;
- user-drawn layouts or draggable split dividers (the internal layout model will make this possible later).
- source-image rotation, flipping, color correction, filters, or other destructive preprocessing; users may prepare images before importing them.

## 2. Confirmed product decisions and remaining defaults

The first five directions below are confirmed. The remaining entries are implementation defaults that can be adjusted during development without changing the core architecture.

| Area                | Direction                                                                                                                                   | Status                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Browsers            | Chrome is primary. Keep core workflows working in current Edge, Firefox, and Safari; file-handle enhancements are capability-gated.         | Confirmed                   |
| Project portability | Embed the unmodified original bytes in `.collage` by default so reopening retains full resolution and does not depend on source paths.      | Confirmed                   |
| Device scope        | Desktop-first. Mobile-specific editing may be designed later.                                                                               | Confirmed                   |
| Layout scope        | Presets only in v1, with a large data-driven catalog grouped by total image/frame count. Preserve a path to editable custom layouts later.  | Confirmed                   |
| Image processing    | Crop pan/zoom remains part of fitting an image to a frame, but rotation, flip, filters, and destructive source transforms are out of scope. | Confirmed                   |
| Border behavior     | Expose the page background through outer padding and a uniform inter-frame gap rather than double strokes.                                  | Working default             |
| Shadow behavior     | Apply one page-level shadow style to every frame.                                                                                           | Working default             |
| Export all pages    | Produce a ZIP containing `project-name-01.png`, `project-name-02.png`, etc.                                                                 | Working default             |
| Project scale       | Optimize for up to 100 source images, 25 pages, and roughly 250 MB of original assets; warn rather than silently fail.                      | Working default to validate |

## 3. Technical recommendation

### Selected stack

- **Svelte 5 + TypeScript + Vite** for the client application. Use a plain SPA because no server rendering or route-level data loading is needed. It can be hosted as static assets and later wrapped as a PWA.
- **Konva + svelte-konva** for the interactive 2D scene graph. Konva supplies canvas hit testing, clipping, dragging, shadows, and high-resolution blob export. Keep Konva nodes out of the saved state.
- **Zod** for strict parsing of project JSON and migration boundaries. Types may be inferred from schemas where practical.
- **idb** as a small IndexedDB wrapper for autosaves, asset blobs, thumbnails, and optional file handles.
- **fflate** for asynchronous/streaming ZIP read and write. Store already-compressed JPEG/PNG/WebP bytes with ZIP compression level 0.
- **Vitest** for domain/unit tests and **Playwright** for browser workflows and export assertions.
- **Lucide Svelte** for icons. Use application-owned CSS variables and components instead of adopting a large component or utility CSS framework in v1.

Pin exact versions in the lockfile at scaffold time; do not copy floating versions from this plan.

### Why not Three.js

Three.js is excellent for a 3D scene or a very large GPU-oriented 2D scene, but this editor is primarily clipped rectangles, pointer hit testing, image dragging, and deterministic bitmap export. Using Three.js would require custom picking, shader/scissor clipping, rounded-corner masks, shadow composition, texture lifecycle management, and render-target export. It would not remove browser CORS restrictions. Konva directly implements the relevant 2D editor primitives and has a Svelte binding.

If a later release adds thousands of animated elements, perspective effects, or shader filters, reassess PixiJS or Three.js behind the renderer interface rather than changing the document model.

### Architectural rule

The serialized `CollageDocument` is the single source of truth. It contains only JSON-safe domain data. Canvas nodes, `HTMLImageElement`s, `ImageBitmap`s, object URLs, blobs, file handles, current selection, hover state, and open dialogs are runtime state and must never leak into `document.json`.

This separation is essential for reliable undo/redo, schema migrations, autosave, archive round trips, and a future alternate renderer.

## 4. UI and interaction specification

### Editor shell

Use a three-region workspace with a fixed top bar and bottom page bar:

```text
+-----------------------------------------------------------------------+
| New  Open  Save     undo redo        project title      Export PNG    |
+---------------+---------------------------------------+---------------+
| Layouts       |                                       | Properties    |
| Images        |           centered page canvas        | Page          |
|               |           (zoom-to-fit viewport)      | Frame/Image   |
| image library |                                       |               |
+---------------+---------------------------------------+---------------+
| <  Page 1  Page 2  +  >      duplicate / reorder / delete             |
+-----------------------------------------------------------------------+
```

- Left panel tabs: `Layouts` and `Images`. Layouts are grouped in collapsible sections by exact frame count (`1 photo`, `2 photos`, `3 photos`, and so on), with the current page's frame count expanded by default. Images provides a compact view of the project Image Manager plus an `Open manager` action for the full view.
- Center: one active page only, centered on a neutral pasteboard. Wheel/controls zoom the viewport but do not change the document.
- Right panel: contextual properties. With no frame selected show page dimensions and appearance. With a populated frame selected also show crop zoom, reset crop, replace, and remove.
- Bottom: page tabs if they fit; otherwise previous/next arrows plus a compact page menu. Page order should not depend on horizontal document scrolling.
- Top bar: file actions, undo/redo, editable project title, dirty/saving indicator, and export.

### Project Image Manager

Every project owns one image collection represented by `CollageDocument.assets`. It is not page-specific: pages and frames reference items from this collection by `AssetId`. Deleting a page can therefore make images unused without removing them or their embedded original bytes.

Provide both a compact left-panel browser for normal drag/assignment and a larger Image Manager dialog for collection maintenance. Both are views over the same store and command API.

The manager must provide:

- a prominent `Upload images` action plus OS drag/drop;
- thumbnail grid and compact list views;
- filename, intrinsic dimensions, original byte size, import status, and project-wide usage count;
- search by filename;
- filters for `All`, `Used`, `Unused`, and `Missing`;
- sorting by import order, filename, file size, and usage count;
- single and multi-selection;
- per-image `Replace original…`, `Remove from project`, `Show usages`, and `Locate…` when missing;
- bulk `Remove selected` and `Remove all unused` actions with the affected count and estimated bytes freed;
- project collection totals: image count and embedded-original size estimate.

`Show usages` lists page names and frame positions and lets the user jump to a use. Use deliberately distinct labels:

- `Remove from frame` clears one placement but keeps the image in the collection;
- `Remove from project` clears every placement using the image and removes its original from the next saved `.collage` file.

The first action should be lightweight and immediately undoable. The second must show the number of affected frames before confirmation, then remain undoable through the bounded deleted-byte cache. Page deletion never invokes either image-removal command.

### Core interactions

1. **Import**
   - Accept click-to-choose and OS drag/drop into either Image Manager view or the canvas.
   - Validate MIME/type and actual image decoding before committing.
   - Show a thumbnail, filename, dimensions, and usage count in the collection.
   - A file dropped directly onto a frame is imported into the project collection first, then assigned. Dropping over an occupied frame replaces that frame's content while leaving the former asset in the collection.
   - Preserve the exact imported bytes. Thumbnail generation and canvas decoding must never overwrite or downsample the embedded original.

2. **Replace/remove project images**
   - Each Image Manager item has an accessible overflow menu with `Replace original…`, `Remove from project`, and usage details.
   - `Replace original…` selects and validates new bytes, then updates the existing `AssetId`, so every frame using that asset updates automatically. Preserve normalized crop placement initially and offer `Reset crop` because a different aspect ratio may make the old focal position undesirable.
   - Removing an unused image happens immediately and shows an Undo toast.
   - Removing an image used by one or more frames shows the exact usage count and asks for confirmation. Confirmation clears those frames and removes the asset in one undoable command.
   - Keep deleted bytes in a bounded undo-resource cache until the command leaves history or the project closes. A successful undo must restore both metadata and original bytes.
   - Provide a `Remove all unused` manager action with a review/confirmation summary for cleaning large projects.

3. **Assign/move/swap**
   - Click a collection image, then click an empty frame, or drag from the compact Image Manager to a frame.
   - In normal/select mode, dragging a populated frame onto another frame moves it if the target is empty and swaps the entire `SlotContent` if occupied. Crop settings travel with their image.
   - Highlight valid targets during drag. Escape cancels a drag.
   - Make move/swap one undoable command.

4. **Crop mode**
   - Double-click a populated frame, press Enter on a selected frame, or use the `Crop` button.
   - While crop mode is active, dragging pans the image inside its clipped frame. A slider and wheel-with-modifier control zoom. The image is always constrained to cover the frame.
   - Enter/Apply commits one undo entry; Escape restores the pre-crop placement.
   - Render an obvious crop-mode outline so crop-pan is not confused with swap-drag.

5. **Layout change**
   - Show lightweight preview thumbnails grouped by the total number of frames, then optionally tagged as uniform, portrait-led, landscape-led, or asymmetric.
   - On selection, resolve old slots in visual reading order and assign their contents to new slots in reading order.
   - If the new layout has fewer frames, retain excess assets in the project image collection and show a non-destructive notice. No asset bytes are deleted.
   - The entire layout change is one undoable command.

6. **Page operations**
   - Add blank page using current page dimensions/styles and a default layout.
   - Duplicate performs a deep copy of the page and generates new page/slot IDs while reusing asset IDs.
   - When more than one page exists, delete the active page immediately and show an Undo toast. Its images remain in the project image collection and may become `Unused`; deleting a page never implicitly deletes originals.
   - Never allow zero pages. On the only remaining page, offer `Clear page` rather than delete.
   - Reorder via drag in the bottom strip and accessible move-left/move-right actions.

7. **Keyboard baseline**
   - `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y` where customary.
   - `Ctrl/Cmd+S` saves, `Ctrl/Cmd+O` opens.
   - Delete/Backspace clears the selected frame only when focus is not in an input.
   - Arrow keys move selection in visual order; Enter enters crop; Escape exits/cancels.
   - Every icon button needs a label/tooltip and visible focus state.

### Style controls

Page-level controls in v1:

- canvas width and height in logical pixels;
- background/border color;
- outer padding;
- inter-frame gap;
- corner radius, clamped to half the smaller frame dimension at render time;
- shadow enabled, color, opacity, blur size, horizontal offset, and vertical offset.

Do not implement the border as a stroke on every frame; adjacent strokes otherwise double at internal edges. Render the page background and leave `gap` and `padding` between clipped frames.

Render all frame shadows behind all photo frames, then frame content, then interaction overlays. This avoids one frame's shadow darkening a neighboring photo based only on arbitrary draw order.

## 5. Domain model

Use opaque string IDs (`crypto.randomUUID()`), ISO timestamps, and finite-number validation. Avoid TypeScript enums in serialized data.

```ts
type ProjectId = string
type PageId = string
type AssetId = string
type SlotId = string

interface CollageDocumentV1 {
  format: 'collage-builder'
  schemaVersion: 1
  projectId: ProjectId
  title: string
  createdAt: string
  updatedAt: string
  pages: PageV1[]
  assets: Record<AssetId, AssetRecordV1>
  exportDefaults: {
    width: number
    height: number
    aspectLocked: boolean
  }
}

interface PageV1 {
  id: PageId
  name: string
  width: number
  height: number
  layout: LayoutSnapshotV1
  slots: Record<SlotId, SlotContentV1 | null>
  style: PageStyleV1
}

interface PageStyleV1 {
  backgroundColor: string // canonical #RRGGBBAA
  padding: number
  gap: number
  cornerRadius: number
  shadow: {
    enabled: boolean
    color: string // canonical #RRGGBB
    opacity: number // 0..1
    blur: number
    offsetX: number
    offsetY: number
  }
}

type LayoutNodeV1 =
  | { kind: 'leaf'; slotId: SlotId }
  | {
      kind: 'split'
      axis: 'x' | 'y'
      weights: number[] // positive, same length as children
      children: LayoutNodeV1[]
    }

interface LayoutSnapshotV1 {
  presetId: string
  presetRevision: number
  root: LayoutNodeV1
}

interface SlotContentV1 {
  assetId: AssetId
  placement: {
    zoom: number // >= 1, multiplier on cover scale
    positionX: number // 0..1 across available horizontal overflow
    positionY: number // 0..1 across available vertical overflow
  }
}

interface AssetRecordV1 {
  id: AssetId
  originalName: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
  byteLength: number
  width: number
  height: number
  sha256: string
  storage:
    | { kind: 'embedded'; archivePath: string }
    | {
        kind: 'linked'
        displayHint: string
        lastModified?: number
      }
}
```

Do not persist `activePageId`, selection, editor zoom, panel state, object URL, decoded image, thumbnail blob, or file handle in this model. Persist session preferences separately.

### Layout resolution

Templates are split trees, not hard-coded pixel rectangles:

- an `x` split divides available width left-to-right;
- a `y` split divides available height top-to-bottom;
- normalize child weights by their sum;
- subtract `(childCount - 1) * gap` before distributing the remaining axis length;
- start with the page rectangle inset by `padding`;
- recurse until each leaf produces one frame rectangle;
- reject any layout/style combination that produces a non-positive frame.

This represents uniform grids and asymmetric combinations, scales to any page size, applies one consistent gap, and can later support draggable dividers by editing weights.

Create a pure `resolveLayout(page): ResolvedFrame[]` function and test it independently. Sort resolved frames by top edge, then left edge, with a small tolerance to establish visual reading order.

### Preset catalog foundation

Treat layouts as data, not bespoke UI components. A preset definition should contain a stable ID, revision, display name, frame count, tags, and a split-tree template whose leaves have stable template keys. Instantiating a preset generates real `SlotId`s and stores the resulting snapshot on the page.

```ts
interface LayoutPresetDefinition {
  id: string
  revision: number
  name: string
  frameCount: number
  tags: Array<'uniform' | 'asymmetric' | 'portrait-led' | 'landscape-led'>
  root: LayoutPresetNode
}
```

- Organize definitions by frame count, for example `definitions/2.ts`, `definitions/3.ts`, rather than maintaining one giant component.
- Derive `frameCount` from the tree in validation and reject a declared mismatch, duplicate ID, non-positive weight, invalid arity, or duplicate leaf key.
- Generate previews automatically from `resolveLayout`; adding a preset must not require hand-drawing a thumbnail.
- Render preview tiles as lightweight SVG or CSS rectangles, not a live Konva stage per preset.
- Use collapsible/lazy-rendered count groups so hundreds of presets do not create hundreds of active DOM/canvas trees at startup.
- Provide a small catalog test/helper that makes contributing new presets mostly a matter of adding one typed data entry. This is the extension point for building the large catalog collaboratively after the foundation is stable.

### Cover-crop math

For frame size `(fw, fh)`, image intrinsic size `(iw, ih)`, and saved placement:

```ts
const cover = Math.max(fw / iw, fh / ih)
const scale = cover * placement.zoom
const dw = iw * scale
const dh = ih * scale
const overflowX = Math.max(0, dw - fw)
const overflowY = Math.max(0, dh - fh)
const imageX = frame.x - placement.positionX * overflowX
const imageY = frame.y - placement.positionY * overflowY
```

Clip the image to a rounded frame path. Defaults are `zoom = 1`, `positionX = 0.5`, `positionY = 0.5`.

During a pan by canvas delta `(dx, dy)`:

```ts
positionX = overflowX === 0 ? 0.5 : clamp(positionX - dx / overflowX, 0, 1)
positionY = overflowY === 0 ? 0.5 : clamp(positionY - dy / overflowY, 0, 1)
```

This representation is resolution-independent and guarantees no blank edge appears. Preserve the current focal point when zoom changes. Clamp zoom to a documented range such as `1..8`.

## 6. State, commands, and history

Create a `ProjectStore` exposing read-only reactive state and named command methods. UI components must not mutate nested document properties directly.

Minimum command set:

- `createProject`, `renameProject`;
- `addPage`, `duplicatePage`, `renamePage`, `movePage`, `deletePage`, `setActivePage`;
- `applyLayout`;
- `importAssets`, `deleteAsset`, `deleteAllUnusedAssets`, `replaceAssetBytes`, `setAssetLinked`;
- `assignAsset`, `clearSlot`, `moveOrSwapSlotContent`;
- `beginCrop`, `previewCrop`, `commitCrop`, `cancelCrop`, `resetCrop`;
- `updatePageDimensions`, `updatePageStyle`;
- `undo`, `redo`.

History snapshots contain document JSON, not a copy of every active asset blob. A separate bounded undo-resource cache temporarily retains bytes removed or replaced by asset commands. A simple capped snapshot history is acceptable because the JSON is small; cap at 100 committed commands and release cached resources when their last restoring command is evicted. Coalesce pointer drags, color sliders, numeric steppers, and crop previews into one transaction from pointer-down/focus to pointer-up/blur. Importing several files is one command.

Keep a separate `EditorSessionStore` for active page, selection, active tool/mode, viewport zoom, drag preview, open dialog, and capability detection.

## 7. Rendering architecture

### Runtime asset registry

Implement an `AssetRegistry` keyed by `AssetId`:

```ts
interface RuntimeAsset {
  blob?: Blob
  objectUrl?: string
  image?: HTMLImageElement | ImageBitmap
  thumbnailUrl?: string
  status: 'loading' | 'ready' | 'missing' | 'error'
  error?: string
}
```

- Load bytes from the opened archive, IndexedDB autosave, or an authorized file handle.
- Decode once, reuse across pages, and expose a reactive status.
- Revoke object URLs when an asset is replaced/removed and when a project closes.
- Preserve original encoded bytes for project saving. Do not re-encode source photos.
- Generate small thumbnails asynchronously and cache them in IndexedDB.

### Canvas scene

Use one Konva stage for the editor with these conceptual groups/layers:

1. page background;
2. all frame shadow shapes;
3. rounded-clipped frame groups containing images;
4. hit targets and empty-frame affordances;
5. selection, crop-mode, and drag/drop overlays.

Only the active page has live canvas nodes. Page thumbnails should be generated lazily after a page changes, not rendered as additional live stages.

Implement a renderer adapter such as `renderPage(page, assets, target): RenderHandle`. Both the interactive editor and export path must call the same layout and image-placement functions. The export must omit all hit targets, selections, and guides.

Do not serialize with `stage.toJSON()`; Konva serialization is not the application file format and cannot represent the asset byte lifecycle or migrations safely.

### Viewport scaling

Keep document coordinates independent from CSS viewport size. Compute a fit scale from available center-panel dimensions, apply it to the stage/page group, and store user viewport zoom only in session state. Pointer deltas must be converted back to document coordinates before updating placements.

## 8. Image import and CORS policy

Local files chosen by `<input type="file">`, dropped from the OS, or returned by a file picker become `File`/`Blob` objects and can be loaded through object URLs. This does not require an absolute path and does not taint the canvas.

A generic web application cannot persist an arbitrary absolute local path and silently reopen it. The File System Access API can retain handles in supporting browsers, but availability and permissions vary. Therefore:

- self-contained embedded assets are the default and portable behavior;
- optional linked assets are a progressive enhancement;
- store a granted `FileSystemFileHandle` only in local IndexedDB, associated with project and asset IDs, never inside the downloadable `.collage` archive;
- on reopen, query/request handle permission only in direct response to a user action;
- all browsers must have a standard file-input relink fallback.

Do not accept arbitrary remote image URLs in v1. A remote server that does not opt into CORS can taint canvas and make PNG export fail. If URL import is added later, fetch the URL with CORS, convert the successful response to a local blob, and reject it otherwise.

### Import validation

- Accept JPEG, PNG, and WebP in v1. Reject SVG because active/external content handling adds a security surface. Reject or explicitly flatten animated formats.
- Decode before adding the asset record; do not trust the extension alone.
- Extract intrinsic dimensions from the decoded image.
- Compute SHA-256 with Web Crypto. If an identical hash already exists, reuse the existing asset and discard the duplicate bytes.
- Enforce configurable per-file and aggregate safety thresholds with a clear message; do not fail midway without naming the offending file.

## 9. Project file formats

Define `.collage` as a ZIP container with MIME type `application/vnd.collage-builder+zip`:

```text
example.collage
├── mimetype                    # exact MIME string, stored uncompressed
├── document.json               # CollageDocumentV1, UTF-8
├── assets/
│   ├── <asset-id>.jpg
│   ├── <asset-id>.png
│   └── <asset-id>.webp
└── previews/
    └── cover.webp              # optional; safe to omit initially
```

Rules:

- Asset archive names are generated from IDs, never user-provided paths.
- `document.json` references each embedded byte entry through `archivePath`.
- Embed every asset still present in the project image collection, including currently unused assets. Exclude assets the user explicitly removed.
- Use original compressed image bytes and ZIP store/no-compression for them; compress JSON normally.
- `schemaVersion` governs document migrations. `mimetype`/container parsing has its own independently versioned rules if the outer structure changes.
- Saving writes a fresh coherent archive to a temporary stream/blob, then replaces/downloads the destination. Never mutate an existing ZIP in place.
- `Save` uses an existing writable handle when supported and authorized. `Save As` chooses a new destination. Other browsers download a new file.
- Mark the project clean only after the archive writer completes successfully.

Define `.collage.json` as the linked alternative. It contains the validated document JSON directly, requires every asset record to use a safe relative linked path, and contains no original image bytes. On save and open, the user selects an asset-root directory; the same relative paths may be resolved beneath a different root on another machine. Embedded metadata is invalid in `.collage.json`, and linked metadata is invalid in `.collage`.

### Safe open pipeline

1. Read the ZIP central directory and reject malformed archives, duplicate critical paths, unsupported compression, excessive entry counts, path traversal names, or implausible expanded sizes.
2. Read and verify `mimetype` and `document.json` before decoding assets.
3. Parse JSON, validate with the schema, and migrate one version at a time to the current in-memory version.
4. Validate referential integrity: unique IDs, at least one page, layout leaves matching slot keys, and every placement referencing a declared asset.
5. Load embedded entries and verify byte length, decodability, dimensions, and SHA-256. Mark a bad/missing asset as missing rather than rejecting an otherwise recoverable project.
6. Only replace the currently open project after the new document reaches a usable state. Opening a corrupt file must not destroy unsaved work.

### Relink/restore workflow

Open a `Missing Assets` dialog listing thumbnail placeholder, original name, dimensions, byte size, and every page using the asset.

- `Locate…` lets the user pick one replacement file.
- `Locate folder/files…` accepts several candidates and matches exact SHA-256 first.
- If no hash matches, suggest candidates by filename, dimensions, and size, but require confirmation.
- Successful relinking replaces bytes behind the same `AssetId`; all placements recover automatically.
- Let the user keep the old identity with new bytes (explicitly updates hash/metadata and marks dirty) or cancel. Never silently substitute a hash mismatch.

## 10. Autosave and recovery

Use IndexedDB stores such as:

- `projects`: latest document snapshot and timestamps;
- `assetBlobs`: original bytes keyed by `[projectId, assetId]`;
- `thumbnails`: derived small blobs;
- `handles`: optional structured-cloneable file handles;
- `preferences`: last project, panel widths, recent export size.

After each committed command, debounce autosave for roughly one second. Write the document and newly changed asset blobs transactionally where possible. Show `Saving…`, `Saved locally`, or a recoverable error state. Request persistent browser storage after the user first saves/imports meaningful work, but never imply it is a replacement for downloading a `.collage` file.

At startup, offer to restore the last autosave. Keep a small set of rolling document snapshots, but de-duplicate asset blobs by hash/ID. Add a storage-management dialog showing estimated usage and allowing the user to remove old local recoveries without affecting downloaded files.

## 11. PNG export

### Export dialog

- scope: current page or all pages;
- width and height with aspect lock enabled by default;
- presets: 1x, 2x, 4x page dimensions plus a custom entry;
- transparent background may be deferred because the background is also the requested border color; v1 always exports the chosen background;
- summary of page count, output dimensions, and low-source-resolution warnings.

When aspect lock is on, editing one dimension derives the other from the page aspect ratio. For all pages, require the pages to share an aspect ratio or export each at its own page-relative scale rather than distorting them.

### Export pipeline

1. Ensure every used asset for the selected page is decoded. Block with the relink dialog if anything is missing.
2. Build an export-only page group using the same pure layout/crop functions as the editor.
3. Let `pixelRatio = targetWidth / page.width`; verify the derived height exactly matches the requested height after rounding.
4. Export to `Blob` asynchronously, not a base64 data URL.
5. Verify the blob is non-empty, then download/write it.
6. For all pages, render sequentially, release each temporary stage/canvas promptly, and stream/store PNG entries into a ZIP with compression level 0.

Before export, estimate raw canvas memory (`width * height * 4`, multiplied by a conservative working-buffer factor). Probe allocation and catch browser failures; canvas limits vary by browser/device. Start with a product guardrail such as 64 megapixels and a maximum side of 8192, but keep these constants centralized and revise them from browser testing. Never crash or produce a zero-byte file for an oversized request.

Warn if the source pixels contributing to a frame are materially below its output pixel dimensions at the requested export scale. Allow export after warning because upscaling may be intentional.

## 12. Suggested source layout

```text
src/
├── App.svelte
├── app.css
├── lib/
│   ├── components/
│   │   ├── editor/CanvasEditor.svelte
│   │   ├── editor/CropOverlay.svelte
│   │   ├── panels/LayoutPanel.svelte
│   │   ├── panels/ImageManagerPanel.svelte
│   │   ├── panels/ImageCollectionView.svelte
│   │   ├── panels/PropertiesPanel.svelte
│   │   ├── pages/PageBar.svelte
│   │   └── dialogs/{ImageManager,Export,MissingAssets,OpenError}.svelte
│   ├── domain/
│   │   ├── types.ts
│   │   ├── schema.ts
│   │   ├── migrations.ts
│   │   ├── geometry.ts
│   │   ├── crop.ts
│   │   ├── commands.ts
│   │   └── invariants.ts
│   ├── layouts/
│   │   ├── catalog.ts
│   │   ├── validatePreset.ts
│   │   ├── preview.ts
│   │   └── definitions/
│   │       ├── 1.ts
│   │       ├── 2.ts
│   │       ├── 3.ts
│   │       └── ...
│   ├── render/
│   │   ├── pageRenderer.ts
│   │   ├── frameRenderer.ts
│   │   ├── assetRegistry.ts
│   │   └── exportPng.ts
│   ├── state/
│   │   ├── projectStore.svelte.ts
│   │   ├── sessionStore.svelte.ts
│   │   └── history.ts
│   ├── persistence/
│   │   ├── archive.ts
│   │   ├── autosave.ts
│   │   ├── fileAccess.ts
│   │   ├── relink.ts
│   │   └── capabilities.ts
│   └── utils/
│       ├── color.ts
│       ├── ids.ts
│       └── numbers.ts
├── workers/
│   ├── archive.worker.ts
│   └── thumbnail.worker.ts
└── test-fixtures/
    └── ...
tests/
├── unit/
├── integration/
└── e2e/
```

Worker boundaries can be introduced when measurements show main-thread stalls; keep archive/hash/thumbnail APIs promise-based from the start so moving work does not alter callers.

## 13. Implementation sequence and acceptance gates

### Phase 0: scaffold and decisions

- Scaffold Svelte + Vite + strict TypeScript.
- Add formatting, linting, `svelte-check`, Vitest, and Playwright.
- Add ADRs for renderer, archive strategy, and supported browser baseline.
- Establish design tokens, shell layout, error boundary, and toast/dialog primitives.

Gate: production build, type check, unit test, and one Playwright smoke test pass in CI.

### Phase 1: domain and layouts

- Implement schemas, factories, invariants, split-tree resolution, crop math, and preset catalog.
- Build data-driven preset validation, automatic previews, grouping by exact frame count, and lazy/collapsible catalog rendering before expanding the catalog.
- Seed the catalog with uniform 1x2, 2x1, 2x2, 2x3, 3x2, 4x2, and 2x4 grids plus several nested asymmetric presets. Expand it broadly after interaction and geometry foundations are stable.
- Implement project/session stores and transactional history.

Gate: unit tests cover invalid/duplicate preset definitions, derived frame counts, extreme gaps/padding, reading order, resize stability, pan clamps, zoom focal preservation, layout reassignment, and undo/redo. Adding one valid preset data entry automatically places it in the correct count group with a generated preview.

### Phase 2: canvas editor

- Render active page background, shadows, empty frames, clipped images, and selection overlays.
- Implement fit-to-viewport and pointer/document coordinate conversion.
- Implement selection and crop mode with transactional previews.

Gate: the same deterministic document produces expected frame rectangles at multiple page sizes; crop never exposes an empty edge at min/max zoom and pan.

### Phase 3: assets and drag/drop

- Implement import validation, hashing, de-duplication, registry, thumbnails, the compact and full Image Manager views, assignment, move, swap, replace-original, and deletion flows.
- Add search, filters, sorting, selection, bulk removal, collection totals, missing/error states, usage navigation, undo-resource retention, and unused-asset cleanup.

Gate: import a batch through the manager, filter used/unused accurately, assign via click and drag, swap two differently cropped images, move to empty, replace one original everywhere, delete used/unused/selected images, undo/redo each including byte restoration, and verify object URLs/resources are released after history eviction or project close.

### Phase 4: styling and pages

- Build page/style inspector, page bar, add/duplicate/reorder/delete, layout previews, and layout switching.
- Add keyboard flows and accessible alternatives for drag actions.

Gate: create five pages with different layouts/styles, navigate without a scrolling document, duplicate/reorder/delete with Undo, verify page deletion retains project images, and complete equivalent core actions by keyboard.

### Phase 5: persistence

- Implement IndexedDB autosave/recovery.
- Implement safe ZIP write/read, schema validation, migration harness, dirty state, Save/Save As fallbacks, and optional persistent handles.
- Implement missing-asset recovery and relinking.

Gate: a save/open round trip preserves every JSON field and original asset hash; corrupt JSON and missing asset entries produce recoverable diagnostics; unsaved current work survives a failed open.

### Phase 6: export

- Implement export dialog, export-only renderer, resolution validation, quality warnings, PNG blob writing, and all-pages ZIP.
- Add progress and cancellation for multi-page export.

Gate: automated tests decode exported PNG headers and assert exact requested dimensions; pixel-sample fixtures verify background/gaps/corners; no selection overlay appears; all-pages ZIP names/order are deterministic.

### Phase 7: hardening and release

- Cross-browser runs in Chromium, Firefox, and WebKit; manually verify File System Access enhancements in Chrome/Edge.
- Profile 100-image/25-page fixture, large archive open/save, repeated page switching, and high-resolution export.
- Add recovery copy prompts, storage management, onboarding, unsupported-file messages, and before-unload dirty warning.
- Audit focus order, contrast, screen-reader labels, reduced motion, and keyboard-only operation.

Gate: all acceptance scenarios below pass, known browser limitations are documented, and no high-severity accessibility or data-loss issue remains.

## 14. Test matrix

### Unit/property tests

- schema acceptance/rejection and every migration;
- catalog validation, exact frame-count grouping, unique preset IDs, and preview geometry;
- randomized split trees always tile the padded area with exact gaps and no overlap;
- crop math at portrait/landscape/square extremes and zoom bounds;
- slot reassignment and swaps preserve asset-placement pairing;
- command history coalescing, deleted-byte resource retention/eviction, and dirty-state transitions;
- archive path sanitization and expanded-size guards;
- color normalization and numeric clamping.

### Integration tests

- archive save/open byte and document round trip;
- missing/corrupt asset opens in recoverable mode;
- relink exact and mismatch-confirmed paths;
- autosave recovery with shared asset blobs;
- renderer and export use identical resolved geometry;
- replacing an asset preserves its ID/usages and archive round trips the new original bytes;
- asset deletion clears all usages and Undo restores both usages and bytes;
- page deletion does not delete project assets and immediately updates their used/unused counts and filters;
- Image Manager search, sort, bulk selection, usage navigation, and storage totals derive from project state rather than separate duplicated state.

### End-to-end scenarios

1. Create 2x2 page, import four images, populate frames, crop each, swap two, style the page, save, reopen, and compare state.
2. Change 2x3 to 2x2, verify two images remain in tray, then undo.
3. Create/duplicate/reorder three pages and export all in deterministic order.
4. Remove a linked source, reopen, relink from a renamed file with the same hash, and export.
5. Request an oversized export and receive an actionable error without losing the project.
6. Complete import, assignment, crop, page navigation, save, and export using keyboard-accessible controls.
7. Replace a photo used on several pages and see every use update; remove it, undo, save/reopen, and verify the exact expected original hash at every step.
8. Delete a page, verify its unique images move to the manager's `Unused` filter, bulk-remove them, undo the removal, and verify their bytes and usage status recover.

## 15. Definition of done for v1

- All user-visible edits are deterministic, undoable, autosaved, and represented in the schema.
- A self-contained `.collage` file embeds the unmodified full-resolution bytes for every project asset and reopens on another supported browser/device with no source files present.
- Missing linked/corrupt assets can be restored without recreating page placements.
- Replacing an original updates every use through the same asset identity; removing an asset clearly reports its usages and can be undone with its original bytes intact.
- Every project has an Image Manager for upload, browsing, search/filter, usage inspection, replacement, individual deletion, and bulk unused-image cleanup.
- Deleting a page is a quick undoable action and never implicitly removes images from the project collection; newly unused images are visible in the manager.
- The layout browser supports a large, data-driven catalog grouped by exact frame count, and a contributor can add a preset without writing preview UI.
- Dragging between occupied frames swaps images and their crop placements; dragging to empty moves them.
- Corner radius, background/gap/padding, and shadow match between editor and PNG output.
- Multi-page projects can be managed without document scrolling and exported individually or as a ZIP.
- PNG output has exact requested dimensions within documented limits.
- The application remains usable after expected failures: bad image, corrupt project, denied file permission, storage quota error, or oversized export.
- Type check, unit/integration tests, and cross-browser end-to-end suite pass from a clean checkout.

## 16. Primary technical references

- [Svelte documentation](https://svelte.dev/docs/svelte/overview)
- [Konva overview and Svelte integration](https://konvajs.org/docs/svelte/index.html)
- [Konva cover-crop example](https://konvajs.org/docs/sandbox/Scale_Image_To_Fit.html)
- [Konva high-quality export](https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html)
- [MDN File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
- [MDN IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN canvas and cross-origin images](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image)
- [fflate ZIP documentation](https://github.com/101arrowz/fflate)
