# ADR 0003: Browser support and file access

Status: accepted and implemented.

Chrome is the primary target. Core workflows are tested with Playwright in Chromium, Firefox, and WebKit. Edge and Safari need manual checks before releases. Native file access is used when the browser supports it; other browsers save through downloads.

File handles last only for the current session. Storing a handle doesn't guarantee permission to use it later, so recovery saves original photo bytes instead.

Derived previews are cached in IndexedDB to speed up later editing. They can be discarded and regenerated from the originals, and have their own storage limit separate from recovery drafts.
