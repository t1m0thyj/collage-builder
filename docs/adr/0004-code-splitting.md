# ADR 0004: UX-aware code splitting

The canvas editor and the default two- and three-frame layout definitions remain in the initial dependency graph. They are required to display and edit the first page, so deferring them would add a network round trip to the primary experience.

Layout groups 4–11 use one shared deferred catalog. It begins loading when a layout-count control is hovered or focused, before selection. Eight independent chunks were rejected: although each was only 0.78–1.29 kB gzip, exploring several frame counts would incur repeated request latency. The combined catalog is only 4.94 kB gzip because the similar definitions compress well together. Project archive, linked-project, recovery, and export implementations still load when their corresponding workflow begins.

Konva remains eagerly requested because the editor is the product's main surface. It is emitted as a separate `canvas-vendor` chunk for long-term caching rather than turned into an on-demand editor boundary. Small UI and Svelte dependencies remain in the application chunk to avoid a waterfall of tiny startup requests.

The production build changed from one 818.96 kB application chunk (215.51 kB gzip) to a 480.90 kB application chunk (135.36 kB gzip) plus a 181.32 kB eager canvas-vendor chunk (54.53 kB gzip). The optional layout catalog is 86.01 kB minified but only 4.94 kB gzip. These measurements favor a responsive first editor paint and low request count over maximizing the number of chunks.

Status: accepted and implemented.
