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

- [x] Add autosave lifecycle and storage management.
  - [x] Retain only the five newest recovery projects.
  - [x] Use hash-qualified asset-blob keys and prune superseded, deleted, orphaned, and corrupt records.
  - [x] Validate recovery documents and verify recovered asset size and SHA-256 before restoration.
  - [x] Report storage usage/quota and failed persistence clearly to the user.
  - [x] Request persistent browser storage where supported.
  - [x] Add recovery-management controls.
  - [x] Add multi-tab locking or conflict detection.
- [x] Eliminate linked-project stale-reference risk. Cached linked-file matches are invalidated after replacement/relinking and are rechecked against current byte length and SHA-256 before save.
- [x] Make asset removal reliably undoable at the supported project size and make bulk removal one history entry. Retained bytes and history eviction share the 1 GB project limit.
- [x] Separate project I/O, persistence, recovery, export, asset, image-session, editor-session, page workflow, preferences, lifecycle, toolbar, file input, sidebar, dialogs, properties, layouts, and editor-shell responsibilities. `App.svelte` remains the composition boundary for cross-feature coordination. Reassess ownership and cohesion when a feature changes instead of using file-length targets as an architectural measure.
- [x] Load noncritical layout definitions and editor workflows on demand. Default two- and three-frame layouts and the canvas editor remain eager for first-paint usability; layout groups 4–11 share one deferred 4.94 kB gzip catalog warmed on layout-control hover or focus. Archive, linked-project, recovery, and export implementations also load on demand. Konva remains eager in a separately cacheable chunk. The larger HEIC decoder is isolated in its own optional chunk and loads only when a HEIC/HEIF asset needs decoding.
- [x] Add offline support without installability. A generated service worker precaches the complete production application bundle, including lazy chunks and public assets, and supports root or subdirectory deployments. Project data remains local; no web app manifest or install prompt is included.
- [x] Bring release engineering beyond prototype status.
  - [x] Set the initial package and release version to `0.1.0`.
  - [x] Replace the template README with concise product documentation linked to separate usage, privacy, support, security, development, release, and attribution documents. License the project under Apache-2.0 and remove unused starter artwork.
  - [x] Normalize repository text formatting with EditorConfig, Git attributes, explicit LF handling in Prettier, and a named formatting gate in CI.

## First-release collage-builder assessment

### Core usability deficiencies

- [ ] **Partially complete:** Make the editor fully keyboard- and assistive-technology accessible.
  - [x] Remove hidden file inputs from the tab and accessibility order.
  - [x] Expose named, focusable canvas-frame controls with content and selection state.
  - [x] Provide visible keyboard focus and a sensible initial focus target.
  - [x] Add keyboard equivalents for layout-divider manipulation and graphical crop handles.
  - [x] Add a keyboard bypass to the canvas, prevent global editor shortcuts from firing behind open dialogs, and improve muted-text and dark-dialog control contrast.
  - [x] Keep primary controls available at a 960 CSS-pixel viewport (equivalent to 200% zoom on a 1920 px desktop viewport) and honor reduced-motion preferences.
  - [x] Implement arrow-key, Home, and End navigation with roving focus and tab-panel associations for the Layouts/Images and photo-count tabs.
  - [ ] Verify selection/status announcements with screen readers. Persistent live-region wiring and automated interaction coverage are in place; an NVDA/VoiceOver pass remains.
  - [ ] Complete manual contrast and assistive-technology testing.
- [x] Correct the initial Undo/Redo state. Both controls now use subscribed store values and are disabled on a blank project.
- [x] Coalesce continuous padding, gap, radius, and shadow adjustments into one undo entry per interaction rather than one snapshot per input event.
- [x] Add export cancellation and resolution-quality warnings. Multi-page rendering can be cancelled between pages, and exports warn when placed images will be enlarged beyond their source resolution.
- [ ] **Partially complete:** Establish editor/export visual parity testing.
  - [x] Verify exact exported frame colors and configured gap pixels.
  - [x] Verify a real photographic image through import, thumbnailing, crop adjustment, canvas rendering, and exported-pixel comparison.
  - [x] Exercise the photographic and pixel-parity cases in Chromium, Firefox, and WebKit.
  - [x] Add pixel assertions for corner radius, transparency, and shadows. Polygon clipping is deferred because the shipped editor exposes rectangular frames only.
