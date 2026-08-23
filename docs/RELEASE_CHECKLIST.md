# Release checklist

- [x] Type check, lint, unit tests, and production build pass. Run locally with `npm run verify`.
- [ ] Run the Playwright smoke test in Chromium, Firefox, and WebKit. GitHub Actions runs this on pull requests and pushes to `main`.
- [ ] Manually import JPEG, PNG, and WebP images and confirm crop bounds, corner clipping, and shadows.
- [ ] Verify save/open and automatic recovery with a multi-page project.
- [ ] Test current, all-pages, and range PNG export at normal and large resolutions.
- [ ] Profile a 100-image / 25-page project and document the measured limits.
- [ ] Complete keyboard-only, focus-order, screen-reader, contrast, and reduced-motion audit.

## Repeatable checks

- Run `npm run test:e2e` for the normal smoke suite. It validates JPEG/PNG/WebP import, recovery, keyboard focus restoration, reduced-motion behavior, and normal/4K PNG dimensions.
- Run `npm run test:benchmark` in Chromium for the 100-image/25-page scenario. Record its timing, device, browser version, and any memory warnings in the release notes; use it to detect regressions rather than as a fixed pass/fail threshold.
- Before a release, use real photos to check crop bounds, corner clipping, shadows, the downloaded PNG contents, screen-reader output, and visual contrast. These are not fully reliable to automate.

## Current browser notes

The core editor targets current Chrome, Edge, Firefox, and Safari. Save uses the native File System Access picker when available so `.collage` and `.collage.json` appear as separate file types. Other browsers use an in-app format dialog and download fallback. PNG export remains download-based.
