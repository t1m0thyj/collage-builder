# Release checklist

This checklist tracks every finding from the initial architecture and first-release review.

- `[x]` complete and verified
- `[ ]` still required
- An unchecked item labelled **Partially complete** lists its completed and remaining portions underneath.

## Architecture assessment

### Release blockers

- [x] Make project opening atomic. Incoming documents and assets are staged and validated in a separate registry, and the live project is replaced only after staging succeeds. A damaged project-open regression test verifies that the current document and decoded assets survive failure.
- [x] Replace the full-resolution, all-images-in-memory strategy. The image library now uses bounded 256 px derived thumbnails, full originals remain untouched, active-page images decode lazily, and decoded images from inactive pages are released.
- [x] Remove synchronous, memory-multiplying archive and multi-page export work.
  - [x] Stream project ZIP input and output rather than using whole-buffer `zipSync`/`unzipSync`.
  - [x] Use worker-backed asynchronous inflation for compressed ZIP entries.
  - [x] Stream the final multi-page ZIP instead of constructing another complete ZIP byte buffer.
  - [x] Feed each rendered page directly into the ZIP writer before rendering the next page, retaining at most the current page image outside the growing final ZIP.
  - [x] Decode, draw, and encode exports in an OffscreenCanvas worker where supported, with a measured main-thread compatibility fallback. Each page records a `collage-export-render` User Timing measure with duration, pixel count, and renderer.
- [x] Enforce ZIP-bomb protections before and during expansion. Archive processing now applies compressed-size, entry-count, entry-size, total-expanded-size, path, and duplicate-entry limits while streaming.

### High-priority architectural gaps

- [ ] **Partially complete:** Add autosave lifecycle and storage management.
  - [x] Retain only the five newest recovery projects.
  - [x] Use hash-qualified asset-blob keys and prune superseded, deleted, orphaned, and corrupt records.
  - [x] Validate recovery documents and verify recovered asset size and SHA-256 before restoration.
  - [ ] Report storage usage/quota and failed persistence clearly to the user.
  - [ ] Request persistent browser storage where supported.
  - [ ] Add recovery-management controls.
  - [ ] Add multi-tab locking or conflict detection.
- [x] Eliminate linked-project stale-reference risk. Cached linked-file matches are invalidated after replacement/relinking and are rechecked against current byte length and SHA-256 before save.
- [x] Make asset removal reliably undoable at the supported project size and make bulk removal one history entry. Retained bytes now cover the 256 MB project limit.
- [x] Split the root component into dedicated project-I/O, persistence, recovery, export, asset, image-session, editor-session, page-workflow, preferences, lifecycle, toolbar, file-input, sidebar, dialog, properties-panel, layout-panel, and editor-shell modules. The canvas page and crop layers and the global stylesheet are also split along functional boundaries. `App.svelte` is 545 lines, down from 2,566, and now focuses on application composition and cross-feature coordination; executable component and stylesheet modules stay around the 500-line target. Large layout-definition files remain declarative-data exceptions.
- [x] Load noncritical layout definitions and editor workflows on demand. Default two- and three-frame layouts and the canvas editor remain eager for first-paint usability; layout groups 4–11 share one deferred 4.94 kB gzip catalog warmed on layout-control hover or focus. Archive, linked-project, recovery, and export implementations also load on demand. Konva remains eager in a separately cacheable chunk. The larger HEIC decoder is isolated in its own optional chunk and loads only when a HEIC/HEIF asset needs decoding.
- [ ] Add offline/PWA support. Project data is local, but the application has no service worker or installable offline shell.
- [ ] Bring release engineering beyond prototype status.
  - [ ] Set a real package/release version instead of `0.0.0`.
  - [ ] Replace the template README with product, privacy, support, and release documentation and resolve its legal/attribution notes.
  - [ ] Normalize repository formatting and add the formatter to CI verification.

## First-release collage-builder assessment

### Core usability deficiencies

- [ ] **Partially complete:** Make the editor fully keyboard- and assistive-technology accessible.
  - [x] Remove hidden file inputs from the tab and accessibility order.
  - [x] Expose named, focusable canvas-frame controls with content and selection state.
  - [x] Provide visible keyboard focus and a sensible initial focus target.
  - [ ] Add keyboard equivalents for layout-divider manipulation and graphical crop handles.
  - [ ] Verify selection/status announcements with screen readers.
  - [ ] Complete manual contrast and assistive-technology testing.
