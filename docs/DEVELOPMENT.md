# Development

## Get started

Use the Bun version in `.bun-version` (currently 1.4.3; minimum supported version 1.4.0), then install dependencies and start the development server:

```sh
bun install --frozen-lockfile
bun run dev
```

The frozen install uses the versions recorded in `bun.lock`. Package scripts and `bunfig.toml` run the JavaScript tools with Bun, including nested processes.

To build or host the app, see [offline use and self-hosting](OFFLINE.md). For publishing a version, see [releasing](RELEASING.md).

## Check your changes

| Command                  | What it checks                                             |
| ------------------------ | ---------------------------------------------------------- |
| `bun run format`         | Prettier formatting                                        |
| `bun run format:write`   | Applies Prettier formatting                                |
| `bun run check`          | Svelte and TypeScript                                      |
| `bun run lint`           | ESLint                                                     |
| `bun run test`           | Unit tests with Vitest                                     |
| `bun run test:e2e`       | Browser tests in Chromium, Firefox, and WebKit             |
| `bun run test:offline`   | Offline access from a built app in Chromium                |
| `bun run test:benchmark` | Photo import and multi-page export performance in Chromium |
| `bun run verify`         | Formatting, type checks, lint, unit tests, and a build     |

Use `bun run test` for Vitest; `bun test` starts Bun's own test runner.

Install Playwright's browsers before running browser tests:

```sh
bun x --bun playwright install --with-deps
```

While fixing a feature, run its spec or filter by test name. For example:

```sh
bun run test:e2e tests/e2e/page-tabs.spec.ts --project=chromium
```

On Windows, if Playwright cannot stop Vite and reports `taskkill: Access denied`, start the server in a separate terminal first:

```sh
bun run dev --host 127.0.0.1 --port 4174
```

Local test runs reuse that server. Stop it when you're finished. CI starts and stops its own server.

Run `bun run verify` before opening a pull request. Add tests for behavior changes, and run the relevant browser tests when changing interactions. Keep test artifacts in the ignored `test-results/` or `playwright-report/` folders so Vite doesn't reload while tests are running.

Repository text uses UTF-8, LF line endings, two-space indentation, and a final newline. The editor and formatter settings are in `.editorconfig`, `.gitattributes`, and `.prettierrc.json`.

## Find your way around

| Folder                       | Contents                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| `src/lib/app/`               | Editor workflows, preferences, and app lifecycle             |
| `src/lib/components/app/`    | Toolbar, sidebars, page tabs, dialogs, and properties        |
| `src/lib/components/editor/` | Canvas, cropping, and divider interactions                   |
| `src/lib/components/ui/`     | Shared UI controls                                           |
| `src/lib/domain/`            | Project types, validation, geometry, and image import rules  |
| `src/lib/layouts/`           | Layout catalog, generated definitions, loading, and previews |
| `src/lib/state/`             | Project state and undo history                               |
| `src/lib/persistence/`       | Project files, browser storage, previews, and recovery       |
| `src/lib/render/`            | Canvas rendering and image export                            |
| `src/lib/utils/`             | Shared helpers                                               |
| `src/styles/`                | App styles                                                   |
| `tests/unit/`                | Module tests                                                 |
| `tests/e2e/`                 | Browser tests and their helpers                              |
| `tests/fixtures/`            | Test photos and other inputs                                 |
| `build/`                     | Offline support and release-file generation                  |
| `scripts/`                   | Layout generation                                            |
| `public/`                    | Files copied directly into the build                         |
| `dist/`                      | Build output, ignored by Git                                 |
| `docs/adr/`                  | Architecture decisions                                       |

`App.svelte` connects the editor's workflows. Keep browser APIs and feature logic in the relevant modules, and update this map if you move them.

See the [layout library guide](curated-layout-library.md) before changing preset generation. The generated definitions are committed; normal builds don't regenerate them.

## Project files and resource limits

These limits keep large or malformed projects from allocating unbounded resources:

