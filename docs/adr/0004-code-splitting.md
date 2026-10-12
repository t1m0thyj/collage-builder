# ADR 0004: Load code as the editor needs it

Status: accepted and implemented.

The canvas editor and default two- and three-photo layouts load at startup. They're needed to show and edit the first page, so loading them later would delay getting started.

Layouts for 4–16 photos share one optional bundle. It starts loading when a photo-count control is hovered or focused. Keeping those layouts together avoids extra requests as users explore different counts, especially the combined 11+ group.

Project archives, linked projects, recovery, and export code load when those workflows begin. The HEIC decoder loads when a HEIC/HEIF photo needs decoding.

Konva loads at startup in a separate `canvas-vendor` bundle that the browser can cache independently. Small UI and Svelte dependencies stay together in the app bundle to avoid many tiny startup requests.

Offline setup downloads all of these bundles so every feature remains available without a connection. Check a fresh build when reviewing bundle sizes; they change as the app evolves.
