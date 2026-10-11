# Development

## Setup

Use Node.js 22 and npm. Install the exact locked dependencies, then start Vite:

```sh
npm ci
npm run dev
```

## Checks

| Command                | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `npm run format`       | Check Prettier formatting                                         |
| `npm run format:write` | Apply Prettier formatting                                         |
| `npm run check`        | Check Svelte and TypeScript                                       |
| `npm run lint`         | Run ESLint                                                        |
| `npm test`             | Run unit tests once                                               |
| `npm run test:e2e`     | Run Playwright in Chromium, Firefox, and WebKit                   |
| `npm run test:offline` | Verify the production offline path in Chromium                    |
| `npm run verify`       | Run formatting, static checks, unit tests, and a production build |

CI runs the formatting gate explicitly before the remaining verification steps. Repository text uses UTF-8, LF line endings, two-space indentation, and a final newline as defined by `.editorconfig`, `.gitattributes`, and `.prettierrc.json`.

Browser tests are grouped by feature in `tests/e2e/` (`page-tabs`, `assets`, `canvas`, `editor-shell`, `export`, `projects`, and `recovery`). During a fix, run the relevant spec file or filter by test name. For example:

```sh
npx playwright test tests/e2e/page-tabs.spec.ts --project=chromium
```

In restricted Windows environments where Playwright cannot stop its Vite process (`taskkill: Access denied`), start `npm run dev -- --host 127.0.0.1 --port 4174` in a separate terminal before running browser tests. Local Playwright runs reuse that server; stop it when finished. CI still starts its own server.

Run the broader suite when the change affects several features or a required verification gate calls for it.

## Project map

- `src/lib/app/`: application workflows and lifecycle
- `src/lib/components/`: editor and UI components
- `src/lib/state/`: project data, history, and persistence state
- `src/lib/persistence/`: project import/export formats, archives, and browser recovery storage
- `src/lib/render/`: canvas and export rendering
- `tests/`: unit and browser tests
- `build/`: build-time service-worker support
- `docs/adr/`: architecture decisions

Keep browser-only APIs behind focused modules, add tests for behavior changes, and run `npm run verify` before opening a pull request. Update this map when moving responsibilities; it describes the current repository, not a planned architecture.

## Project persistence and performance

Page dimensions share one policy in `src/lib/domain/pageLimits.ts`: 64–16,384 pixels
per side and at most 64 megapixels per page. Schema parsing applies it to embedded and
linked imports and recovery; document invariants cover direct installation and local
edits. Resize proposals are validated before changing history, and rejected input drafts
are restored while the existing error announcement explains the limit.

`src/lib/render/editorSurface.ts` caps each editor backing surface at 16 megapixels and
8,192 pixels per side, including the actual Konva scene pixel ratio and the ratio-1 hit
canvases. The budget includes viewport size, zoom, margins, and rounded stage dimensions.
Oversized zoom requests use a bounded effective scale with a visible notice; page data
and export resolution do not change. Stage resizing shrinks dimensions first to prevent
temporary over-allocation when Konva applies width and height separately. This is the
immediate allocation guard; viewport-only rendering remains a separate follow-up.

Document imports and recovery use `migrateDocument` for iterative preflight, schema
validation, and semantic invariants before installation. Shared complexity limits in
`documentLimits.ts` allow 256 pages, 256 frames per page, 1,024 layout nodes per page,
32 layout levels, and 64 points per polygon. The generic preflight bounds depth to 128
and visited values to 500,000 before recursive parsing. Linked and embedded documents
share the existing 4,094-photo and 1 GiB aggregate asset budgets. Asset-map identities,
grid containment, finite resolved geometry, and positive frame area are required.
Split weights are normalized before summing to avoid overflow.

Margin and spacing controls derive whole-pixel limits from the current page and layout.
Rejected discrete edits and previews leave the document, history, and current gesture
unchanged. The controls restore rejected drafts and associate inline feedback with the
field. Frame-owned Delete/Backspace preserves focus and undo; open dialogs block editor
shortcuts. Both project-operation progress branches reference the visible phase for
their accessible name.

Preview caching, remembered-page preparation, and foreground save/load progress are implemented.
The shared preparation queue allows three jobs, with active-page work prioritized. Derived
previews have a 192 MiB cache budget, incremental writes, access metadata separate from image
Blobs, and reference cleanup. Undecodable previews regenerate from originals. Under recovery
quota pressure, autosave aborts the failed transaction, evicts disposable previews, and retries
the authoritative document/original write once. It never deletes originals to make that retry.

Explicit operations lock editing immediately and show the themed modal after 200 ms. Linked
folder matching reports photos checked, matches, and files verified, then preview preparation.
Progress reflects completed work, not an ETA. Processing cancellation is deliberately deferred;
file/folder pickers remain cancellable, and failed or superseded operations release the lock.

Native embedded saves stream store-only ZIP output from 256 KiB input slices directly to the
destination. Repeat saves reuse session-local CRC-32 metadata by immutable original Blob
identity; every save still reads and writes the complete current archive. A layout edit avoids
photo checksums; a new/replaced Blob needs its own checksum. Download fallback still collects a
complete archive Blob and reports browser handoff. A successful native close is required before
marking the project clean; source, write, close, and stale-revision failures abort temporary writes.

### Focused measurements

On the existing twelve-photo 4000 × 3000 JPEG Chromium recovery fixture, Continue to project
installation measured 651 ms cold and 131 ms warm. These are comparison fixtures, not device
speed guarantees.

A one-off save comparison on 2026-10-10 used headless Chromium 151 on this Windows workstation,
browser-local OPFS writable files, and twelve 4000 × 3000 JPEGs encoded at quality 0.86 from
`tests/fixtures/real-photo-still-life.png`. JPEG comments provided distinct originals. Total photo
bytes were 17,353,970 initially and 18,800,135 after adding a thirteenth photo. The buffered
comparison reconstructed full-Blob packaging followed by writing, with a fresh CRC pass each
save; the streaming path used the current checksum cache. Preparation/fixture creation was
outside the measured interval.

| Save         | Buffered total | Streaming total | Streaming photo bytes checksummed |
| ------------ | -------------- | --------------- | --------------------------------- |
| First        | 116.8 ms       | 107.1 ms        | 17,353,970                        |
| Layout only  | 111.5 ms       | 97.6 ms         | 0                                 |
| One added    | 122.6 ms       | 83.9 ms         | 1,446,165                         |
| One replaced | 119.1 ms       | 86.2 ms         | 1,446,165                         |

Every path read all original bytes. Streaming packaging and writes overlapped; their combined
times were 106.8, 97.4, 83.7, and 86.0 ms, with close taking 0.3, 0.2, 0.2, and 0.2 ms. Buffered
packaging took 66.4, 63.9, 69.4, and 68.1 ms; awaited writes took 36.4, 34.9, 39.3, and 37.8 ms;
close took 1.0, 0.1, 0.3, and 0.3 ms. Largest observed streaming write was 256 KiB, versus 2 MiB
from the collected Blob stream. The native implementation does not assemble a complete output
Blob; heap peaks were not measured. OPFS commit timings do not predict native picker disk latency,
and these single-pass results do not establish a general speedup percentage.

All eight outputs passed Python `zipfile` CRC checks and document/path/size/original SHA-256
verification. Streaming outputs also reopened with the app reader. Existing slow-sink coverage
checks backpressure; focused failure coverage checks source/write/close aborts and stale linked
saves. A manual Chromium check verified folder-modal locking and a quota-failure retry that
evicted previews while preserving the saved document and original bytes. No additional benchmark
suite or broad failure-injection matrix is required for this implementation.