| Resource         | Limit                                                                                        | Source                                                              |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Page dimensions  | 64–16,384 pixels per side, up to 64 megapixels                                               | `src/lib/domain/pageLimits.ts`                                      |
| Editor canvas    | 8,192 pixels per side, up to 16 megapixels per backing surface, including device pixel ratio | `src/lib/render/editorSurface.ts`                                   |
| Project          | 256 pages, 4,094 photos, up to 1 GiB of original photo data                                  | `src/lib/domain/documentLimits.ts`, `src/lib/persistence/limits.ts` |
| Page layout      | 256 frames, 1,024 layout nodes, 32 levels, 64 points per polygon                             | `src/lib/domain/documentLimits.ts`                                  |
| Document parsing | 128 levels and 500,000 values                                                                | `src/lib/domain/documentLimits.ts`                                  |
| Recovery drafts  | Five projects, up to 2 GiB of saved data                                                     | `src/lib/persistence/recoveryRetention.ts`                          |
| Cached previews  | 200 MiB, separate from recovery drafts                                                       | `src/lib/persistence/previewCache.ts`                               |

The canvas limit applies to each surface, not all browser memory combined. Konva also creates hit and buffer canvases. When zoom would exceed the limit, the editor reduces the effective scale and shows a notice; page dimensions and export resolution stay the same. Canvas resizing shrinks dimensions before growing them to avoid temporary oversized allocations.

Imports and recovery pass through `migrateDocument` for structural checks, schema validation, and geometry checks. Opening a project stages its document and photos before replacing the current project. Rejected size or spacing edits leave the project and undo history unchanged.

## Photos, previews, and recovery

Original photos remain unchanged. The editor prepares smaller previews and loads images for the active page as needed. The shared preparation queue runs up to three jobs and prioritizes the active page.

Derived previews are cached in IndexedDB and can be regenerated from originals. If recovery runs out of storage, it removes disposable previews and retries once; it does not delete originals for that retry.

Recovery saves count original photo bytes, document JSON, and recovery thumbnails toward the 2 GiB limit. The project being saved is retained; older copies are removed in the same transaction. Offline app files, cached previews, and browser storage overhead are outside that limit. The browser's storage quota can be smaller than the app's limits.

File handles last only for the current session. Linked-photo matching checks file size and SHA-256, using saved paths and names to find likely matches first. Renamed or moved files must still match the saved photo bytes. Updated names and paths are saved as one undoable edit.

## Saving and exporting

Embedded project saves stream ZIP data in 256 KiB slices to a native file destination. Repeated saves reuse photo checksums for unchanged original Blobs, but still write the complete archive. Browsers using downloads collect the archive in a Blob before handing it off. A native save is marked complete only after the file closes successfully; failed or outdated writes are aborted.

Explicit save and open operations lock editing while they run. A progress dialog appears after 200 ms, showing completed work rather than an estimated finish time. File and folder pickers can be cancelled; processing cancellation is not currently supported.

Exports use a worker with OffscreenCanvas where available. The main-thread fallback also uses OffscreenCanvas when supported; HTML canvas is the compatibility fallback. PNG repeatability checks compare bytes within the same browser and rendering environment.

Multiple-page filenames support `{title}` for the page name and `{number}` for its original page number. The default is the collage title followed by `-{number}`. Numbers have at least two digits, and double braces escape literal braces. Filenames are checked for duplicates and invalid characters before rendering. Export ZIP timestamps use the document's `updatedAt` value.

For performance work, run `bun run test:benchmark` with representative photos. It imports 100 photos, fills 25 pages, and exports a 1920-pixel ZIP, reporting render times and available memory figures. Record the browser, device, photo sizes, and commit when comparing runs.

## Browser layout and accessibility

The editor needs a browser window at least 768 CSS pixels wide. Below 960 pixels, the left sidebar opens as an overlay from the top-left menu button. At wider sizes, it stays beside the canvas and remembers its width.

Keep focus restoration, keyboard alternatives, and status announcements working when changing editor controls. Open dialogs should block editor shortcuts. Use the [release checklist](RELEASE_CHECKLIST.md) for manual keyboard, screen-reader, zoom, and contrast checks.
