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
