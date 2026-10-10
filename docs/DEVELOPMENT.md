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
