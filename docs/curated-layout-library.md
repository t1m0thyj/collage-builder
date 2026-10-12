# Layout library

The layout generator in `src/lib/layouts/curatedCatalog.ts` creates rectangular photo arrangements for 2–16 photos. Counts 2–10 offer a broad selection; counts 11–16 share a smaller group in the picker. The layouts are original and don't depend on a third-party preset library.

## How layouts are chosen

The generator builds candidates from familiar arrangements:

- Grids, rows, and columns.
- Layouts with a larger featured photo at the side, top, bottom, or center.
- Featured strips and magazine-style arrangements.
- Asymmetric mosaics and symmetric patterns.

Candidates must pass geometry and size checks. Layouts that differ only in divider positions are treated as one structure, with balanced default proportions. A similarity filter removes arrangements whose divider patterns are too alike.

The library keeps every canonical orientation for two through four photos and every useful regular grid. For higher counts, it adds a smaller selection of featured layouts. A selected side feature also gets an opposite orientation and a centered alternative.

The similarity threshold is `min(1, 2.5 / photoCount)`, so denser layouts need more distinct divider patterns. For eight through ten photos, each slot must cover at least `0.38 / photoCount` of the canvas, and no layout family may make up half the selection.

Grids appear first, ordered by even photo areas and simple boundaries. Featured and magazine-style layouts follow, with long strips at the end. The number of layouts comes from these rules rather than a fixed target for each photo count.

## Regenerate the definitions

Run:

```sh
bun run generate:layouts
```

This updates the committed TypeScript files in `src/lib/layouts/definitions/`. Normal builds use those files without running the generator. Tests check that the generated definitions match the source geometry.

Every layout must convert to a split tree so users can drag and snap its dividers. IDs use `generated-{photoCount}-t{topologyHash}`; the hash describes the editable split structure. Reordering the picker or changing default divider positions doesn't change an ID.

Two- and three-photo definitions load at startup. `optional.ts` groups the remaining counts into a bundle loaded on demand. See the [code-loading decision](adr/0004-code-splitting.md) for the reasoning.