- [x] Correct the initial Undo/Redo state. Both controls now use subscribed store values and are disabled on a blank project.
- [ ] Coalesce continuous padding, gap, radius, and shadow adjustments into one undo entry per interaction rather than one snapshot per input event.
- [x] Add export cancellation and resolution-quality warnings. Multi-page rendering can be cancelled between pages, and exports warn when placed images will be enlarged beyond their source resolution.
- [ ] **Partially complete:** Establish editor/export visual parity testing.
  - [x] Verify exact exported frame colors and configured gap pixels.
  - [x] Verify a real photographic image through import, thumbnailing, crop adjustment, canvas rendering, and exported-pixel comparison.
  - [x] Exercise the photographic and pixel-parity cases in Chromium, Firefox, and WebKit.
  - [ ] Add pixel assertions for polygon clipping, corner radius, transparency, and shadows.
- [x] Add HEIC/HEIF photo import. Originals remain untouched in saved projects while an on-demand, browser-readable derivative powers thumbnails, editing, and export; unsupported variants receive a conversion-oriented error.
- [x] Add JPEG export with a user-controlled 1–100 quality setting. PNG remains available, and JPEG exports flatten transparent areas to white with an explicit warning.
- [ ] Add fast population tools such as fill-empty-frames, shuffle, or optional automatic assignment after multi-image import.
- [ ] Add practical page presets for square, portrait, landscape, print, and common social-media formats, with DPI guidance where relevant.
- [ ] Add usage navigation from an image to the pages and frames where it appears; the image manager currently reports only a usage count.
- [ ] Resolve scope drift before adding more advanced layout features. Finish onboarding, storage management, recovery choices, and the remaining accessibility work before expanding polygon/splitter functionality.

## Release validation

- [x] Type check, lint, unit tests, and production build pass with `npm run verify`.
- [x] Run the production dependency audit with zero known production vulnerabilities.
- [x] Run the Playwright smoke scenarios in Chromium, Firefox, and WebKit.
- [x] Complete a live desktop visual/focus pass with no console errors.
- [ ] Manually import representative JPEG, PNG, WebP, HEIC/HEIF, and large real-photo files and confirm crop bounds, corner clipping, transparency, and shadows.
- [ ] Verify save/open and automatic recovery manually with a large multi-page project.
- [ ] Test current-page, all-pages, and range export manually at normal and large resolutions.
- [ ] Profile a production-scale 100-image/25-page project using real photo-sized inputs and document timing and memory limits. The existing benchmark uses tiny synthetic images.
- [ ] Complete keyboard-only, screen-reader, contrast, zoom, and reduced-motion release audits.

## Repeatable checks

- Run `npm run verify` for type checking, linting, unit tests, and the production build.
- Run `npm run test:e2e` for the normal cross-browser smoke suite.
- Run `npm run test:benchmark` in Chromium for the synthetic 100-image/25-populated-page regression scenario. It exports a 1920 px ZIP and reports import, page creation, export and per-page render timing, renderer selection, long tasks, and available Chromium heap figures; treat it as a regression signal rather than a production-scale result.
- Before release, use representative real photos to check every remaining manual item above.

### Latest synthetic export baseline

On 2026-09-04, Chromium 151.0.7922.34 on Windows 10.0.26200 (Intel Core i5-13600K, 20 logical CPUs, 32 GB RAM) imported the 100 synthetic images in 964 ms, created 25 populated pages in 2,498 ms, and exported their 1920 px PNG ZIP in 631 ms. All 25 page renders used the worker (465 ms total; 30 ms slowest page). Chromium reported 64 MB of used JS heap and one 111 ms long task across the complete import/create/export workflow. This baseline uses tiny synthetic source images; the separate representative-real-photo profile remains a release-validation item.

## Current browser notes

The core editor targets current Chrome, Edge, Firefox, and Safari. Save uses the native File System Access picker when available so `.collage` and `.collage.json` appear as separate file types. Other browsers use an in-app format dialog and download fallback. PNG and JPEG exports remain download-based.

On the current Windows test host, Firefox content processes require the one-run `MOZ_DISABLE_CONTENT_SANDBOX=1` diagnostic override because the host blocks Firefox's child-process sandbox. The project configuration does not disable browser sandboxing.
