# Release checklist

Use this checklist for each release, alongside the commands in the [release guide](RELEASING.md). Record the version, browsers, and any unresolved issues in the release notes or a tracking issue.

## Automated checks

- [ ] Install the locked dependencies and run `bun run verify`.
- [ ] Run `bun run test:e2e` in Chromium, Firefox, and WebKit.
- [ ] Run `bun run test:offline` for offline setup and reload.
- [ ] Run `bun audit --prod` and review any reported dependency issues.
- [ ] Run `bun run test:benchmark` when changing import, rendering, storage, or export performance.

## Editing

- [ ] Try the welcome screen, add photos, and reopen the quick start.
- [ ] Import representative JPEG, PNG, WebP, and HEIC/HEIF photos, including large files. Check that unsupported or damaged files show a helpful error.
- [ ] Choose layouts for small and large photo counts, crop photos, swap frames, and adjust dividers.
- [ ] Check spacing, rounded corners, background suggestions, transparency, and shadows in both the editor and exported images.
- [ ] Add, rename, duplicate, reorder, clear, and delete pages.
- [ ] Check undo and redo after imports, page changes, photo replacement, removal, and style edits.

## Save and recovery

- [ ] Save and reopen a large, multi-page `.collage` project.
- [ ] Save and reopen a linked `.collage.json` project. Try moved, renamed, and missing photos.
- [ ] Check native **Save** and **Save As…** in Chrome and Edge, including file-handle reuse and permission prompts. Check download-based saves in other browsers.
- [ ] Reload with unsaved work and try each recovery choice: continue, start a new collage, and browse saved drafts.
- [ ] Check recovery removal, storage warnings, and conflicts between browser tabs. Confirm downloaded project files are unaffected.
- [ ] Try opening a damaged project and confirm the current collage is preserved.

## Export and offline access

- [ ] Export the current page, all pages, and a range as PNG and JPEG, at normal and large sizes.
- [ ] Check filename templates, page numbering, resolution warnings, and transparent backgrounds.
- [ ] Cancel a multi-page export and confirm you can export again.
- [ ] Visit the built app while online, wait for **App available offline**, then disconnect and reload.
- [ ] Check the app under its deployed subdirectory, and try applying an available app update.

## Accessibility and browser layout

- [ ] Use the editor with only a keyboard: tabs, photo selection, cropping, dividers, page actions, save, recovery, and export.
- [ ] Check focus visibility and restoration, dialog dismissal, and that shortcuts don't edit the collage behind a dialog.
- [ ] Check names, selection changes, progress, errors, and recovery messages with NVDA or VoiceOver.
- [ ] Check text and control contrast in both themes, including selected, focused, disabled, and error states.
- [ ] Check browser zoom and reduced-motion settings.
- [ ] Check the left sidebar at 768–959 pixels wide and both sidebars at 960 pixels and above.

## Large projects and release files

- [ ] Profile archive opening/saving, repeated page switching, and high-resolution export with real photos. Include originals around 24 megapixels when checking decoded-image memory.
- [ ] Check for browser-console errors during the main workflows.
- [ ] Confirm the build includes `LICENSE.txt`, `THIRD_PARTY_NOTICES.md`, and `licenses/`.
- [ ] Complete the HEIC decoder license review described in the [release guide](RELEASING.md).
- [ ] Confirm the changelog, version, tag, and deployed build refer to the same release.

Core workflows are tested in Chromium, Firefox, and WebKit. Native file pickers and assistive technology still need manual checks in the actual browsers. Phone-sized windows and touch-first editing are outside the currently supported scope.