- [x] Add HEIC/HEIF photo import. Originals remain untouched in saved projects while an on-demand, browser-readable derivative powers thumbnails, editing, and export; unsupported variants receive a conversion-oriented error.
- [x] Add JPEG export with a user-controlled 1–100 quality setting. PNG remains available, and JPEG exports flatten transparent areas to white with an explicit warning.
- [ ] Add fast population tools such as fill-empty-frames, shuffle, or optional automatic assignment after multi-image import.
- [ ] Add practical page presets for square, portrait, landscape, print, and common social-media formats, with DPI guidance where relevant.
- [ ] Add usage navigation from an image to the pages and frames where it appears; the image manager currently reports only a usage count.
- [ ] **Partially complete:** Resolve scope drift before adding more advanced layout features.
  - [x] Add first-run onboarding with direct import/open actions and a persistent way to reopen it.
  - [x] Add explicit startup recovery choices: restore, retain and start blank, or review local copies.
  - [x] Finish bounded storage management, persistence guidance, corrupt-copy removal, and multi-tab conflict handling.
  - [ ] Complete the remaining manual screen-reader, contrast, zoom, and reduced-motion release audits listed below.

## Release validation

- [x] Type check, lint, unit tests, and production build pass with `npm run verify`.
- [x] Run the production dependency audit with zero known production vulnerabilities.
- [x] Run the Playwright smoke scenarios in Chromium, Firefox, and WebKit.
- [x] Complete a live desktop visual/focus pass with no console errors.
- [ ] Manually import representative JPEG, PNG, WebP, HEIC/HEIF, and large real-photo files and confirm crop bounds, corner clipping, transparency, and shadows.
- [ ] Verify save/open and automatic recovery manually with a large multi-page project.
- [ ] Test current-page, all-pages, and range export manually at normal and large resolutions.
- [x] Run the representative-photo benchmark with 100 distinct imports and 25 populated pages. The 1536×1024 fixture completed in approximately 7.4 seconds for import and 6.3 seconds for export on the review host.
- [ ] Validate active-page decoded-image memory with realistic high-resolution originals (for example, ten 24-megapixel photos). The current benchmark verifies workflow scale and sequential decoding/export, but not this worst-case pixel capacity.
- [ ] Complete keyboard-only, screen-reader, contrast, zoom, and reduced-motion release audits.

## Repeatable checks

- Run `npm run verify` for type checking, linting, unit tests, and the production build.
- Run `npm run test:e2e` for the normal cross-browser smoke suite.
- Run `npm run test:offline` for the production-build offline reload and complete-precache check in Chromium.
- Run `npm run test:benchmark` in Chromium for the representative-image 100-image/25-populated-page regression scenario. It exports a 1920 px ZIP and reports import, page creation, export and per-page render timing, renderer selection, long tasks, and available Chromium heap figures.
- Before release, use representative real photos to check every remaining manual item above.

### Superseded synthetic export baseline

On 2026-09-04, Chromium 151.0.7922.34 on Windows 10.0.26200 (Intel Core i5-13600K, 20 logical CPUs, 32 GB RAM) imported the 100 synthetic images in 964 ms, created 25 populated pages in 2,498 ms, and exported their 1920 px PNG ZIP in 631 ms. All 25 page renders used the worker (465 ms total; 30 ms slowest page). Chromium reported 64 MB of used JS heap and one 111 ms long task across the complete import/create/export workflow. These timing results are retained only as a historical synthetic baseline; re-run the representative-fixture benchmark before release.

## Current browser notes

The core editor targets current Chrome, Edge, Firefox, and Safari. Save uses the native File System Access picker when available so `.collage` and `.collage.json` appear as separate file types. Other browsers use an in-app format dialog and download fallback. PNG and JPEG exports remain download-based.

The first release is desktop-only and supports viewports at least 960 CSS pixels wide. Mobile, narrow-screen, and touch-first interaction support is not currently claimed or included in release validation.

On the current Windows test host, Firefox content processes require the one-run `MOZ_DISABLE_CONTENT_SANDBOX=1` diagnostic override because the host blocks Firefox's child-process sandbox. The project configuration does not disable browser sandboxing.
