# Curated layout library

`src/lib/layouts/curatedCatalog.ts` deterministically builds a naturally sized library of rectangular
photo-collage presets for square canvases. It provides the dense primary catalog for 2 through 10 photos plus a
compact collection spanning every count from 11 through 16. The implementation is original
and has no third-party preset dependency.

The generator uses distinct composition grammars rather than unconstrained recursive splitting:

- traditional grids, rows, and columns;
- side, top, bottom, and offset heroes;
- center heroes and framed centers;
- feature strips and editorial magazine arrangements;
- asymmetric mosaics and symmetric compositions.

Candidate layouts must pass geometry and basic aesthetic constraints before selection. Candidates
that differ only in divider position are grouped as one editable topology, and the best-looking
default proportions are retained. A divider-pattern similarity filter then removes visually
redundant topologies without relying on fixed per-photo-count quotas. Every canonical orientation is
kept for two through four photos, and every useful regular factor grid is guaranteed. Counts above
ten add only a compact decorative highlight set beyond those grids. When that highlight set contains
a side hero, its opposite orientation and a center-hero alternative are included as meaningful
structural choices. The maximum allowed edge-pattern similarity is `min(1, 2.5 / photoCount)`, so the
library demands progressively more visual difference as layouts become denser. For eight through ten
photos, the minimum slot area is `0.38 / photoCount`, and no one family may occupy half the result.
Output ordering and IDs are deterministic. The picker shows a familiar grid first, then cycles
through featured and editorial compositions before placing long strips at the end.

Run `npm run generate:layouts` to rebuild the runtime files in
`src/lib/layouts/definitions/`. The generator requires every tiling to convert to a native split
tree so all preset dividers can be dragged and snapped consistently. Generated IDs use the
`generated-{photoCount}-t{topologyHash}` namespace. The hash follows the editable split structure,
so changing picker order or default divider proportions does not reassign an ID. The generator
emits the established runtime structure: counts two and three are eager, and `optional.ts`
collects counts four through sixteen into one lazy production chunk.

The generated TypeScript files are committed so normal builds do not run code generation. CI tests
verify that all generated definitions reproduce the normalized source geometry exactly.
