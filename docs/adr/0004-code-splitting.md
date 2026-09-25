# ADR 0004: UX-aware code splitting

The canvas editor and the default two- and three-frame layout definitions remain in the initial dependency graph. They are required to display and edit the first page, so deferring them would add a network round trip to the primary experience.

Layout groups 4–16 share one optional chunk that begins loading when a layout-count control is hovered or focused. Keeping them together avoids separate requests when exploring several counts, especially in the combined 11+ group. Project archive, linked-project, recovery, and export implementations still load when their corresponding workflow begins.

Konva remains eagerly requested because the editor is the product's main surface. It is emitted as a separate `canvas-vendor` chunk for long-term caching rather than turned into an on-demand editor boundary. Small UI and Svelte dependencies remain in the application chunk to avoid a waterfall of tiny startup requests.

The generated definitions keep the existing eager defaults and shared optional catalog structure. Bundle sizes vary as the application changes; inspect a current production build when evaluating this decision again.

Status: accepted and implemented.
