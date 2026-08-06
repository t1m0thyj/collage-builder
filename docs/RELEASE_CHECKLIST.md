# Release checklist

- [x] Type check, lint, unit tests, and production build pass.
- [ ] Run the Playwright smoke test in Chromium, Firefox, and WebKit.
- [ ] Manually import JPEG, PNG, and WebP images and confirm crop bounds, corner clipping, and shadows.
- [ ] Verify save/open and automatic recovery with a multi-page project.
- [ ] Test current, all-pages, and range PNG export at normal and large resolutions.
- [ ] Profile a 100-image / 25-page project and document the measured limits.
- [ ] Complete keyboard-only, focus-order, screen-reader, contrast, and reduced-motion audit.

## Current browser notes

The core editor targets current Chrome, Edge, Firefox, and Safari. The application uses browser downloads for Save and Export. File System Access API enhancements are intentionally not enabled yet, so Save behaves consistently as a download across browsers.
